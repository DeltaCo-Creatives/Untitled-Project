// Run from backend/: node --test --experimental-test-module-mocks test/account-delete.test.js
//
// Only node:test's own mocking is used (no new dependency). Every collaborator
// account.service.js talks to (the pipeline, driveWatch, driveConnect, the user
// repository, and requireAuth) is mocked, so this never touches Supabase or Google.
import { test, mock, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

// dotenv (loaded by config/env.js on first import, below) never overwrites an
// already-set var, so this pins errorHandler's production behavior — hiding
// unexpected error messages — regardless of what backend/.env happens to have.
process.env.NODE_ENV = "production";
// Placeholders set before config/env.js runs dotenv (which never overrides a set var), so the real backend/.env
// secrets never load here, and the test also runs on a checkout that has no .env at all.
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);

let sweeping = false;
let disconnectImpl = async () => {};
let deleteAuthUserImpl = async () => {};
const calls = [];

const disconnectDrive = mock.fn(async (userId) => {
  calls.push("disconnectDrive");
  return disconnectImpl(userId);
});
const dropPendingGrantsForUser = mock.fn(async () => {
  calls.push("dropPendingGrantsForUser");
});
const deleteAuthUser = mock.fn(async (userId) => {
  calls.push("deleteAuthUser");
  return deleteAuthUserImpl(userId);
});

// account.routes.js imports repositories that build the Supabase client at import time; a stub keeps this test
// runnable on a checkout without backend/.env (and away from the real database).
mock.module("../src/lib/supabase.js", { namedExports: { supabase: {} } });

mock.module("../src/middleware/requireAuth.js", {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = { id: "u1" };
      next();
    },
  },
});

mock.module("../src/services/pipeline.service.js", {
  namedExports: {
    isSweeping: () => sweeping,
  },
});

mock.module("../src/services/driveWatch.service.js", {
  namedExports: {
    disconnectDrive,
    // Also imported by services/processes.service.js, which account.routes.js
    // pulls in for GET /me — unused by these tests, but a static import of a
    // name this mock doesn't provide would fail the whole module graph.
    stopWatch: async () => {},
  },
});

mock.module("../src/services/driveConnect.service.js", {
  namedExports: { dropPendingGrantsForUser },
});

mock.module("../src/repositories/user.repo.js", {
  namedExports: { deleteAuthUser },
});

const { default: accountRouter } = await import("../src/routes/account.routes.js");
const { errorHandler, notFound } = await import("../src/middleware/errorHandler.js");

const app = express();
app.use(express.json());
app.use("/api", accountRouter);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

beforeEach(() => {
  sweeping = false;
  disconnectImpl = async () => {};
  deleteAuthUserImpl = async () => {};
  calls.length = 0;
  disconnectDrive.mock.resetCalls();
  dropPendingGrantsForUser.mock.resetCalls();
  deleteAuthUser.mock.resetCalls();
});

function del(body) {
  return fetch(`${base}/api/me`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

test("400 when confirm is missing, and nothing is deleted", async () => {
  const res = await del({});
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, "confirm_required");
  assert.equal(deleteAuthUser.mock.callCount(), 0);
  assert.equal(disconnectDrive.mock.callCount(), 0);
});

test("400 when confirm is wrong, and nothing is deleted", async () => {
  const res = await del({ confirm: "delete" });
  assert.equal(res.status, 400);
  assert.equal(deleteAuthUser.mock.callCount(), 0);
  assert.equal(disconnectDrive.mock.callCount(), 0);
});

test("409 sorting_in_progress while a sweep runs, and nothing is disconnected or deleted", async () => {
  sweeping = true;
  const res = await del({ confirm: "DELETE" });
  assert.equal(res.status, 409);
  const json = await res.json();
  assert.equal(json.code, "sorting_in_progress");
  assert.equal(disconnectDrive.mock.callCount(), 0);
  assert.equal(deleteAuthUser.mock.callCount(), 0);
});

test("happy path: disconnects Drive then deletes the auth user, in order", async () => {
  const res = await del({ confirm: "DELETE" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json, { deleted: true });
  assert.equal(disconnectDrive.mock.callCount(), 1);
  assert.equal(deleteAuthUser.mock.callCount(), 1);
  assert.deepEqual(
    calls.filter((c) => c === "disconnectDrive" || c === "deleteAuthUser"),
    ["disconnectDrive", "deleteAuthUser"],
  );
  assert.equal(disconnectDrive.mock.calls[0].arguments[0], "u1");
  assert.equal(deleteAuthUser.mock.calls[0].arguments[0], "u1");
});

test("deletion still happens when disconnectDrive throws (Google revoke failing must not block it)", async () => {
  disconnectImpl = async () => {
    throw new Error("Google is down");
  };
  const res = await del({ confirm: "DELETE" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json, { deleted: true });
  assert.equal(disconnectDrive.mock.callCount(), 1);
  assert.equal(deleteAuthUser.mock.callCount(), 1);
});

test("a failing deleteAuthUser yields a 500 with no exposed details", async () => {
  deleteAuthUserImpl = async () => {
    throw new Error("Failed to delete user: service role key rejected");
  };
  const res = await del({ confirm: "DELETE" });
  assert.equal(res.status, 500);
  const json = await res.json();
  assert.equal(json.error, "Internal server error");
  assert.equal(json.code, undefined);
});
