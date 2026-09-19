// Run from backend/: node --test --experimental-test-module-mocks test/process-validation.test.js
//
// Two halves:
//  1. Pure-function tests of validateProcessInput/folderConflicts (utils/processValidation.js).
//     No mocking needed — the module has no external side effects.
//  2. Service-level tests of processes.service.js#saveForUser, which is where the "kind can't
//     change on update" rule is actually enforced end to end: the service-level check (before
//     ever calling the repository) and the SQL backstop's error mapping (save_work_process's
//     process_kind_immutable, surfaced through a mocked repo). Every collaborator saveForUser
//     talks to is mocked, so this never touches Supabase or Google.
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { validateProcessInput } from "../src/utils/processValidation.js";

// ---------------------------------------------------------------------------
// 1. validateProcessInput — pure
// ---------------------------------------------------------------------------

/** A body that was valid before document processes existed — no `kind` field at all. */
function legacyImageBody(overrides = {}) {
  return {
    name: "Client Shoot",
    rawFolderId: "raw-1",
    masterFolderId: "master-1",
    renameTemplate: "{genre}_{subject}",
    instructions: "Sort by shoot type.",
    timezone: "UTC",
    tagFields: [{ key: "client", label: "Client", description: "" }],
    destinations: [
      { name: "Portraits", description: "", isFallback: false, folder: { mode: "create" } },
      { name: "Unsorted", description: "", isFallback: true, folder: { mode: "master" } },
    ],
    ...overrides,
  };
}

function documentBody(overrides = {}) {
  return {
    kind: "document",
    name: "Invoices",
    rawFolderId: "raw-2",
    masterFolderId: "master-2",
    renameTemplate: "{type}_{organization}_{topic}",
    instructions: "",
    timezone: "UTC",
    tagFields: [],
    destinations: [{ name: "Unsorted", description: "", isFallback: true, folder: { mode: "master" } }],
    ...overrides,
  };
}

test("create: kind is required", () => {
  const { errors } = validateProcessInput(legacyImageBody({ kind: undefined }));
  const kindError = errors.find((e) => e.field === "kind");
  assert.ok(kindError, "expected a kind field error");
  assert.equal(kindError.message, "Choose whether this process sorts images or documents.");
});

test("create: an unknown kind value is rejected", () => {
  const { errors } = validateProcessInput(legacyImageBody({ kind: "video" }));
  assert.ok(errors.some((e) => e.field === "kind"));
});

test("create: kind 'image' and 'document' are both accepted", () => {
  const image = validateProcessInput(legacyImageBody({ kind: "image" }));
  assert.equal(image.errors.filter((e) => e.field === "kind").length, 0);
  assert.equal(image.value.kind, "image");

  const doc = validateProcessInput(documentBody());
  assert.equal(doc.errors.filter((e) => e.field === "kind").length, 0);
  assert.equal(doc.value.kind, "document");
});

test("update: an existing image process with no `kind` in the body still validates exactly as before", () => {
  const { errors, value } = validateProcessInput(legacyImageBody(), { existingKind: "image" });
  assert.deepEqual(errors, []);
  assert.equal(value.kind, "image");
  assert.equal(value.renameTemplate, "{genre}_{subject}");
});

test("update: sending the same kind back is accepted (no-op)", () => {
  const { errors, value } = validateProcessInput(legacyImageBody({ kind: "image" }), { existingKind: "image" });
  assert.equal(errors.filter((e) => e.field === "kind").length, 0);
  assert.equal(value.kind, "image");
});

test("update: sending a different kind is a 400 on the kind field, with the exact immutable-kind message", () => {
  const { errors, value } = validateProcessInput(legacyImageBody({ kind: "document" }), { existingKind: "image" });
  const kindError = errors.find((e) => e.field === "kind");
  assert.ok(kindError);
  assert.equal(kindError.message, "A process can't switch between images and documents. Create a new process instead.");
  // The stored kind wins even while rejecting the save — never silently switches.
  assert.equal(value.kind, "image");
});

test("template validation uses the process kind: a document-only token in an image template gets the cross-kind hint", () => {
  const { errors } = validateProcessInput(legacyImageBody({ renameTemplate: "{topic}_{subject}", kind: "image" }));
  const message = errors.find((e) => e.field === "renameTemplate")?.message;
  assert.equal(message, "{topic} is a document token; image processes use {subject}, {style} or {genre}.");
});

test("template validation uses the process kind: an image-only token in a document template gets the cross-kind hint", () => {
  const { errors } = validateProcessInput(documentBody({ renameTemplate: "{genre}_{topic}" }), { existingKind: "document" });
  const message = errors.find((e) => e.field === "renameTemplate")?.message;
  assert.equal(message, "{genre} is an image token; document processes use {type}, {topic} or {organization}.");
});

test("an empty renameTemplate falls back to the kind's own default template, not the image one", () => {
  const { errors, value } = validateProcessInput(documentBody({ renameTemplate: "" }), { existingKind: "document" });
  assert.equal(errors.filter((e) => e.field === "renameTemplate").length, 0);
  assert.equal(value.renameTemplate, "{type}_{organization}_{topic}");
});

test("an image process may keep a tag keyed like a document token (existing processes can have one)", () => {
  const { errors } = validateProcessInput(
    legacyImageBody({ tagFields: [{ key: "topic", label: "Topic", description: "" }] }),
  );
  assert.equal(errors.find((e) => e.field === "tagFields[0].key"), undefined);
});

test("a tag key can't reuse one of its own process kind's tokens", () => {
  const image = validateProcessInput(legacyImageBody({ tagFields: [{ key: "genre", label: "Genre", description: "" }] }));
  assert.equal(
    image.errors.find((e) => e.field === "tagFields[0].key")?.message,
    `"genre" is already a built-in token; pick another key.`,
  );
  const document = validateProcessInput(
    documentBody({ tagFields: [{ key: "organization", label: "Org", description: "" }] }),
    { existingKind: "document" },
  );
  assert.equal(
    document.errors.find((e) => e.field === "tagFields[0].key")?.message,
    `"organization" is already a built-in token; pick another key.`,
  );
});

test("folderConflicts and other wording mention files, not images, so document processes read correctly", () => {
  const { errors } = validateProcessInput(legacyImageBody({ masterFolderId: "" }));
  const message = errors.find((e) => e.field === "masterFolderId")?.message;
  assert.equal(message, "Choose the Master folder sorted files go into.");
});

// ---------------------------------------------------------------------------
// 2. saveForUser — service-level immutability check + SQL-backstop mapping
// ---------------------------------------------------------------------------

const EXISTING_IMAGE_ID = "11111111-1111-1111-1111-111111111111";
const EXISTING_UNSORTED_ID = "22222222-2222-2222-2222-222222222222";

function existingImageProcessRow() {
  return {
    id: EXISTING_IMAGE_ID,
    kind: "image",
    name: "Existing Image Process",
    raw_folder_id: "raw-1",
    raw_folder_name: "Raw",
    master_folder_id: "master-1",
    master_folder_name: "Master",
    rename_template: "{destination}_{subject}",
    instructions: "",
    tag_fields: [],
    timezone: "UTC",
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    destinations: [
      {
        id: EXISTING_UNSORTED_ID,
        name: "Unsorted",
        description: "",
        folder_id: "master-1",
        folder_name: "Master",
        is_fallback: true,
        position: 0,
      },
    ],
  };
}

function validUpdateBody(overrides = {}) {
  return {
    name: "Existing Image Process",
    rawFolderId: "raw-1",
    masterFolderId: "master-1",
    renameTemplate: "{destination}_{subject}",
    instructions: "",
    timezone: "UTC",
    tagFields: [],
    destinations: [{ id: EXISTING_UNSORTED_ID, name: "Unsorted", description: "", isFallback: true, folder: { mode: "master" } }],
    ...overrides,
  };
}

function validDocumentCreateBody(overrides = {}) {
  return {
    kind: "document",
    name: "Doc Process",
    rawFolderId: "raw-2",
    masterFolderId: "master-2",
    renameTemplate: "{type}_{organization}_{topic}",
    instructions: "",
    timezone: "UTC",
    tagFields: [],
    destinations: [{ name: "Unsorted", description: "", isFallback: true, folder: { mode: "master" } }],
    ...overrides,
  };
}

let listProcessesResult = [];
let saveProcessImpl = async () => {
  throw new Error("saveProcessImpl not configured for this test");
};

const listProcesses = mock.fn(async () => listProcessesResult);
const saveProcess = mock.fn(async (userId, processId, processRow, destinationRows, maxProcesses) =>
  saveProcessImpl(userId, processId, processRow, destinationRows, maxProcesses),
);

mock.module("../src/repositories/workProcess.repo.js", {
  namedExports: {
    listProcesses,
    saveProcess,
    setEnabled: async () => true,
    deleteProcess: async () => true,
  },
});

const getFolder = mock.fn(async (userId, folderId) => ({
  id: folderId,
  name: `Folder ${folderId}`,
  mimeType: "application/vnd.google-apps.folder",
  trashed: false,
  driveId: null,
  capabilities: { canAddChildren: true, canRemoveChildren: true },
}));
const ensureChildFolder = mock.fn(async (userId, masterId, name) => ({ id: `created-${name}`, name }));
mock.module("../src/services/drive.service.js", { namedExports: { getFolder, ensureChildFolder } });

// A generous plan so process-limit and credit logic never gets in the way of these tests —
// they're about the kind rule, not entitlement.
const testPlan = { id: "studio", label: "Studio", maxProcesses: 10, aiPerProcess: 5 };
const loadEntitlement = mock.fn(async () => ({ plan: testPlan, usage: {}, limits: {}, credits: 999, exhausted: false }));
const rankProcesses = mock.fn((processes) => processes.map((p) => ({ ...p, locked: false, active: true })));
mock.module("../src/services/entitlement.service.js", { namedExports: { loadEntitlement, rankProcesses } });

mock.module("../src/services/driveWatch.service.js", { namedExports: { stopWatch: async () => {} } });
mock.module("../src/repositories/subscription.repo.js", { namedExports: { ensureSubscription: async () => {} } });

const { saveForUser } = await import("../src/services/processes.service.js");

/** Makes saveProcess behave like a real save: appends/replaces the row so the getForUser
 * re-fetch saveForUser does at the end resolves instead of 404ing. */
function stageSuccessfulSave() {
  saveProcessImpl = async (userId, processId, processRow, destinationRows) => {
    const savedId = processId ?? "33333333-3333-3333-3333-333333333333";
    const savedRow = {
      id: savedId,
      created_at: "2026-01-01T00:00:00Z",
      ...processRow,
      destinations: destinationRows.map((d, i) => ({ ...d, id: d.id ?? `dest-${i}-${savedId}`, position: i })),
    };
    listProcessesResult = [...listProcessesResult.filter((p) => p.id !== savedId), savedRow];
    return savedId;
  };
}

beforeEach(() => {
  listProcessesResult = [];
  saveProcessImpl = async () => {
    throw new Error("saveProcessImpl not configured for this test");
  };
  listProcesses.mock.resetCalls();
  saveProcess.mock.resetCalls();
  getFolder.mock.resetCalls();
  ensureChildFolder.mock.resetCalls();
  loadEntitlement.mock.resetCalls();
  rankProcesses.mock.resetCalls();
});

test("saveForUser: an update that tries to switch kind is rejected before the repository is ever called", async () => {
  listProcessesResult = [existingImageProcessRow()];
  await assert.rejects(
    () => saveForUser("user-1", EXISTING_IMAGE_ID, validUpdateBody({ kind: "document" })),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, "invalid_process");
      assert.equal(err.details[0].field, "kind");
      assert.equal(err.details[0].message, "A process can't switch between images and documents. Create a new process instead.");
      return true;
    },
  );
  assert.equal(saveProcess.mock.callCount(), 0, "the repository must never see a kind-switching update");
});

test("saveForUser: an update that omits kind is treated as unchanged, and the stored kind is passed through to the repo row", async () => {
  listProcessesResult = [existingImageProcessRow()];
  stageSuccessfulSave();
  const result = await saveForUser("user-1", EXISTING_IMAGE_ID, validUpdateBody());
  assert.equal(result.id, EXISTING_IMAGE_ID);
  assert.equal(saveProcess.mock.callCount(), 1);
  assert.equal(saveProcess.mock.calls[0].arguments[2].kind, "image");
});

test("saveForUser: an update that resends the same kind succeeds", async () => {
  listProcessesResult = [existingImageProcessRow()];
  stageSuccessfulSave();
  await saveForUser("user-1", EXISTING_IMAGE_ID, validUpdateBody({ kind: "image" }));
  assert.equal(saveProcess.mock.callCount(), 1);
  assert.equal(saveProcess.mock.calls[0].arguments[2].kind, "image");
});

test("saveForUser: create requires kind and never reaches the repository without it", async () => {
  await assert.rejects(
    () => saveForUser("user-1", null, validDocumentCreateBody({ kind: undefined })),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.details[0].field, "kind");
      return true;
    },
  );
  assert.equal(saveProcess.mock.callCount(), 0);
});

test("saveForUser: create with kind 'document' saves a row with kind: 'document'", async () => {
  stageSuccessfulSave();
  const result = await saveForUser("user-1", null, validDocumentCreateBody());
  assert.equal(result.kind, "document");
  assert.equal(saveProcess.mock.callCount(), 1);
  assert.equal(saveProcess.mock.calls[0].arguments[2].kind, "document");
});

test("saveForUser: save_work_process's process_kind_immutable backstop (SQL-side race) maps to the same 400 on kind", async () => {
  listProcessesResult = [existingImageProcessRow()];
  // Mirrors workProcess.repo.js: it wraps the Postgres message but currently only recognizes the
  // codes listed in RAISED_CODES, which doesn't include process_kind_immutable — so err.code is
  // undefined here, exactly like the real repo today. saveForUser must still catch this by message.
  saveProcessImpl = async () => {
    throw new Error("Failed to save work process: process_kind_immutable");
  };
  await assert.rejects(
    () => saveForUser("user-1", EXISTING_IMAGE_ID, validUpdateBody()),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, "invalid_process");
      assert.equal(err.details[0].field, "kind");
      assert.equal(err.details[0].message, "A process can't switch between images and documents. Create a new process instead.");
      return true;
    },
  );
});

test("saveForUser: an unrelated repo error code (e.g. duplicate_raw_folder) is unaffected by the kind mapping", async () => {
  listProcessesResult = [existingImageProcessRow()];
  // workProcess.repo.js resolves the raw Postgres 23505 into this code itself before throwing —
  // by the time saveForUser sees the error, err.code is already "duplicate_raw_folder".
  saveProcessImpl = async () => {
    const err = new Error("Failed to save work process: duplicate key value violates unique constraint unique_raw");
    err.code = "duplicate_raw_folder";
    throw err;
  };
  await assert.rejects(
    () => saveForUser("user-1", EXISTING_IMAGE_ID, validUpdateBody()),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.details[0].field, "rawFolderId");
      return true;
    },
  );
});
