// Run from backend/: node --test --experimental-test-module-mocks test/beta.test.js
//
// Route-level tests for /api/beta/*, same hermetic pattern as test/account-delete.test.js:
// a real Express app with betaSignup.repo.js and requireAuth mocked, driven over HTTP with
// fetch, so this never touches Supabase. The rate limiter is keyed by req.ip, so each test
// group uses its own X-Forwarded-For address (the test app trusts the proxy, like production)
// to keep the 5-per-hour window from leaking between unrelated tests.
import { test, mock, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "production";
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
process.env.ADMIN_EMAILS = "admin@example.com";
process.env.BETA_DISCOUNT_PERCENT = "20";
process.env.BETA_DISCOUNT_CODE = "BETA20";

mock.module("../src/lib/supabase.js", { namedExports: { supabase: {} } });

let currentUser = { id: "u1", email: "someone@example.com" };
mock.module("../src/middleware/requireAuth.js", {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = currentUser;
      next();
    },
  },
});

const upsertSignup = mock.fn(async () => {});
let signupsForList = [];
const listSignups = mock.fn(async () => signupsForList);
let setAddedResult = null;
const setAdded = mock.fn(async () => setAddedResult);
let setNotesResult = null;
const setNotes = mock.fn(async () => setNotesResult);
let findByEmailResult = null;
const findByEmail = mock.fn(async () => findByEmailResult);

mock.module("../src/repositories/betaSignup.repo.js", {
  namedExports: { upsertSignup, listSignups, setAdded, setNotes, findByEmail },
});

const { default: betaRouter } = await import("../src/routes/beta.routes.js");
const beta = await import("../src/services/beta.service.js");
const { errorHandler, notFound } = await import("../src/middleware/errorHandler.js");

const app = express();
app.set("trust proxy", true); // lets X-Forwarded-For below stand in for distinct client IPs
app.use(express.json());
app.use("/api/beta", betaRouter);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

beforeEach(() => {
  currentUser = { id: "u1", email: "someone@example.com" };
  signupsForList = [];
  setAddedResult = null;
  setNotesResult = null;
  findByEmailResult = null;
  upsertSignup.mock.resetCalls();
  listSignups.mock.resetCalls();
  setAdded.mock.resetCalls();
  setNotes.mock.resetCalls();
  findByEmail.mock.resetCalls();
});

function post(path, body, ip) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body ?? {}),
  });
}

function get(path, { asAdmin = false } = {}) {
  currentUser = asAdmin ? { id: "admin", email: "admin@example.com" } : { id: "u1", email: "someone@example.com" };
  return fetch(`${base}${path}`);
}

function patch(path, body, { asAdmin = true } = {}) {
  currentUser = asAdmin ? { id: "admin", email: "admin@example.com" } : { id: "u1", email: "someone@example.com" };
  return fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

test("valid public signup returns 201 and upserts a trimmed, lower-cased email", async () => {
  const res = await post(
    "/api/beta/signups",
    { name: "  Jane Doe  ", email: "  JANE@EXAMPLE.COM  ", workType: "Photography", weeklyVolume: "50-100", consent: true },
    "10.0.0.1",
  );
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { received: true });
  assert.equal(upsertSignup.mock.callCount(), 1);
  const arg = upsertSignup.mock.calls[0].arguments[0];
  assert.equal(arg.email, "jane@example.com");
  assert.equal(arg.name, "Jane Doe");
});

test("missing consent is a 400 with details.consent, and upsertSignup is not called", async () => {
  const res = await post("/api/beta/signups", { name: "Jane", email: "jane@example.com", consent: false }, "10.0.0.2");
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, "invalid_signup");
  assert.ok(json.details.some((d) => d.field === "consent"));
  assert.equal(upsertSignup.mock.callCount(), 0);
});

test("a malformed email is a 400 with details.email, and upsertSignup is not called", async () => {
  const res = await post("/api/beta/signups", { name: "Jane", email: "not-an-email", consent: true }, "10.0.0.3");
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, "invalid_signup");
  assert.ok(json.details.some((d) => d.field === "email"));
  assert.equal(upsertSignup.mock.callCount(), 0);
});

test("the 6th submission from one IP within the hour is 429 rate_limited; the 5th still succeeds", async () => {
  const ip = "10.0.0.4";
  const body = { name: "Jane", email: "jane@example.com", consent: true };
  for (let i = 0; i < 5; i++) {
    const res = await post("/api/beta/signups", body, ip);
    assert.equal(res.status, 201, `submission ${i + 1} should succeed`);
  }
  const sixth = await post("/api/beta/signups", body, ip);
  assert.equal(sixth.status, 429);
  assert.equal((await sixth.json()).code, "rate_limited");
  assert.equal(upsertSignup.mock.callCount(), 5);
});

test("GET /api/beta/signups is 403 not_admin for a non-admin, 200 with rows for an admin", async () => {
  signupsForList = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      email: "jane@example.com",
      name: "Jane",
      work_type: "Photography",
      weekly_volume: "50-100",
      added_to_google: true,
      added_at: "2026-09-01T00:00:00Z",
      notes: null,
      created_at: "2026-08-01T00:00:00Z",
    },
  ];

  const denied = await get("/api/beta/signups", { asAdmin: false });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, "not_admin");

  const allowed = await get("/api/beta/signups", { asAdmin: true });
  assert.equal(allowed.status, 200);
  const json = await allowed.json();
  assert.equal(json.counts.total, 1);
  assert.equal(json.counts.added, 1);
  assert.equal(json.counts.pending, 0);
  assert.equal(json.signups[0].email, "jane@example.com");
  assert.equal(json.signups[0].addedToGoogle, true);
});

test("betaStatusFor returns discountCode: null when added_to_google is false, even with the env vars set", async () => {
  findByEmailResult = { added_to_google: false };
  const status = await beta.betaStatusFor("jane@example.com");
  assert.deepEqual(status, { tester: false, discountPercent: 0, discountCode: null });
});

test("betaStatusFor returns the code once added_to_google is true", async () => {
  findByEmailResult = { added_to_google: true };
  const status = await beta.betaStatusFor("jane@example.com");
  assert.deepEqual(status, { tester: true, discountPercent: 20, discountCode: "BETA20" });
});

test("the CSV export escapes a comma and a double quote in a name", async () => {
  const csv = beta.signupsToCsv([
    {
      email: "jane@example.com",
      name: 'Jane "The Lens" Doe, Photography',
      work_type: null,
      weekly_volume: null,
      added_to_google: false,
      added_at: null,
      created_at: "2026-08-01T00:00:00Z",
      notes: null,
    },
  ]);
  const lines = csv.split("\n");
  assert.equal(lines[0], "email,name,work_type,weekly_volume,added_to_google,added_at,created_at,notes");
  assert.ok(lines[1].includes('"Jane ""The Lens"" Doe, Photography"'));
});

test("PATCH /api/beta/signups/:id 404s on an unknown id", async () => {
  setAddedResult = null; // repo found no matching row
  const res = await patch("/api/beta/signups/11111111-1111-1111-1111-111111111111", { addedToGoogle: true });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "signup_not_found");
});

test("PATCH /api/beta/signups/:id marks a signup added", async () => {
  setAddedResult = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "jane@example.com",
    name: "Jane",
    work_type: null,
    weekly_volume: null,
    added_to_google: true,
    added_at: "2026-09-20T00:00:00Z",
    notes: null,
    created_at: "2026-08-01T00:00:00Z",
  };
  const res = await patch("/api/beta/signups/11111111-1111-1111-1111-111111111111", { addedToGoogle: true });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.signup.addedToGoogle, true);
  assert.equal(setAdded.mock.callCount(), 1);
});

test("an invalid submission does not spend the IP's rate-limit budget", async () => {
  const ip = "10.0.0.9";
  const bad = { name: "Jane", email: "nope", consent: true };
  for (let i = 0; i < 8; i++) {
    const res = await post("/api/beta/signups", bad, ip);
    assert.equal(res.status, 400, `rejection ${i + 1} should still be a 400, not a 429`);
  }
  // A typo must not cost someone their signup for an hour: the budget only guards real writes.
  const good = await post("/api/beta/signups", { name: "Jane", email: "jane@example.com", consent: true }, ip);
  assert.equal(good.status, 201);
  assert.equal(upsertSignup.mock.callCount(), 1);
});

test("the CSV export neutralizes a spreadsheet formula in a public-form field", async () => {
  const csv = beta.signupsToCsv([
    { email: "jane@example.com", name: '=HYPERLINK("http://evil","click")', notes: "@SUM(1+1)", created_at: "2026-08-01" },
    { email: "bob@example.com", name: "-500", notes: "+1 more" },
  ]);
  const lines = csv.split("\n");
  // Every attacker-controlled cell must start with the apostrophe, not with =, @, - or +.
  assert.ok(lines[1].includes(`"'=HYPERLINK(""http://evil"",""click"")"`), lines[1]);
  assert.ok(lines[1].includes("'@SUM(1+1)"), lines[1]);
  assert.ok(lines[2].includes("'-500"), lines[2]);
  assert.ok(lines[2].includes("'+1 more"), lines[2]);
  assert.ok(!/(^|,)[=+@]/.test(csv), "no cell may begin with a formula character");
});

test("GET /api/beta/signups.csv resolves as a route and is admin-only", async () => {
  signupsForList = [{ email: "jane@example.com", name: "Jane", created_at: "2026-08-01" }];

  const refused = await get("/api/beta/signups.csv");
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).code, "not_admin");

  const res = await get("/api/beta/signups.csv", { asAdmin: true });
  assert.equal(res.status, 200, "the literal .csv path must route, not 404");
  assert.match(res.headers.get("content-type"), /text\/csv/);
  assert.match(res.headers.get("content-disposition"), /attachment/);
  assert.match(await res.text(), /jane@example\.com/);
});

test("PATCH rejects notes longer than the column allows, instead of letting the database 500", async () => {
  const res = await patch("/api/beta/signups/11111111-1111-1111-1111-111111111111", { notes: "x".repeat(2001) });
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.code, "invalid_request");
  assert.ok(json.details.some((d) => d.field === "notes"));
  assert.equal(setNotes.mock.callCount(), 0);
});
