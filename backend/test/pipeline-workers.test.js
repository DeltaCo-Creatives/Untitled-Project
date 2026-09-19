// Run from backend/: node --test --experimental-test-module-mocks test/pipeline-workers.test.js
//
// Covers the concurrent per-process worker pools added to pipeline.service.js: every
// collaborator (env, drive.service, gemini.service, entitlement.service, and the
// repositories) is mocked, so this never touches Supabase, Drive or Gemini.
import { test, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------- shared fake state

const GLOBAL_CAP = 3; // env.pipeline.maxConcurrentAiJobs — fixed once pipeline.service.js loads

let uidCounter = 0;
const uid = (label) => `${label}-${(uidCounter += 1)}`;

function makeProcess(id, { rawFolderId = `raw-${id}` } = {}) {
  return {
    id,
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

function resetConcurrencyProbe() {
  gate = Promise.resolve();
  globalInFlight = 0;
  globalPeak = 0;
  perProcessInFlight.clear();
  perProcessPeak.clear();
  failClassifyIds.clear();
}

// ---------------------------------------------------------------- collaborator mocks

const claims = new Map(); // fileId → { claim, status }
let claimCounter = 0;
const forceClaimFail = new Set();
const completeFileCalls = [];

function resetRepoState() {
  claims.clear();
  claimCounter = 0;
  forceClaimFail.clear();
  completeFileCalls.length = 0;
}

const claimFile = mock.fn(async (userId, fileId) => {
  if (forceClaimFail.has(fileId) || claims.has(fileId)) return null;
  claimCounter += 1;
  const claim = `claim-${claimCounter}`;
  claims.set(fileId, { claim, status: "processing" });
  return claim;
});
const holdsClaim = mock.fn(async (userId, fileId, claim) => {
  const row = claims.get(fileId);
  return Boolean(row) && row.status === "processing" && row.claim === claim;
});
const completeFile = mock.fn(async (userId, fileId, claim) => {
  const row = claims.get(fileId);
  if (!row || row.status !== "processing" || row.claim !== claim) return null;
  row.status = "completed";
  completeFileCalls.push(fileId);
  return "monthly";
});
const recordFailure = mock.fn(async (userId, fileId, claim) => {
  const row = claims.get(fileId);
  if (!row || row.status !== "processing" || row.claim !== claim) return false;
  row.status = "failed";
  return true;
});
const releaseFailed = mock.fn(async () => {});
const getStatuses = mock.fn(async () => new Map());
const isStaleClaim = () => false;

let filesByFolder = new Map(); // rawFolderId → file[]
const getFileBuffer = mock.fn(async (userId, fileId) => Buffer.from(fileId));
const renameAndMove = mock.fn(async () => ({}));
const getStartPageToken = mock.fn(async () => "fast-forward-token");
const listImagesInFolder = mock.fn(async (userId, folderId) => filesByFolder.get(folderId) ?? []);

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

let entitlementImpl = () => ({
  plan: { id: "test", aiPerProcess: 2, maxProcesses: 50 },
  usage: {},
  limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
  credits: 1_000_000,
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
mock.module("../src/services/gemini.service.js", { namedExports: { classifyImage } });
mock.module("../src/services/drive.service.js", {
  namedExports: { getFileBuffer, getStartPageToken, listChanges, listImagesInFolder, renameAndMove },
});
mock.module("../src/services/entitlement.service.js", { namedExports: { loadEntitlement, rankProcesses } });
mock.module("../src/repositories/workProcess.repo.js", { namedExports: { listProcesses } });
mock.module("../src/repositories/driveChannel.repo.js", { namedExports: { updatePageToken, getChannelForUser } });
mock.module("../src/repositories/processedFile.repo.js", {
  namedExports: { claimFile, holdsClaim, completeFile, recordFailure, releaseFailed, getStatuses, isStaleClaim },
});

const { processNotification, processRawFolder, getProcessesStatus } = await import("../src/services/pipeline.service.js");

beforeEach(() => {
  resetConcurrencyProbe();
  resetRepoState();
  filesByFolder = new Map();
  listChangesImpl = async () => ({ changes: [], nextPageToken: undefined, newStartPageToken: "start-token" });
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50 },
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 1_000_000,
    exhausted: false,
  });
  processesForUser = [];
  for (const fn of [
    claimFile, holdsClaim, completeFile, recordFailure, releaseFailed, getStatuses,
    getFileBuffer, renameAndMove, getStartPageToken, listImagesInFolder, listChanges,
    updatePageToken, getChannelForUser, classifyImage, loadEntitlement, listProcesses,
  ]) {
    fn.mock.resetCalls();
  }
});

// -------------------------------------------------------------------------- tests

test("a process never runs more AI workers than plan.aiPerProcess, and reaches that cap", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50 },
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 1_000_000,
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
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50 }, // 1 each: any overlap must be cross-process
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 1_000_000,
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
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50 }, // 3 processes × 2 = 6 possible, cap is 3
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 1_000_000,
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
  assert.deepEqual(completeFileCalls, [file.id]);
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
  assert.deepEqual(completeFileCalls, [free.id]);
});

test("with 3 credits and 10 queued files, exactly 3 complete and the rest are blocked", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50 },
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 3,
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

test("a failed classification releases its credit reservation for a later file", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 1, maxProcesses: 50 }, // sequential: deterministic order
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 3,
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
    plan: { id: "test", aiPerProcess: 2, maxProcesses: 50 },
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 1_000_000,
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

test("the changes-feed sweep fast-forwards and stops when credits run out mid-page", async () => {
  const userId = uid("user");
  const process = makeProcess(uid("proc"));
  processesForUser = [process];
  entitlementImpl = () => ({
    plan: { id: "test", aiPerProcess: 4, maxProcesses: 50 },
    usage: {},
    limits: { freeLimit: 0, monthlyLimit: 1_000_000 },
    credits: 3,
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
