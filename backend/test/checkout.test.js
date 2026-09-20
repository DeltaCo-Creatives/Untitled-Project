// Run from backend/: node --test --experimental-test-module-mocks test/checkout.test.js
//
// Route-level tests for POST /api/checkout, same hermetic pattern as test/beta.test.js: a
// real Express app, driven over HTTP with fetch, with collaborators mocked so nothing
// touches Supabase or the network. requireAuth is mocked (as in beta.test.js). config/env.js
// is ALSO mocked, as a plain mutable object, purely so `env.lemonSqueezy` can be flipped
// between "configured" and "unconfigured" from one test to the next in the same process —
// real env.js reads process.env once at import time, which can't be changed after the fact.
// services/lemonSqueezy.service.js and config/plans.js are left real, so the actual
// checkout-URL-building and variant-lookup logic is what's under test here.
import { test, mock, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cors from "cors";
import helmet from "helmet";

process.env.NODE_ENV = "production";
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);

const BUYER_ID = "11111111-1111-1111-1111-111111111111";
const ALLOWED_ORIGIN = "https://app.example.com";

const env = {
  nodeEnv: "production",
  frontend: { corsOrigins: [ALLOWED_ORIGIN] },
  lemonSqueezy: {
    store: "drivetag",
    variants: { creator: "111", "creator-yearly": "112", "pack-250": "210" },
    webhookSecret: "whsec_test",
    configured: true,
  },
};
mock.module("../src/config/env.js", {
  namedExports: { env, productionConfigProblems: () => [] },
});

let currentUser = { id: BUYER_ID, email: "buyer@example.com" };
mock.module("../src/middleware/requireAuth.js", {
  namedExports: {
    requireAuth: (req, res, next) => {
      req.user = currentUser;
      next();
    },
  },
});

const { default: checkoutRouter } = await import("../src/routes/checkout.routes.js");
const { errorHandler, notFound } = await import("../src/middleware/errorHandler.js");

const app = express();
app.use(express.json());
app.use("/api/checkout", checkoutRouter);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

beforeEach(() => {
  currentUser = { id: BUYER_ID, email: "buyer@example.com" };
  env.lemonSqueezy.store = "drivetag";
  env.lemonSqueezy.variants = { creator: "111", "creator-yearly": "112", "pack-250": "210" };
  env.lemonSqueezy.configured = true;
});

function post(body) {
  return fetch(`${base}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

test("known plan, default (monthly) billing returns a checkout URL carrying the signed-in user's id and email", async () => {
  const res = await post({ item: "creator" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.match(json.url, /^https:\/\/drivetag\.lemonsqueezy\.com\/checkout\/buy\/111\?/);
  assert.match(json.url, /checkout\[custom\]\[user_id\]=11111111-1111-1111-1111-111111111111/);
  assert.match(json.url, /checkout\[email\]=buyer%40example\.com/);
});

test("yearly billing looks up the <planId>-yearly variant", async () => {
  const res = await post({ item: "creator", billing: "yearly" });
  assert.equal(res.status, 200);
  assert.match((await res.json()).url, /\/checkout\/buy\/112\?/);
});

test("a pack id works the same way, with no billing", async () => {
  const res = await post({ item: "pack-250" });
  assert.equal(res.status, 200);
  assert.match((await res.json()).url, /\/checkout\/buy\/210\?/);
});

test("an unknown item id is 400 unknown_item", async () => {
  const res = await post({ item: "not-a-real-plan" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unknown_item");
});

test("a known plan id with no configured variant is 400 unknown_item", async () => {
  const res = await post({ item: "studio" }); // a real plan id, but not in env.lemonSqueezy.variants
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unknown_item");
});

test("an invalid billing value is 400 unknown_item", async () => {
  const res = await post({ item: "creator", billing: "weekly" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unknown_item");
});

test("a missing item is 400 unknown_item", async () => {
  const res = await post({});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "unknown_item");
});

test("no store or variants configured (fail closed) is 503 checkout_unconfigured", async () => {
  env.lemonSqueezy.store = "";
  env.lemonSqueezy.variants = {};
  env.lemonSqueezy.configured = false;
  const res = await post({ item: "creator" });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "checkout_unconfigured");
});

// --------------------------------------------------------------------------------------
// app.js's helmet-before-cors mounting (W2 also owns app.js's assembly). Mirrors app.js's
// exact top-of-stack lines (real helmet, real cors, real isAllowedFrontendOrigin) rather
// than importing createApp() itself: that would also construct every other router's
// Google/Supabase clients at import time, which is out of scope here and would need real
// credentials this task is explicitly forbidden from touching.
function corsOrigin(origin, callback) {
  callback(null, !origin || env.frontend.corsOrigins.includes(origin));
}

const previewApp = express();
previewApp.use(helmet({ contentSecurityPolicy: false }));
previewApp.use(cors({ origin: corsOrigin }));
previewApp.use((req, res, next) => (req.method === "OPTIONS" ? res.sendStatus(204) : next()));
previewApp.get("/api/plans", (req, res) => res.json({ ok: true }));
const previewServer = previewApp.listen(0);
await new Promise((resolve) => previewServer.once("listening", resolve));
const previewBase = `http://127.0.0.1:${previewServer.address().port}`;
after(() => previewServer.close());

test("helmet mounted before cors: an OPTIONS preflight from an allowed origin still returns 204 with Access-Control-Allow-Origin", async () => {
  const res = await fetch(`${previewBase}/api/plans`, {
    method: "OPTIONS",
    headers: { Origin: ALLOWED_ORIGIN, "Access-Control-Request-Method": "GET" },
  });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff"); // a helmet default header
  assert.equal(res.headers.get("content-security-policy"), null); // switched off on purpose for this JSON API
});

test("inherited Object keys are not items: __proto__, constructor and friends are 400, not a garbage URL", async () => {
  // The item id comes from a request body. A bare `variants[itemId]` lookup resolves these to
  // members of Object.prototype, which are truthy, so they would slip past a `!variantId` guard
  // and produce a 200 with a nonsense checkout link.
  for (const item of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    const res = await post({ item });
    assert.equal(res.status, 400, `${item} must be rejected`);
    assert.equal((await res.json()).code, "unknown_item", `${item} must be unknown_item`);
  }
});

test("a non-string item id is 400 rather than a coerced lookup", async () => {
  for (const item of [42, true, null, { toString: () => "creator" }, ["creator"]]) {
    const res = await post({ item });
    assert.equal(res.status, 400, `${JSON.stringify(item)} must be rejected`);
  }
});
