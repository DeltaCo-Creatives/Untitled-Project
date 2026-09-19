// Run from backend/: node --test --experimental-test-module-mocks test/processes-organize.test.js
//
// Route-level test for POST /api/processes/:id/organize's per-kind credit gate (phase 2 spec §4):
// a 402 naming the kind when that process's kind is out of credits, and willProcess = min(waiting,
// credits[kind]) otherwise. Same pattern as test/account-delete.test.js: a real Express app with
// every collaborator mocked, driven over HTTP with fetch, so this never touches Supabase or Drive.
import { test, mock, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "production";
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);

mock.module("../src/lib/supabase.js", { namedExports: { supabase: {} } });
mock.module("../src/middleware/requireAuth.js", {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = { id: "u1" };
      next();
    },
  },
});

function makeProcess(overrides = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    kind: "image",
    name: "Test process",
    raw_folder_id: "raw1",
    raw_folder_name: "Raw",
    master_folder_id: "master1",
    master_folder_name: "Master",
    rename_template: "{subject}",
    instructions: "",
    tag_fields: [],
    timezone: "UTC",
    enabled: true,
    locked: false,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    destinations: [],
    ...overrides,
  };
}

let processesForUser = [];
let entitlementForUser = null;
const listForUser = mock.fn(async () => ({
  processes: processesForUser,
  limit: { used: processesForUser.length, max: 5, planId: "test" },
  entitlement: entitlementForUser,
}));

mock.module("../src/services/processes.service.js", {
  namedExports: {
    listForUser,
    getForUser: async () => {
      throw new Error("not used by these tests");
    },
    saveForUser: async () => {
      throw new Error("not used by these tests");
    },
    setEnabledForUser: async () => {
      throw new Error("not used by these tests");
    },
    deleteForUser: async () => {
      throw new Error("not used by these tests");
    },
  },
});

let sweeping = false;
let statusesForProcess = {};
const processRawFolder = mock.fn(async () => {});
mock.module("../src/services/pipeline.service.js", {
  namedExports: {
    isSweeping: () => sweeping,
    getProcessesStatus: async () => ({ syncing: sweeping, kind: null, activeProcessId: null, statuses: statusesForProcess, workers: {} }),
    processRawFolder,
  },
});

const { default: processesRouter } = await import("../src/routes/processes.routes.js");
const { errorHandler, notFound } = await import("../src/middleware/errorHandler.js");

const app = express();
app.use(express.json());
app.use("/api/processes", processesRouter);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

beforeEach(() => {
  processesForUser = [];
  entitlementForUser = null;
  sweeping = false;
  statusesForProcess = {};
  listForUser.mock.resetCalls();
  processRawFolder.mock.resetCalls();
});

function organize(id, body) {
  return fetch(`${base}/api/processes/${id}/organize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

test("402 out_of_documents naming the kind, for a document process with no document credits (even with image credits left)", async () => {
  const process = makeProcess({ kind: "document" });
  processesForUser = [process];
  entitlementForUser = {
    plan: { id: "docs-creator", label: "Creator", freeImages: 0, freeDocuments: 0 },
    credits: { image: 1000, document: 0 },
  };

  const res = await organize(process.id);

  assert.equal(res.status, 402);
  const json = await res.json();
  assert.equal(json.code, "out_of_documents");
  assert.match(json.error, /document/i);
  assert.equal(processRawFolder.mock.callCount(), 0, "must not start a run for a process it just 402'd");
});

test("402 out_of_images naming the kind, for an image process with no image credits (even with document credits left)", async () => {
  const process = makeProcess({ kind: "image" });
  processesForUser = [process];
  entitlementForUser = {
    plan: { id: "docs-creator", label: "Creator", freeImages: 0, freeDocuments: 0 },
    credits: { image: 0, document: 1000 },
  };

  const res = await organize(process.id);

  assert.equal(res.status, 402);
  const json = await res.json();
  assert.equal(json.code, "out_of_images");
  assert.match(json.error, /image/i);
  assert.equal(processRawFolder.mock.callCount(), 0);
});

test("202 started with willProcess = min(waiting, credits[kind]) for a document process", async () => {
  const process = makeProcess({ kind: "document" });
  processesForUser = [process];
  entitlementForUser = {
    plan: { id: "docs-creator", label: "Creator", freeImages: 0, freeDocuments: 0 },
    credits: { image: 0, document: 3 },
  };
  statusesForProcess = { [process.id]: { waiting: 10, processing: 0, failed: 0, total: 10 } };

  const res = await organize(process.id);

  assert.equal(res.status, 202);
  const json = await res.json();
  assert.deepEqual(json, { started: true, waiting: 10, willProcess: 3 });
  assert.equal(processRawFolder.mock.callCount(), 1);
  assert.deepEqual(processRawFolder.mock.calls[0].arguments, [
    "u1",
    { processId: process.id, retryFailed: false },
  ]);
});

test("404 for a process that doesn't exist, before any credit check", async () => {
  processesForUser = [];
  entitlementForUser = { plan: { id: "free", freeImages: 100, freeDocuments: 25 }, credits: { image: 0, document: 0 } };

  const res = await organize("22222222-2222-2222-2222-222222222222");

  assert.equal(res.status, 404);
  assert.equal(processRawFolder.mock.callCount(), 0);
});
