// Run from backend/: node --test --experimental-test-module-mocks test/pipeline-workers.test.js
//
// Covers the concurrent per-process worker pools, and the per-kind (image/document) credit
// reservation, matching and fast-forward rules, added to pipeline.service.js. Every collaborator
// (env, drive.service, gemini.service, document.service, entitlement.service, filename.js, and the
// repositories) is mocked, so this never touches Supabase, Drive or Gemini, and never depends on
// how far BE-DOC/BE-PROC's own parallel edits to those files have gotten.
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
// Real module (not mocked): the deferred-file grace window in pipeline.service.js reads it for
// real, so tests compute due times from it instead of hard-coding the grace window.
import { FILE_LIMITS } from "../src/config/plans.js";

// ---------------------------------------------------------------- shared fake state

const GLOBAL_CAP = 3; // env.pipeline.maxConcurrentAiJobs — fixed once pipeline.service.js loads

let uidCounter = 0;
const uid = (label) => `${label}-${(uidCounter += 1)}`;

function makeProcess(id, { rawFolderId = `raw-${id}`, kind = "image" } = {}) {
  return {
    id,
    kind,
    name: `Process ${id}`,
    raw_folder_id: rawFolderId,
    raw_folder_name: "Raw",
    master_folder_id: `master-${id}`,
    master_folder_name: "Master",
    rename_template: "{subject}",
    instructions: "",
    tag_fields: [],
    timezone: "UTC",
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
    destinations: [{ id: `dest-${id}`, name: "Unsorted", folder_id: `master-${id}`, is_fallback: true }],
  };
}

function makeFile(id, parentFolderId) {
  return {
    id,
    name: `${id}.jpg`,
    mimeType: "image/jpeg",
    size: 1000,
    parents: [parentFolderId],
    trashed: false,
    createdTime: "2026-01-01T00:00:00Z",
    capabilities: { canRename: true },
  };
}

function makeDocFile(id, parentFolderId, { mimeType = "application/pdf", modifiedTime = "2026-01-01T00:00:00Z" } = {}) {
  return {
    id,
    name: `${id}.pdf`,
    mimeType,
    size: 1000,
    parents: [parentFolderId],
    trashed: false,
    modifiedTime,
    createdTime: "2026-01-01T00:00:00Z",
    capabilities: { canRename: true },
  };
}

// ------------------------------------------------------------------ concurrency probe

// Deterministic overlap without relying on timing: classifyImage always waits a beat,
// and also awaits `gate`, a promise a test can hold open to force workers to pile up
// before snapshotting peak concurrency, then release to let them all finish.
let gate = Promise.resolve();
function holdGate() {
  let release;
  gate = new Promise((resolve) => {
    release = resolve;
  });
  return () => release();
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let globalInFlight = 0;
let globalPeak = 0;
const perProcessInFlight = new Map();
const perProcessPeak = new Map();
const failClassifyIds = new Set(); // fileIds classifyImage should throw for
const failPrepareIds = new Set(); // fileIds prepareDocument should throw for
const graceFileIds = new Set(); // fileIds isStillBeingEdited should report true for

function resetConcurrencyProbe() {
  gate = Promise.resolve();
  globalInFlight = 0;
  globalPeak = 0;
  perProcessInFlight.clear();
  perProcessPeak.clear();
  failClassifyIds.clear();
  failPrepareIds.clear();
  graceFileIds.clear();
}

// ---------------------------------------------------------------- collaborator mocks

const claims = new Map(); // fileId → { claim, status }
let claimCounter = 0;
const forceClaimFail = new Set();
const completeFileCalls = []; // { fileId, result, opts: { kind, freeLimit, monthlyLimit } }

function resetRepoState() {
  claims.clear();
  claimCounter = 0;
  forceClaimFail.clear();
  completeFileCalls.length = 0;
  holdsClaimImpl = null;
  completeFileImpl = null;
}

const claimFile = mock.fn(async (userId, fileId, originalName, processId, kind) => {
  if (forceClaimFail.has(fileId) || claims.has(fileId)) return null;
  claimCounter += 1;
  const claim = `claim-${claimCounter}`;
  claims.set(fileId, { claim, status: "processing", kind });
  return claim;
});
// Per-kind credit-release tests (Finding B) need holdsClaim/completeFile to behave differently for
// a specific file while everything else keeps the default claims-table behaviour; these let a test
// swap in a one-off implementation without hand-rolling the whole claims bookkeeping again.
let holdsClaimImpl = null;
let completeFileImpl = null;
const holdsClaim = mock.fn(async (userId, fileId, claim) => {
  if (holdsClaimImpl) return holdsClaimImpl(userId, fileId, claim);
  const row = claims.get(fileId);
  return Boolean(row) && row.status === "processing" && row.claim === claim;
});
const completeFile = mock.fn(async (userId, fileId, claim, result, opts) => {
  if (completeFileImpl) return completeFileImpl(userId, fileId, claim, result, opts);
  const row = claims.get(fileId);
  if (!row || row.status !== "processing" || row.claim !== claim) return null;
  row.status = "completed";
  completeFileCalls.push({ fileId, result, opts });
  return "monthly";
});
const recordFailure = mock.fn(async (userId, fileId, claim, message) => {
  const row = claims.get(fileId);
  if (!row || row.status !== "processing" || row.claim !== claim) return false;
  row.status = "failed";
  row.error = message;
  return true;
});
const releaseFailed = mock.fn(async () => {});
const getStatuses = mock.fn(async () => new Map());
const isStaleClaim = () => false;

let filesByFolder = new Map(); // rawFolderId → file[]
const getFileBuffer = mock.fn(async (userId, fileId) => Buffer.from(fileId));
const renameAndMove = mock.fn(async () => ({}));
const getStartPageToken = mock.fn(async () => "fast-forward-token");
// Mirrors the real drive.service.js: only returns files whose mimeType is in the requested list,
// same as the Drive query would filter server-side.
const listFilesInFolder = mock.fn(async (userId, folderId, mimeTypes) =>
  (filesByFolder.get(folderId) ?? []).filter((file) => mimeTypes.includes(file.mimeType)),
);

// fileId → fresh metadata object, or null for "gone" (404). Absent means "gone" too, so a test
// that forgets to seed this for a deferred file gets the same behaviour real Drive would: dropped.
let metadataByFileId = new Map();
// An Error value makes the fetch throw, like a Drive outage.
const getFileMetadata = mock.fn(async (userId, fileId) => {
  const value = metadataByFileId.get(fileId);
  if (value instanceof Error) throw value;
  return value ?? null;
});

let listChangesImpl = async () => ({ changes: [], nextPageToken: undefined, newStartPageToken: "start-token" });
const listChanges = mock.fn(async (userId, pageToken) => listChangesImpl(userId, pageToken));

const updatePageToken = mock.fn(async () => {});
const getChannelForUser = mock.fn(async () => null);

const classifyImage = mock.fn(async (buffer, mimeType, process) => {
  const fileId = buffer.toString();
  const pid = process.id;
  globalInFlight += 1;
  globalPeak = Math.max(globalPeak, globalInFlight);
  const pCount = (perProcessInFlight.get(pid) ?? 0) + 1;
  perProcessInFlight.set(pid, pCount);
  perProcessPeak.set(pid, Math.max(perProcessPeak.get(pid) ?? 0, pCount));
  try {
    await delay(15);
    await gate;
    if (failClassifyIds.has(fileId)) throw new Error("simulated classification failure");
    const fallback = process.destinations.find((d) => d.is_fallback);
    return { subject: "test", style: "test", genre: "test", fields: [], destination: fallback, matched: true };
  } finally {
    globalInFlight -= 1;
    perProcessInFlight.set(pid, perProcessInFlight.get(pid) - 1);
  }
});

const classifyDocument = mock.fn(async (content, process) => {
  const fallback = process.destinations.find((d) => d.is_fallback);
  return {
    topic: "quarterly numbers",
    type: "invoice",
    organization: "Acme Inc",
    documentDate: "2026-03-05",
    fields: [],
    destination: fallback,
    matched: true,
  };
});

const prepareDocument = mock.fn(async (userId, file) => {
  globalInFlight += 1;
  globalPeak = Math.max(globalPeak, globalInFlight);
  const pid = file.__processId; // not used by real code; kept out of file objects
  try {
    await delay(15);
    await gate;
    if (failPrepareIds.has(file.id)) throw new Error("This document is corrupted and can't be opened.");
    return { mode: "text", text: `content-${file.id}`, truncated: false };
  } finally {
    globalInFlight -= 1;
  }
});

const isStillBeingEdited = mock.fn((file) => graceFileIds.has(file.id));

// Controlled independently of backend/src/utils/filename.js (owned by BE-PROC and mid-edit in
// parallel): fixes the MIME/kind contract this suite tests against, and records what pipeline.service.js
// asks it to render so document-vs-image naming values can be asserted directly.
const renderFileNameCalls = [];
const renderFileName = mock.fn((template, values, opts) => {
  renderFileNameCalls.push({ template, values, opts });
  return `${opts.kind}-${values.destination}.ext`;
});
const MIME_TYPES_BY_KIND = {
  image: ["image/jpeg", "image/png"],
  document: ["application/pdf", "application/vnd.google-apps.document"],
};

let entitlementImpl = () => ({
  plan: { id: "test", aiPerProcess: 2, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 },
  usage: {},
  limits: { image: { freeLimit: 10, monthlyLimit: 1_000_000 }, document: { freeLimit: 5, monthlyLimit: 500_000 } },
  credits: { image: 1_000_000, document: 1_000_000 },
  exhausted: false,
});
const loadEntitlement = mock.fn(async (userId) => entitlementImpl(userId));
const rankProcesses = (processes, plan) => processes.map((p) => ({ ...p, locked: false, active: p.enabled !== false }));

let processesForUser = [];
const listProcesses = mock.fn(async () => processesForUser);

mock.module("../src/config/env.js", {
  namedExports: {
    env: {
      gemini: { maxImageBytes: 18 * 1024 * 1024, apiKey: "test", model: "test-model" },
      pipeline: { maxConcurrentAiJobs: GLOBAL_CAP },
    },
  },
});
mock.module("../src/services/gemini.service.js", { namedExports: { classifyImage, classifyDocument } });
mock.module("../src/services/document.service.js", { namedExports: { prepareDocument, isStillBeingEdited } });
mock.module("../src/services/drive.service.js", {
  namedExports: { getFileBuffer, getFileMetadata, getStartPageToken, listChanges, listFilesInFolder, renameAndMove },
});
mock.module("../src/utils/filename.js", { namedExports: { renderFileName, MIME_TYPES_BY_KIND } });
mock.module("../src/services/entitlement.service.js", { namedExports: { loadEntitlement, rankProcesses } });
mock.module("../src/repositories/workProcess.repo.js", { namedExports: { listProcesses } });
mock.module("../src/repositories/driveChannel.repo.js", { namedExports: { updatePageToken, getChannelForUser } });
mock.module("../src/repositories/processedFile.repo.js", {
  namedExports: { claimFile, holdsClaim, completeFile, recordFailure, releaseFailed, getStatuses, isStaleClaim },
});

const { processNotification, processRawFolder, getProcessesStatus, processDeferredFiles, forgetUser } = await import(
  "../src/services/pipeline.service.js"
);

beforeEach(() => {
  resetConcurrencyProbe();
  resetRepoState();
  renderFileNameCalls.length = 0;
  filesByFolder = new Map();
  metadataByFileId = new Map();
  listChangesImpl = async () => ({ changes: [], nextPageToken: undefined, newStartPageToken: "start-token" });
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 },
    usage: {},
    limits: { image: { freeLimit: 10, monthlyLimit: 1_000_000 }, document: { freeLimit: 5, monthlyLimit: 500_000 } },
    credits: { image: 1_000_000, document: 1_000_000 },
    exhausted: false,
  });
  processesForUser = [];
  for (const fn of [
    claimFile, holdsClaim, completeFile, recordFailure, releaseFailed, getStatuses,
    getFileBuffer, renameAndMove, getStartPageToken, listFilesInFolder, listChanges,
    updatePageToken, getChannelForUser, classifyImage, classifyDocument, prepareDocument,
    isStillBeingEdited, renderFileName, loadEntitlement, listProcesses,
  ]) {
    fn.mock.resetCalls();
  }
});

// -------------------------------------------------------------------------- concurrency & core tests (unchanged behavior)

test("a process never runs more AI workers than plan.aiPerProcess, and reaches that cap", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 1_000_000, document: 1_000_000 },
    exhausted: false,
  });
  filesByFolder.set(process.raw_folder_id, [1, 2, 3, 4, 5].map((n) => makeFile(`f${n}-${process.id}`, process.raw_folder_id)));

  const release = holdGate();
  const runPromise = processRawFolder(userId, {});
  await delay(60); // let all 2 allowed workers pile up on the gate
  assert.equal(perProcessPeak.get(process.id), 2, "should have reached the plan's cap of 2");
  assert.ok((perProcessInFlight.get(process.id) ?? 0) <= 2, "must never exceed the cap");
  release();
  const result = await runPromise;

  assert.equal(result.completed, 5);
  assert.equal(perProcessPeak.get(process.id), 2, "peak concurrency must never have exceeded 2");
});

test("two processes' managers run concurrently and independently", async () => {
  const userId = uid("user");
  const p1 = makeProcess(uid("proc"));
  const p2 = makeProcess(uid("proc"));
  processesForUser = [p1, p2];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 }, // 1 each: any overlap must be cross-process
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 1_000_000, document: 1_000_000 },
    exhausted: false,
  });
  filesByFolder.set(p1.raw_folder_id, [makeFile(`f1-${p1.id}`, p1.raw_folder_id), makeFile(`f2-${p1.id}`, p1.raw_folder_id)]);
  filesByFolder.set(p2.raw_folder_id, [makeFile(`f1-${p2.id}`, p2.raw_folder_id), makeFile(`f2-${p2.id}`, p2.raw_folder_id)]);

  const release = holdGate();
  const runPromise = processRawFolder(userId, {});
  await delay(60);
  assert.equal(perProcessInFlight.get(p1.id), 1, "process 1 should have a worker in flight");
  assert.equal(perProcessInFlight.get(p2.id), 1, "process 2 should have a worker in flight at the same time");
  release();
  const result = await runPromise;

  assert.equal(result.completed, 4);
});

test("the global AI job cap is never exceeded across processes, and is reached", async () => {
  const userId = uid("user");
  const processes = [uid("proc"), uid("proc"), uid("proc")].map((id) => makeProcess(id));
  processesForUser = processes;
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 }, // 3 processes × 2 = 6 possible, cap is 3
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 1_000_000, document: 1_000_000 },
    exhausted: false,
  });
  for (const process of processes) {
    filesByFolder.set(process.raw_folder_id, [1, 2].map((n) => makeFile(`f${n}-${process.id}`, process.raw_folder_id)));
  }

  const release = holdGate();
  const runPromise = processRawFolder(userId, {});
  await delay(60);
  assert.equal(globalPeak, GLOBAL_CAP, "global concurrency should have reached the cap");
  assert.ok(globalInFlight <= GLOBAL_CAP, "must never exceed the global cap");
  release();
  const result = await runPromise;

  assert.equal(result.completed, 6);
  assert.equal(globalPeak, GLOBAL_CAP, "peak must never have exceeded the global cap");
});

test("a file listed twice in one sweep page is claimed and classified once", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  const file = makeFile(`dup-${process.id}`, process.raw_folder_id);
  listChangesImpl = async () => ({
    changes: [
      { fileId: file.id, removed: false, file },
      { fileId: file.id, removed: false, file }, // the same file, reported twice
    ],
    nextPageToken: undefined,
    newStartPageToken: "after-token",
  });

  await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });

  assert.equal(claimFile.mock.callCount(), 1);
  assert.equal(classifyImage.mock.callCount(), 1);
  assert.deepEqual(completeFileCalls.map((c) => c.fileId), [file.id]);
  assert.equal(updatePageToken.mock.calls[0].arguments[1], "after-token");
});

test("a file whose claim is already taken comes back skipped", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  const taken = makeFile(`taken-${process.id}`, process.raw_folder_id);
  const free = makeFile(`free-${process.id}`, process.raw_folder_id);
  forceClaimFail.add(taken.id);
  filesByFolder.set(process.raw_folder_id, [taken, free]);

  const result = await processRawFolder(userId, {});

  assert.equal(result.skipped, 1);
  assert.equal(result.completed, 1);
  assert.deepEqual(completeFileCalls.map((c) => c.fileId), [free.id]);
});

test("with 3 image credits and 10 queued files, exactly 3 complete and the rest are blocked", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 3, document: 1_000_000 },
    exhausted: false,
  });
  filesByFolder.set(
    process.raw_folder_id,
    Array.from({ length: 10 }, (_, i) => makeFile(`f${i}-${process.id}`, process.raw_folder_id)),
  );

  const result = await processRawFolder(userId, {});

  assert.equal(result.completed, 3);
  assert.equal(result.blocked, 7);
  assert.equal(result.failed, 0);
  assert.equal(completeFile.mock.callCount(), 3, "never more completions than the credits the run started with");
});

test("a failed image classification releases its credit reservation for a later file", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 }, // sequential: deterministic order
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 3, document: 1_000_000 },
    exhausted: false,
  });
  const files = ["f1", "f2", "f3", "f4", "f5"].map((n) => makeFile(`${n}-${process.id}`, process.raw_folder_id));
  failClassifyIds.add(files[0].id); // the first file in the queue fails classification
  filesByFolder.set(process.raw_folder_id, files);

  const result = await processRawFolder(userId, {});

  assert.equal(result.failed, 1);
  assert.equal(result.completed, 3, "the released reservation let a later file complete instead");
  assert.equal(result.blocked, 1);
});

test("getProcessesStatus reports live worker counts during a run and none once it ends", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 1_000_000, document: 1_000_000 },
    exhausted: false,
  });
  filesByFolder.set(process.raw_folder_id, [1, 2].map((n) => makeFile(`f${n}-${process.id}`, process.raw_folder_id)));

  const release = holdGate();
  const runPromise = processRawFolder(userId, {});
  await delay(60);

  const mid = await getProcessesStatus(userId, [process]);
  assert.equal(mid.workers[process.id], 2);

  release();
  await runPromise;

  const after = await getProcessesStatus(userId, [process]);
  assert.equal(after.workers[process.id], undefined, "absent means 0 busy workers");
});

test("the changes-feed sweep fast-forwards and stops when both kinds run out of credits mid-page", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 3, document: 0 },
    exhausted: false,
  });
  const page1Files = Array.from({ length: 10 }, (_, i) => makeFile(`f${i}-${process.id}`, process.raw_folder_id));
  listChangesImpl = async (uid_, pageToken) => {
    assert.equal(pageToken, "page1", "must never be asked for a later page once credits ran out");
    return {
      changes: page1Files.map((file) => ({ fileId: file.id, removed: false, file })),
      nextPageToken: "page2", // more pages exist, but must not be fetched
      newStartPageToken: undefined,
    };
  };

  await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });

  assert.equal(listChanges.mock.callCount(), 1, "the sweep must stop instead of asking for page2");
  assert.equal(getStartPageToken.mock.callCount(), 1, "fast-forward should have run");
  assert.equal(updatePageToken.mock.calls[0].arguments[1], "fast-forward-token");
});

// -------------------------------------------------------------------------- per-kind (image/document) tests

test("credits are reserved from the matching kind's pool, never the other kind's", async () => {
  const userId = uid("user");
  const imageProc = makeProcess(uid("proc"), { kind: "image" });
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [imageProc, docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 10 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 10 } },
    credits: { image: 1, document: 1 },
    exhausted: false,
  });
  filesByFolder.set(imageProc.raw_folder_id, [1, 2].map((n) => makeFile(`img${n}-${imageProc.id}`, imageProc.raw_folder_id)));
  filesByFolder.set(docProc.raw_folder_id, [1, 2].map((n) => makeDocFile(`doc${n}-${docProc.id}`, docProc.raw_folder_id)));

  const result = await processRawFolder(userId, {});

  // 1 credit per kind, 2 files per kind: exactly one of each kind completes, one of each is blocked.
  assert.equal(result.completed, 2);
  assert.equal(result.blocked, 2);
  assert.equal(completeFile.mock.callCount(), 2);
  const kinds = completeFileCalls.map((c) => c.opts.kind).sort();
  assert.deepEqual(kinds, ["document", "image"], "one completion of each kind, not two of one");
});

test("completeFile receives { kind: 'document', freeLimit, monthlyLimit } from the plan's document allowance", async () => {
  const userId = uid("user");
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50, freeImages: 0, freeDocuments: 25, monthlyImages: 0, monthlyDocuments: 500 },
    usage: {},
    limits: { image: { freeLimit: 100, monthlyLimit: 1000 }, document: { freeLimit: 25, monthlyLimit: 500 } },
    credits: { image: 0, document: 5 },
    exhausted: false,
  });
  const file = makeDocFile(`doc-${docProc.id}`, docProc.raw_folder_id);
  filesByFolder.set(docProc.raw_folder_id, [file]);

  await processRawFolder(userId, {});

  assert.equal(completeFileCalls.length, 1);
  assert.deepEqual(completeFileCalls[0].opts, { kind: "document", freeLimit: 25, monthlyLimit: 500 });
});

test("document naming uses the document values (type/topic/organization/docdate), not the image ones", async () => {
  const userId = uid("user");
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 0, document: 1_000_000 },
    exhausted: false,
  });
  const file = makeDocFile(`doc-${docProc.id}`, docProc.raw_folder_id);
  filesByFolder.set(docProc.raw_folder_id, [file]);

  const result = await processRawFolder(userId, {});

  assert.equal(result.completed, 1);
  assert.equal(renderFileNameCalls.length, 1);
  const { values, opts } = renderFileNameCalls[0];
  assert.equal(opts.kind, "document");
  assert.equal(opts.mimeType, "application/pdf");
  assert.equal(values.type, "invoice");
  assert.equal(values.topic, "quarterly numbers");
  assert.equal(values.organization, "Acme Inc");
  assert.equal(values.docdate, "2026-03-05");
  assert.equal(values.subject, undefined, "image-only tokens must not leak into document values");
  assert.deepEqual(completeFileCalls[0].opts, { kind: "document", freeLimit: 0, monthlyLimit: 1_000_000 });

  // Stored tags use document field names, not the image ones.
  assert.deepEqual(completeFileCalls[0].result.tags, {
    type: "invoice",
    topic: "quarterly numbers",
    organization: "Acme Inc",
    document_date: "2026-03-05",
    fields: [],
  });
});

test("a PDF in an image process's Raw folder is ignored, and an image in a document process's Raw folder is ignored", async () => {
  const userId = uid("user");
  const imageProc = makeProcess(uid("proc"), { kind: "image" });
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [imageProc, docProc];

  const wrongInImage = makeDocFile(`wrong-${imageProc.id}`, imageProc.raw_folder_id); // PDF in an image Raw folder
  const rightImage = makeFile(`right-${imageProc.id}`, imageProc.raw_folder_id);
  const wrongInDoc = makeFile(`wrong-${docProc.id}`, docProc.raw_folder_id); // image in a document Raw folder
  const rightDoc = makeDocFile(`right-${docProc.id}`, docProc.raw_folder_id);

  listChangesImpl = async () => ({
    changes: [wrongInImage, rightImage, wrongInDoc, rightDoc].map((file) => ({ fileId: file.id, removed: false, file })),
    nextPageToken: undefined,
    newStartPageToken: "after-token",
  });

  await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });

  const claimedIds = claimFile.mock.calls.map((c) => c.arguments[1]);
  assert.ok(!claimedIds.includes(wrongInImage.id), "a PDF must never be claimed by an image process");
  assert.ok(!claimedIds.includes(wrongInDoc.id), "an image must never be claimed by a document process");
  assert.ok(claimedIds.includes(rightImage.id));
  assert.ok(claimedIds.includes(rightDoc.id));
  assert.deepEqual(completeFileCalls.map((c) => c.fileId).sort(), [rightDoc.id, rightImage.id].sort());
});

test("a Google Doc inside the editing grace window is not claimed, and counts as waiting in status", async () => {
  const userId = uid("user");
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 0, document: 1_000_000 },
    exhausted: false,
  });
  const editing = makeDocFile(`editing-${docProc.id}`, docProc.raw_folder_id, { mimeType: "application/vnd.google-apps.document" });
  graceFileIds.add(editing.id);

  // 1) Not claimed via the changes feed.
  listChangesImpl = async () => ({
    changes: [{ fileId: editing.id, removed: false, file: editing }],
    nextPageToken: undefined,
    newStartPageToken: "after-token",
  });
  await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });
  assert.equal(claimFile.mock.callCount(), 0, "a file still inside the editing grace window must never be claimed");

  // 2) Counts as waiting in status, since it was never claimed.
  filesByFolder.set(docProc.raw_folder_id, [editing]);
  const status = await getProcessesStatus(userId, [docProc]);
  assert.equal(status.statuses[docProc.id].waiting, 1);
  assert.equal(status.statuses[docProc.id].total, 1);
});

test("a document failure (prepareDocument throws) releases its reservation and records a vendor-neutral failure", async () => {
  const userId = uid("user");
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 }, // sequential: deterministic order
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 0, document: 3 },
    exhausted: false,
  });
  const files = ["d1", "d2", "d3", "d4", "d5"].map((n) => makeDocFile(`${n}-${docProc.id}`, docProc.raw_folder_id));
  failPrepareIds.add(files[0].id);
  filesByFolder.set(docProc.raw_folder_id, files);

  const result = await processRawFolder(userId, {});

  assert.equal(result.failed, 1);
  assert.equal(result.completed, 3, "the released reservation let a later document complete instead");
  assert.equal(result.blocked, 1);

  const failedRow = claims.get(files[0].id);
  assert.equal(failedRow.status, "failed");
  assert.equal(failedRow.error, "This document is corrupted and can't be opened.");
  for (const bad of ["gemini", "google", "vendor", "openai"]) {
    assert.ok(!failedRow.error.toLowerCase().includes(bad), `failure message must be vendor-neutral (found "${bad}")`);
  }
});

test("images exhausted but documents available: documents keep sorting, image files come back blocked, no fast-forward", async () => {
  const userId = uid("user");
  const imageProc = makeProcess(uid("proc"), { kind: "image" });
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [imageProc, docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 10 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 0 }, document: { freeLimit: 0, monthlyLimit: 10 } },
    // More document credits than document files, so this page can't exhaust them: isolates "no
    // fast-forward while one kind still has credit" from the (separately-tested) case where a page
    // happens to spend a kind's last credit on its final file.
    credits: { image: 0, document: 5 },
    exhausted: false,
  });
  const imageFile = makeFile(`img-${imageProc.id}`, imageProc.raw_folder_id);
  const docFiles = [1, 2].map((n) => makeDocFile(`doc${n}-${docProc.id}`, docProc.raw_folder_id));

  listChangesImpl = async () => ({
    changes: [imageFile, ...docFiles].map((file) => ({ fileId: file.id, removed: false, file })),
    nextPageToken: undefined,
    newStartPageToken: "after-token",
  });

  await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });

  assert.equal(claimFile.mock.callCount(), 2, "only the 2 document files are claimed; the image is blocked before any claim");
  assert.deepEqual(completeFileCalls.map((c) => c.fileId).sort(), docFiles.map((f) => f.id).sort());
  assert.equal(getStartPageToken.mock.callCount(), 0, "must not fast-forward while one kind still has credits");
  assert.equal(updatePageToken.mock.calls[0].arguments[1], "after-token", "the real page token advances, not a fast-forward token");
});

test("both kinds exhausted: the sweep fast-forwards immediately, without listing changes", async () => {
  const userId = uid("user");
  const imageProc = makeProcess(uid("proc"), { kind: "image" });
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [imageProc, docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 0 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 0 }, document: { freeLimit: 0, monthlyLimit: 0 } },
    credits: { image: 0, document: 0 },
    exhausted: true,
  });

  await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });

  assert.equal(listChanges.mock.callCount(), 0, "must fast-forward at the start, before listing any changes");
  assert.equal(getStartPageToken.mock.callCount(), 1);
  assert.equal(updatePageToken.mock.calls[0].arguments[1], "fast-forward-token");
});

test("organize now: a process of an exhausted kind gets blocked outcomes while another kind's process still runs", async () => {
  const userId = uid("user");
  const imageProc = makeProcess(uid("proc"), { kind: "image" });
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [imageProc, docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 10 },
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 0 }, document: { freeLimit: 0, monthlyLimit: 10 } },
    credits: { image: 0, document: 2 },
    exhausted: false,
  });
  filesByFolder.set(imageProc.raw_folder_id, [1, 2].map((n) => makeFile(`img${n}-${imageProc.id}`, imageProc.raw_folder_id)));
  filesByFolder.set(docProc.raw_folder_id, [1, 2].map((n) => makeDocFile(`doc${n}-${docProc.id}`, docProc.raw_folder_id)));

  const result = await processRawFolder(userId, {}); // every runnable process, no processId filter

  assert.equal(result.blocked, 2, "both image files come back blocked");
  assert.equal(result.completed, 2, "both document files still complete");
});

// -------------------------------------------------------------------------- Finding A: deferred (editing-grace) files
//
// pipeline.service.js schedules one real setTimeout per user for its deferred-file queue, with
// delays on the order of the plan's editing-grace window (minutes). To test that deterministically
// without actually waiting: mock.timers controls Date (so the due-check inside processDeferredFiles
// sees whatever "now" a test wants), and a hand-rolled setTimeout/clearTimeout spy intercepts only
// long (>=1s) delays — short ones (the shared delay()/gate helpers used by classifyImage and
// prepareDocument) pass through to the real timer so the rest of the pipeline behaves normally.

/** Intercepts setTimeout calls of `thresholdMs` or more so a test can fire them on demand instead of waiting; shorter ones (internal mock delays) still run for real. */
function spyOnLongTimers(t, thresholdMs = 1000) {
  const scheduled = []; // { fn, ms, timer, cleared }
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  t.mock.method(globalThis, "setTimeout", (fn, ms, ...args) => {
    if (ms >= thresholdMs) {
      const timer = { unref: mock.fn(), ref: mock.fn() };
      scheduled.push({ fn, ms, timer, cleared: false });
      return timer;
    }
    return realSetTimeout(fn, ms, ...args);
  });
  t.mock.method(globalThis, "clearTimeout", (timer) => {
    const entry = scheduled.find((s) => s.timer === timer);
    if (entry) entry.cleared = true;
    else realClearTimeout(timer);
  });
  return scheduled;
}

/** Enables the Date mock pinned at the real current time, so `t.mock.timers.tick()` can fast-forward it deterministically. */
function enableFakeDate(t) {
  const realNow = Date.now();
  t.mock.timers.enable({ apis: ["Date"] });
  t.mock.timers.setTime(realNow);
}

const graceDocEntitlement = () => ({
  plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 },
  usage: {},
  limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
  credits: { image: 0, document: 1_000_000 },
  exhausted: false,
});
const DUE_TICK_MS = FILE_LIMITS.editingGraceMinutes * 60_000 + 30_000 + 1_000; // past the grace window plus deferGraceFile's own buffer

test("a deferred Google Doc is processed automatically once its timer fires, via the normal claim/charge path, and the timer is unref'd", async (t) => {
  const scheduled = spyOnLongTimers(t);
  enableFakeDate(t);
  try {
    const userId = uid("user");
    const docProc = makeProcess(uid("proc"), { kind: "document" });
    processesForUser = [docProc];
    entitlementImpl = graceDocEntitlement;

    const editing = makeDocFile(`editing-${docProc.id}`, docProc.raw_folder_id, {
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: new Date().toISOString(),
    });
    graceFileIds.add(editing.id); // still being edited on the first pass

    listChangesImpl = async () => ({
      changes: [{ fileId: editing.id, removed: false, file: editing }],
      nextPageToken: undefined,
      newStartPageToken: "after-token",
    });

    await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });
    assert.equal(claimFile.mock.callCount(), 0, "not claimed while still inside the grace window");
    assert.equal(scheduled.length, 1, "one deferred-file timer should have been scheduled");
    assert.equal(scheduled[0].timer.unref.mock.callCount(), 1, "the scheduled timer must be unref'd so it can't keep the process alive");

    // By the time the timer is due, the doc is no longer being edited and a fresh read confirms it.
    graceFileIds.delete(editing.id);
    metadataByFileId.set(editing.id, editing);
    t.mock.timers.tick(DUE_TICK_MS);

    await scheduled[0].fn(); // simulate the timer firing

    assert.equal(claimFile.mock.callCount(), 1, "the timer should have claimed the file through the normal path");
    assert.equal(completeFileCalls.length, 1);
    assert.equal(completeFileCalls[0].fileId, editing.id);
    assert.equal(completeFileCalls[0].opts.kind, "document");
  } finally {
    t.mock.timers.reset();
  }
});

test("processDeferredFiles: drops files moved out of Raw, trashed, or deleted; keeps (re-defers) ones edited again until they're not", async (t) => {
  enableFakeDate(t);
  try {
    const userId = uid("user");
    const docProc = makeProcess(uid("proc"), { kind: "document" });
    processesForUser = [docProc];
    entitlementImpl = graceDocEntitlement;

    const mk = (label) =>
      makeDocFile(`${label}-${docProc.id}`, docProc.raw_folder_id, {
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: new Date().toISOString(),
      });
    const movedOut = mk("moved");
    const trashedFile = mk("trashed");
    const deletedFile = mk("deleted");
    const reEdited = mk("reedited");
    const stillGood = mk("good");
    for (const f of [movedOut, trashedFile, deletedFile, reEdited, stillGood]) graceFileIds.add(f.id);

    listChangesImpl = async () => ({
      changes: [movedOut, trashedFile, deletedFile, reEdited, stillGood].map((file) => ({ fileId: file.id, removed: false, file })),
      nextPageToken: undefined,
      newStartPageToken: "after-token",
    });
    await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });
    assert.equal(claimFile.mock.callCount(), 0, "none claimed while still inside the grace window");

    metadataByFileId.set(movedOut.id, { ...movedOut, parents: ["elsewhere"] }); // no longer in Raw
    metadataByFileId.set(trashedFile.id, { ...trashedFile, trashed: true });
    metadataByFileId.set(deletedFile.id, null); // 404
    metadataByFileId.set(reEdited.id, reEdited); // stays in graceFileIds below: still being edited
    metadataByFileId.set(stillGood.id, stillGood);
    graceFileIds.delete(stillGood.id); // only this one is no longer being edited

    t.mock.timers.tick(DUE_TICK_MS);
    await processDeferredFiles(userId);

    assert.deepEqual(claimFile.mock.calls.map((c) => c.arguments[1]), [stillGood.id], "only the still-eligible file is claimed; the rest are dropped or kept waiting");
    assert.equal(completeFileCalls.length, 1);

    // The re-edited file must still be deferred (not dropped): once it's no longer reported as
    // being edited, a later pass should pick it up.
    graceFileIds.delete(reEdited.id);
    t.mock.timers.tick(DUE_TICK_MS);
    await processDeferredFiles(userId);
    assert.ok(
      claimFile.mock.calls.map((c) => c.arguments[1]).includes(reEdited.id),
      "the re-edited file is picked up automatically once it's no longer being edited",
    );
  } finally {
    t.mock.timers.reset();
  }
});

test("a Drive error while rechecking a deferred file keeps it queued; the next pass sorts it", async (t) => {
  enableFakeDate(t);
  try {
    const userId = uid("user");
    const docProc = makeProcess(uid("proc"), { kind: "document" });
    processesForUser = [docProc];
    entitlementImpl = graceDocEntitlement;

    const doc = makeDocFile(`flaky-${docProc.id}`, docProc.raw_folder_id, {
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: new Date().toISOString(),
    });
    graceFileIds.add(doc.id);
    listChangesImpl = async () => ({
      changes: [{ fileId: doc.id, removed: false, file: doc }],
      nextPageToken: undefined,
      newStartPageToken: "after-token",
    });
    await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });
    assert.equal(claimFile.mock.callCount(), 0, "deferred, not claimed, while being edited");

    graceFileIds.delete(doc.id);
    metadataByFileId.set(doc.id, new Error("Drive is having a moment"));
    t.mock.timers.tick(DUE_TICK_MS);
    await processDeferredFiles(userId);
    assert.equal(claimFile.mock.callCount(), 0, "nothing claimed while Drive errors");

    metadataByFileId.set(doc.id, doc);
    t.mock.timers.tick(60_000); // past the short retry delay
    await processDeferredFiles(userId);
    assert.deepEqual(claimFile.mock.calls.map((c) => c.arguments[1]), [doc.id], "the file wasn't lost to the error");
  } finally {
    t.mock.timers.reset();
  }
});

test("a busy slot reschedules the deferred run instead of dropping it, and the retry runs once the slot frees", async (t) => {
  const scheduled = spyOnLongTimers(t);
  enableFakeDate(t);
  try {
    const userId = uid("user");
    const imageProc = makeProcess(uid("proc"), { kind: "image" });
    const docProc = makeProcess(uid("proc"), { kind: "document" });
    processesForUser = [imageProc, docProc];
    entitlementImpl = () => ({
      plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 },
      usage: {},
      limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
      credits: { image: 1_000_000, document: 1_000_000 },
      exhausted: false,
    });

    const editing = makeDocFile(`editing-${docProc.id}`, docProc.raw_folder_id, {
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: new Date().toISOString(),
    });
    graceFileIds.add(editing.id);
    listChangesImpl = async () => ({
      changes: [{ fileId: editing.id, removed: false, file: editing }],
      nextPageToken: undefined,
      newStartPageToken: "after-token",
    });
    await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });
    assert.equal(scheduled.length, 1);

    graceFileIds.delete(editing.id);
    metadataByFileId.set(editing.id, editing);
    t.mock.timers.tick(DUE_TICK_MS);

    // Occupy the user's single sweep/organize slot with a slow "Organize now" run.
    filesByFolder.set(imageProc.raw_folder_id, [makeFile(`img-${imageProc.id}`, imageProc.raw_folder_id)]);
    const release = holdGate();
    const organizePromise = processRawFolder(userId, {});
    await delay(30); // let it claim the slot

    await scheduled[0].fn(); // the deferred timer fires while the slot is busy
    assert.equal(claimFile.mock.calls.map((c) => c.arguments[1]).includes(editing.id), false, "must not process while the slot is busy");
    assert.equal(scheduled.length, 2, "a retry timer should have been scheduled instead of dropping the work");

    release();
    await organizePromise;

    await scheduled[1].fn(); // the retry fires once the slot is free
    assert.ok(
      claimFile.mock.calls.map((c) => c.arguments[1]).includes(editing.id),
      "the retried run picks up the deferred file once the slot frees",
    );
  } finally {
    t.mock.timers.reset();
  }
});

test("the per-user deferred cap holds: only up to the cap gets an automatic follow-up", async (t) => {
  enableFakeDate(t);
  try {
    const userId = uid("user");
    const docProc = makeProcess(uid("proc"), { kind: "document" });
    processesForUser = [docProc];
    // Which files get through doesn't matter here, only the count, so unlike the other deferred
    // tests this uses the plan's full worker concurrency (bounded by the GLOBAL_CAP semaphore)
    // instead of aiPerProcess: 1, so 500 mocked documents don't run one at a time.
    entitlementImpl = () => ({
      plan: { id: "test", aiPerProcess: GLOBAL_CAP, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 },
      usage: {},
      limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
      credits: { image: 0, document: 1_000_000 },
      exhausted: false,
    });

    const total = 501; // one past the 500 documented in deferGraceFile
    const files = Array.from({ length: total }, (_, i) =>
      makeDocFile(`cap${i}-${docProc.id}`, docProc.raw_folder_id, {
        mimeType: "application/vnd.google-apps.document",
        modifiedTime: new Date().toISOString(),
      }),
    );
    filesByFolder.set(docProc.raw_folder_id, files);
    for (const f of files) graceFileIds.add(f.id);

    await processRawFolder(userId, {}); // defers everything it can, up to the cap

    for (const f of files) {
      graceFileIds.delete(f.id);
      metadataByFileId.set(f.id, f);
    }
    t.mock.timers.tick(DUE_TICK_MS);
    await processDeferredFiles(userId);

    assert.equal(claimFile.mock.callCount(), 500, "only the capped number of files got an automatic follow-up");
  } finally {
    t.mock.timers.reset();
  }
});

test("forgetUser clears a user's deferred files and cancels their timer", async (t) => {
  const scheduled = spyOnLongTimers(t);
  enableFakeDate(t);
  try {
    const userId = uid("user");
    const docProc = makeProcess(uid("proc"), { kind: "document" });
    processesForUser = [docProc];
    entitlementImpl = graceDocEntitlement;

    const editing = makeDocFile(`editing-${docProc.id}`, docProc.raw_folder_id, {
      mimeType: "application/vnd.google-apps.document",
      modifiedTime: new Date().toISOString(),
    });
    graceFileIds.add(editing.id);
    listChangesImpl = async () => ({
      changes: [{ fileId: editing.id, removed: false, file: editing }],
      nextPageToken: undefined,
      newStartPageToken: "after-token",
    });
    await processNotification({ user_id: userId, channel_id: "chan1", page_token: "page1" });
    assert.equal(scheduled.length, 1);

    forgetUser(userId);
    assert.equal(scheduled[0].cleared, true, "forgetUser must cancel the pending timer");

    graceFileIds.delete(editing.id);
    metadataByFileId.set(editing.id, editing);
    t.mock.timers.tick(DUE_TICK_MS);

    // Even if the (cancelled) timer's callback still ran, there's nothing left to process.
    await scheduled[0].fn();
    assert.equal(claimFile.mock.callCount(), 0, "forgetUser must have dropped the deferred entry");

    await processDeferredFiles(userId);
    assert.equal(claimFile.mock.callCount(), 0);
  } finally {
    t.mock.timers.reset();
  }
});

// -------------------------------------------------------------------------- Finding B: per-kind credit-release paths

test("completeFile resolving null (claim lost at completion) releases the reservation, and the row is never actually recorded", async () => {
  const userId = uid("user");
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 }, // sequential: deterministic order
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 0, document: 1 }, // exactly 1: the second file can only be attempted if the first's reservation was released
    exhausted: false,
  });

  const files = ["d1", "d2"].map((n) => makeDocFile(`${n}-${docProc.id}`, docProc.raw_folder_id));
  const lostFileId = files[0].id;
  completeFileImpl = async (userId2, fileId, claim, result, opts) => {
    if (fileId === lostFileId) return null; // the claim was taken over as stale between the move and recording the result
    const row = claims.get(fileId);
    if (!row || row.status !== "processing" || row.claim !== claim) return null;
    row.status = "completed";
    completeFileCalls.push({ fileId, result, opts });
    return "monthly";
  };
  filesByFolder.set(docProc.raw_folder_id, files);

  const result = await processRawFolder(userId, {});

  assert.equal(result.blocked, 0, "the second file must not be blocked: the first file's reservation was released back");
  assert.equal(result.completed, 2, "the pipeline still reports both as completed — the first file really was renamed and moved");
  assert.equal(completeFileCalls.length, 1, "only the second file's completion was actually recorded and charged");
  assert.deepEqual(completeFileCalls.map((c) => c.fileId), [files[1].id]);
  assert.equal(renameAndMove.mock.callCount(), 2, "the move itself succeeded for both files; only recording the first one's result lost the race");
});

test("completeFile resolving 'overage' zeroes that kind's credit pool for the rest of the run, without blocking the other kind", async () => {
  const userId = uid("user");
  const imageProc = makeProcess(uid("proc"), { kind: "image" });
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [imageProc, docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 }, // aiPerProcess 1: the document queue runs strictly in order
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 1_000_000, document: 5 }, // plenty of local credits; the DB reporting overage is what must stop the run
    exhausted: false,
  });

  completeFileImpl = async (userId2, fileId, claim, result, opts) => {
    const row = claims.get(fileId);
    if (!row || row.status !== "processing" || row.claim !== claim) return null;
    row.status = "completed";
    completeFileCalls.push({ fileId, result, opts });
    // Every document file "overlaps a deploy boundary" in this test — charged, but into the
    // overage bucket, which is what must zero the pool for the rest of the run.
    return opts.kind === "document" ? "overage" : "monthly";
  };

  const docFiles = [1, 2, 3].map((n) => makeDocFile(`doc${n}-${docProc.id}`, docProc.raw_folder_id));
  const imageFiles = [1, 2].map((n) => makeFile(`img${n}-${imageProc.id}`, imageProc.raw_folder_id));
  filesByFolder.set(docProc.raw_folder_id, docFiles);
  filesByFolder.set(imageProc.raw_folder_id, imageFiles);

  const result = await processRawFolder(userId, {});

  const docCompletions = completeFileCalls.filter((c) => c.opts.kind === "document");
  assert.equal(docCompletions.length, 1, "only the first document file should have been charged, at 'overage'");
  assert.equal(docCompletions[0].opts.kind, "document");

  const imageCompletions = completeFileCalls.filter((c) => c.opts.kind === "image");
  assert.equal(imageCompletions.length, 2, "images are a separate credit pool and keep completing in the same run");

  assert.equal(result.completed, 3, "1 document + 2 images");
  assert.equal(result.blocked, 2, "the remaining 2 document files come back blocked once the document pool is zeroed");
});

test("holdsClaim returning false after classification comes back skipped, releases the reservation, and renameAndMove is never called for it", async () => {
  const userId = uid("user");
  const docProc = makeProcess(uid("proc"), { kind: "document" });
  processesForUser = [docProc];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50, freeImages: 0, freeDocuments: 0, monthlyImages: 0, monthlyDocuments: 1_000_000 }, // sequential: deterministic order
    usage: {},
    limits: { image: { freeLimit: 0, monthlyLimit: 1_000_000 }, document: { freeLimit: 0, monthlyLimit: 1_000_000 } },
    credits: { image: 0, document: 1 }, // exactly 1: the second file can only be attempted if the first's reservation was released
    exhausted: false,
  });

  const files = ["d1", "d2"].map((n) => makeDocFile(`${n}-${docProc.id}`, docProc.raw_folder_id));
  const takenOverFileId = files[0].id;
  holdsClaimImpl = async (userId2, fileId, claim) => {
    if (fileId === takenOverFileId) return false; // taken over as stale right after classification
    const row = claims.get(fileId);
    return Boolean(row) && row.status === "processing" && row.claim === claim;
  };
  filesByFolder.set(docProc.raw_folder_id, files);

  const result = await processRawFolder(userId, {});

  assert.equal(result.skipped, 1);
  assert.equal(result.completed, 1);
  assert.equal(result.blocked, 0, "the second file must not be blocked: the first file's reservation was released");
  assert.equal(
    renameAndMove.mock.calls.filter((c) => c.arguments[1] === takenOverFileId).length,
    0,
    "renameAndMove must never be called for a file whose claim was taken over",
  );
  assert.equal(renameAndMove.mock.callCount(), 1, "only the second (still-owned) file was actually moved");
  assert.deepEqual(completeFileCalls.map((c) => c.fileId), [files[1].id]);
});
