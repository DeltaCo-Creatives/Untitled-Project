// Run from backend/: node --test --experimental-test-module-mocks test/admin.test.js
//
// Route-level tests for /api/admin/*, same hermetic pattern as test/beta.test.js: a real
// Express app driven over HTTP with fetch, with every Supabase-backed repository mocked
// so nothing here touches a real database. config/env.js is left real (like beta.test.js)
// with the settings' env fallbacks set via process.env before anything imports it, so
// "source: environment" in the settings responses reflects real env.js behaviour.
import { test, mock, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "production";
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.BETA_DISCOUNT_PERCENT = "20";
process.env.BETA_DISCOUNT_CODE = "BETA20";
process.env.GOOGLE_APP_TESTING = "true";
process.env.LEMONSQUEEZY_STORE = "drivetag";
process.env.LEMONSQUEEZY_VARIANTS = JSON.stringify({ creator: "111" });

// The only real (unmocked) path that reaches lib/supabase.js is middleware/requireAdmin.js's
// real services/beta.service.js -> repositories/betaSignup.repo.js import (kept real so
// isAdmin()/normalizeEmail() are the actual implementation under test). This stub keeps that
// chain from building a real Supabase client at import time; every repository the admin
// routes call directly is mocked below instead.
mock.module("../src/lib/supabase.js", { namedExports: { supabase: {} } });

let currentUser = { id: "admin-1", email: "admin@example.com" };
mock.module("../src/middleware/requireAuth.js", {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = currentUser;
      next();
    },
  },
});

// ---- app_settings ----
let settingsRows = [];
let getAllShouldThrow = false;
const getAll = mock.fn(async () => {
  if (getAllShouldThrow) throw new Error('relation "app_settings" does not exist');
  return settingsRows;
});
const setMany = mock.fn(async (entries) => {
  for (const { key, value } of entries) {
    settingsRows = settingsRows.filter((row) => row.key !== key);
    settingsRows.push({ key, value });
  }
});
const remove = mock.fn(async (key) => {
  settingsRows = settingsRows.filter((row) => row.key !== key);
});
mock.module("../src/repositories/appSettings.repo.js", { namedExports: { getAll, setMany, remove } });

// ---- subscriptions / accounts ----
let lookupResult = null;
const adminUserLookup = mock.fn(async () => lookupResult);
let setPlanImpl = async (userId, plan, status) => ({ user_id: userId, plan, status });
const adminSetPlanById = mock.fn(async (...args) => setPlanImpl(...args));
let grantCreditsImpl = async () => 10;
const grantCredits = mock.fn(async (...args) => grantCreditsImpl(...args));
mock.module("../src/repositories/subscription.repo.js", {
  namedExports: { adminUserLookup, adminSetPlanById, grantCredits },
});

// ---- usage (entitlement.service.js's loadEntitlement -> usage.repo.js) ----
let usageResult = null;
const getUsage = mock.fn(async () => usageResult);
mock.module("../src/repositories/usage.repo.js", { namedExports: { getUsage } });

const { default: adminRouter } = await import("../src/routes/admin.routes.js");
const { errorHandler, notFound } = await import("../src/middleware/errorHandler.js");
const settingsService = await import("../src/services/settings.service.js");

const app = express();
app.use(express.json());
app.use("/api/admin", adminRouter);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());

const ADMIN = { id: "admin-1", email: "admin@example.com" };
const NON_ADMIN = { id: "u1", email: "someone@example.com" };

beforeEach(() => {
  currentUser = ADMIN;
  settingsRows = [];
  getAllShouldThrow = false;
  lookupResult = null;
  setPlanImpl = async (userId, plan, status) => ({ user_id: userId, plan, status });
  grantCreditsImpl = async () => 10;
  usageResult = null;
  getAll.mock.resetCalls();
  setMany.mock.resetCalls();
  remove.mock.resetCalls();
  adminUserLookup.mock.resetCalls();
  adminSetPlanById.mock.resetCalls();
  grantCredits.mock.resetCalls();
  getUsage.mock.resetCalls();
});

function get(path) {
  return fetch(`${base}${path}`);
}
function put(path, body) {
  return fetch(`${base}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
}
function del(path) {
  return fetch(`${base}${path}`, { method: "DELETE" });
}
function post(path, body) {
  return fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
}

const usageFixture = {
  plan: "creator",
  status: "active",
  free_images_used: 10,
  period_images_used: 5,
  topup_balance: 100,
  free_documents_used: 0,
  period_documents_used: 0,
  document_topup_balance: 0,
  period_start: "2026-09-01T00:00:00Z",
  period_end: "2026-10-01T00:00:00Z",
};

// -------------------------------------------------------------------- 1. admin gate

test("every admin route 403s not_admin for a non-admin", async () => {
  currentUser = NON_ADMIN;
  const routes = [
    () => get("/api/admin/settings"),
    () => put("/api/admin/settings", { betaDiscountPercent: 10 }),
    () => del("/api/admin/settings/betaDiscountPercent"),
    () => get("/api/admin/users?email=someone@example.com"),
    () => post("/api/admin/users/plan", { email: "someone@example.com", plan: "creator" }),
    () => post("/api/admin/users/credits", { email: "someone@example.com", kind: "image", amount: 10, reason: "test" }),
  ];
  for (const call of routes) {
    const res = await call();
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, "not_admin");
  }
  assert.equal(getAll.mock.callCount(), 0, "no settings read should happen before the admin check");
});

test("GET /api/admin/settings works for an admin", async () => {
  const res = await get("/api/admin/settings");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.settings.betaDiscountPercent.value, 20);
  assert.equal(json.settings.betaDiscountPercent.source, "environment");
});

// ------------------------------------------------------------- 2. PUT validation

test("PUT rejects an unknown key", async () => {
  const res = await put("/api/admin/settings", { notARealSetting: true });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unknown_setting");
  assert.equal(setMany.mock.callCount(), 0);
});

test("PUT rejects an out-of-range betaDiscountPercent", async () => {
  const res = await put("/api/admin/settings", { betaDiscountPercent: 91 });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_setting");
  assert.equal(setMany.mock.callCount(), 0);
});

test("PUT accepts a valid change and the next GET reflects it with source: database", async () => {
  const put1 = await put("/api/admin/settings", { betaDiscountPercent: 30 });
  assert.equal(put1.status, 200);
  const putJson = await put1.json();
  assert.equal(putJson.settings.betaDiscountPercent.value, 30);
  assert.equal(putJson.settings.betaDiscountPercent.source, "database");
  assert.equal(setMany.mock.callCount(), 1);
  // updated_by is the acting admin's user id, never their email.
  assert.equal(setMany.mock.calls[0].arguments[1], "admin-1");

  const res = await get("/api/admin/settings");
  const json = await res.json();
  assert.equal(json.settings.betaDiscountPercent.value, 30);
  assert.equal(json.settings.betaDiscountPercent.source, "database");
});

// --------------------------------------------------- 3. never a secret or admin list

test("PUT cannot set adminEmails, a webhook secret, or the service-role key — all rejected as unknown_setting", async () => {
  for (const body of [
    { adminEmails: ["evil@example.com"] },
    { lemonSqueezyWebhookSecret: "whsec_stolen" },
    { supabaseServiceRoleKey: "sb_secret_stolen" },
    // Mixed with an otherwise-valid key: the whole request must still be refused, not
    // partially applied.
    { betaDiscountPercent: 10, adminEmails: ["evil@example.com"] },
  ]) {
    const res = await put("/api/admin/settings", body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal((await res.json()).code, "unknown_setting", JSON.stringify(body));
  }
  assert.equal(setMany.mock.callCount(), 0, "nothing must be written, including the valid key in the mixed body");
});

// --------------------------------------------------------- 4. GET never leaks secrets

test("GET /api/admin/settings never includes a secret value or the admin email list, only a count", async () => {
  const res = await get("/api/admin/settings");
  const json = await res.json();
  const raw = JSON.stringify(json);

  assert.equal(typeof json.readOnly.adminEmails, "number");
  assert.equal(json.readOnly.adminEmails, 1);
  assert.ok(!raw.includes("admin@example.com"), "the admin email itself must never appear in the response");
  assert.ok(!("adminEmails" in json.settings), "adminEmails must not be a settings key");
  for (const key of Object.keys(json.settings)) {
    assert.ok(!/secret|serviceRole|webhook/i.test(key), `"${key}" looks like a secret and must not be exposed`);
  }
});

// ----------------------------------------------------------------- 5. DELETE clears

test("DELETE clears a database override and falls back to the environment value", async () => {
  await put("/api/admin/settings", { betaDiscountPercent: 30 });
  const cleared = await del("/api/admin/settings/betaDiscountPercent");
  assert.equal(cleared.status, 200);
  const json = await cleared.json();
  assert.equal(json.settings.betaDiscountPercent.value, 20); // BETA_DISCOUNT_PERCENT=20
  assert.equal(json.settings.betaDiscountPercent.source, "environment");
  assert.equal(remove.mock.callCount(), 1);
  assert.equal(remove.mock.calls[0].arguments[0], "betaDiscountPercent");
});

test("DELETE on an unknown key is unknown_setting, not a silent success", async () => {
  const res = await del("/api/admin/settings/notARealSetting");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unknown_setting");
  assert.equal(remove.mock.callCount(), 0);
});

// --------------------------------------------------------- 6. lemonSqueezyVariants

test("lemonSqueezyVariants rejects an unknown plan/pack id", async () => {
  const res = await put("/api/admin/settings", { lemonSqueezyVariants: { "not-a-real-plan": "123" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_setting");
  assert.equal(setMany.mock.callCount(), 0);
});

test("lemonSqueezyVariants rejects a non-numeric variant id", async () => {
  const res = await put("/api/admin/settings", { lemonSqueezyVariants: { creator: "not-numeric" } });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_setting");
  assert.equal(setMany.mock.callCount(), 0);
});

test("lemonSqueezyVariants accepts a known plan id, a -yearly id, and a pack id", async () => {
  const res = await put("/api/admin/settings", {
    lemonSqueezyVariants: { creator: "111", "creator-yearly": "112", "pack-250": "210" },
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.settings.lemonSqueezyVariants.value, { creator: "111", "creator-yearly": "112", "pack-250": "210" });
});

// ------------------------------------------------------------- 7. insufficient credits

test("granting credits that would take the balance below zero is a readable 400, not a 500", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  usageResult = usageFixture;
  grantCreditsImpl = async () => {
    const err = new Error("insufficient_credits: image top-up balance is 5, cannot remove 20");
    err.code = "insufficient_credits";
    throw err;
  };
  const res = await post("/api/admin/users/credits", { email: "someone@example.com", kind: "image", amount: -20, reason: "correction" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "insufficient_credits");
});

// -------------------------------------------------------- 8. settings service fail-soft

test("the settings service falls back to environment values when the repository throws", async () => {
  getAllShouldThrow = true;
  const resolved = await settingsService.getSettingsWithSource();
  assert.equal(resolved.betaDiscountPercent.value, 20);
  assert.equal(resolved.betaDiscountPercent.source, "environment");
  assert.equal(resolved.googleAppTesting.value, true);
  assert.equal(resolved.googleAppTesting.source, "environment");
  // The synchronous hot-path reader (used by lemonSqueezy.service.js/beta.service.js) must
  // also never throw or block when the database is unreachable.
  assert.equal(settingsService.getSetting("betaDiscountCode"), "BETA20");
});

// ------------------------------------------------------------------- accounts: lookup

test("GET /api/admin/users returns null for an unknown email", async () => {
  lookupResult = null;
  const res = await get("/api/admin/users?email=nobody@example.com");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user: null });
});

test("GET /api/admin/users returns the account's plan, status and usage", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  usageResult = usageFixture;
  const res = await get("/api/admin/users?email=SOMEONE@EXAMPLE.COM");
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.id, "u2");
  assert.equal(user.plan, "creator");
  assert.equal(user.status, "active");
  assert.equal(user.usage.images.remaining > 0, true);
  assert.equal(adminUserLookup.mock.calls[0].arguments[0], "someone@example.com"); // normalized lower-case
});

test("GET /api/admin/users with no email is a 400, not a lookup", async () => {
  const res = await get("/api/admin/users");
  assert.equal(res.status, 400);
  assert.equal(adminUserLookup.mock.callCount(), 0);
});

// --------------------------------------------------------------- accounts: set plan

test("POST /api/admin/users/plan 404s user_not_found for an unknown email", async () => {
  lookupResult = null;
  const res = await post("/api/admin/users/plan", { email: "nobody@example.com", plan: "creator" });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "user_not_found");
  assert.equal(adminSetPlanById.mock.callCount(), 0);
});

test("POST /api/admin/users/plan rejects an unknown plan id", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  const res = await post("/api/admin/users/plan", { email: "someone@example.com", plan: "not-a-real-plan" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_plan");
  assert.equal(adminSetPlanById.mock.callCount(), 0);
});

test("POST /api/admin/users/plan rejects an unknown status", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  const res = await post("/api/admin/users/plan", { email: "someone@example.com", plan: "creator", status: "trialing" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_status");
});

test("POST /api/admin/users/plan sets the plan and defaults status to active, restartPeriod to false", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  usageResult = { ...usageFixture, plan: "studio" };
  const res = await post("/api/admin/users/plan", { email: "someone@example.com", plan: "studio" });
  assert.equal(res.status, 200);
  assert.equal(adminSetPlanById.mock.calls[0].arguments[1], "studio");
  assert.equal(adminSetPlanById.mock.calls[0].arguments[2], "active");
  assert.equal(adminSetPlanById.mock.calls[0].arguments[3], false);
  const { user } = await res.json();
  assert.equal(user.plan, "studio");
});

// ------------------------------------------------------------ accounts: grant credits

test("POST /api/admin/users/credits requires a reason", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  const res = await post("/api/admin/users/credits", { email: "someone@example.com", kind: "image", amount: 100 });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_reason");
  assert.equal(grantCredits.mock.callCount(), 0);
});

test("POST /api/admin/users/credits passes provider_reference: null so manual grants stay repeatable", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  usageResult = usageFixture;
  const res = await post("/api/admin/users/credits", {
    email: "someone@example.com",
    kind: "image",
    amount: 1000,
    reason: "Image pack 1000, invoice #12",
  });
  assert.equal(res.status, 200);
  assert.equal(grantCredits.mock.callCount(), 1);
  const arg = grantCredits.mock.calls[0].arguments[0];
  assert.equal(arg.reference, null);
  assert.equal(arg.kind, "image");
  assert.equal(arg.amount, 1000);
  assert.equal(arg.reason, "Image pack 1000, invoice #12");
});

test("POST /api/admin/users/credits rejects an unknown kind", async () => {
  lookupResult = { id: "u2", email: "someone@example.com", createdAt: "2026-01-01T00:00:00Z" };
  const res = await post("/api/admin/users/credits", { email: "someone@example.com", kind: "video", amount: 10, reason: "test" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "invalid_kind");
  assert.equal(grantCredits.mock.callCount(), 0);
});

test("inherited Object keys are rejected cleanly as unknown_setting, not as an internal TypeError", async () => {
  // The key comes from a request body, and JSON.parse makes "__proto__" an own property.
  // A bare REGISTRY[key] lookup resolves these to Object.prototype — truthy — so they would slip
  // past the "unknown key" guard and then throw on def.validate, leaking an internal error.
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const res = await put('/api/admin/settings', JSON.parse(`{"${key}": 1}`));
    assert.equal(res.status, 400, `${key} must be rejected`);
    const json = await res.json();
    assert.equal(json.code, 'unknown_setting', `${key} must be unknown_setting, not invalid_setting`);
    assert.doesNotMatch(json.error ?? '', /is not a function|undefined/i, `${key} must not leak an internal error`);
  }
  assert.equal(setMany.mock.callCount(), 0, 'nothing may be written');
});

test("DELETE of an inherited Object key is rejected, not treated as a real setting", async () => {
  for (const key of ['__proto__', 'constructor']) {
    const res = await fetch(`${base}/api/admin/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
    assert.equal(res.status, 400, `${key} must be rejected`);
    assert.equal((await res.json()).code, 'unknown_setting');
  }
});
