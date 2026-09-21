// Run from backend/: node --test --experimental-test-module-mocks test/lemonsqueezy-webhook.test.js
//
// Route-level tests for POST /webhook/lemonsqueezy, same hermetic pattern as test/beta.test.js:
// a real Express app driven over HTTP with fetch. config/env.js is mocked as a plain mutable
// object (not via process.env) purely so `env.lemonSqueezy.webhookSecret` can be flipped
// between "configured" and "" from one test to the next in the same process — real env.js
// reads process.env once at import time, which can't change after the fact. subscription.repo.js
// and utils/logger.js are mocked so nothing touches Supabase and log calls are assertable.
// services/lemonSqueezy.service.js and config/plans.js are left real: the actual HMAC
// verification, variant lookup and status mapping are what's under test here.
//
// The webhook acks before doing the real work (setImmediate, exactly like the Drive webhook),
// so every test that needs to observe a repository call awaits `flush()` after the fetch
// resolves to let that deferred work finish.
import { test, mock, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";

process.env.NODE_ENV = "production";
process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);

const BUYER_ID = "11111111-1111-1111-1111-111111111111";
const SECRET = "whsec_test_secret";

const env = {
  nodeEnv: "production",
  lemonSqueezy: {
    store: "drivetag",
    variants: { creator: "111", "pack-250": "210" },
    webhookSecret: SECRET,
    configured: true,
  },
};
mock.module("../src/config/env.js", {
  namedExports: { env, productionConfigProblems: () => [] },
});

const logger = { info: mock.fn(), warn: mock.fn(), error: mock.fn() };
mock.module("../src/utils/logger.js", { namedExports: { logger } });

// services/lemonSqueezy.service.js now resolves store/variants through
// services/settings.service.js, which falls back to env.* (the mock above) whenever its
// repository call fails — this stub just keeps that call from building a real Supabase
// client at import time, so nothing here touches app_settings or a real database.
mock.module("../src/lib/supabase.js", { namedExports: { supabase: {} } });

// Simulates just enough of grant_credits' real idempotency (0006) to test that the route
// passes a stable, repeatable reference: a reference seen before is a no-op that returns the
// already-granted balance, exactly like the SQL function is supposed to. Real end-to-end
// dedup is covered at the SQL level by test/sql-migrations.test.js.
const grantLedger = new Map(); // reference -> balance already granted under it
const grantCredits = mock.fn(async ({ reference, amount }) => {
  if (reference && grantLedger.has(reference)) return grantLedger.get(reference);
  const balance = amount;
  if (reference) grantLedger.set(reference, balance);
  return balance;
});
const applySubscriptionState = mock.fn(async (args) => ({ user_id: args.userId, ...args }));

mock.module("../src/repositories/subscription.repo.js", {
  namedExports: { grantCredits, applySubscriptionState },
});

const { default: webhookRouter } = await import("../src/routes/lemonSqueezyWebhook.routes.js");
const lemonSqueezy = await import("../src/services/lemonSqueezy.service.js");

const app = express();
app.use("/webhook/lemonsqueezy", webhookRouter);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;

after(() => server.close());

beforeEach(() => {
  env.lemonSqueezy.store = "drivetag";
  env.lemonSqueezy.variants = { creator: "111", "pack-250": "210" };
  env.lemonSqueezy.webhookSecret = SECRET;
  env.lemonSqueezy.configured = true;
  grantLedger.clear();
  grantCredits.mock.resetCalls();
  applySubscriptionState.mock.resetCalls();
  logger.info.mock.resetCalls();
  logger.warn.mock.resetCalls();
  logger.error.mock.resetCalls();
});

function sign(rawBody, secret = env.lemonSqueezy.webhookSecret) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function postWebhook(rawBody, { signature, omitSignature = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (!omitSignature) headers["X-Signature"] = signature ?? sign(rawBody);
  return fetch(`${base}/webhook/lemonsqueezy`, { method: "POST", headers, body: rawBody });
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

function orderPayload({ eventName, orderId, variantId, userId = BUYER_ID }) {
  return JSON.stringify({
    meta: { event_name: eventName, custom_data: { user_id: userId } },
    data: { type: "orders", id: orderId, attributes: { first_order_item: { variant_id: variantId } } },
  });
}

function subscriptionPayload({ eventName, subscriptionId, variantId, status, endsAt = null, renewsAt = null, userId = BUYER_ID }) {
  return JSON.stringify({
    meta: { event_name: eventName, custom_data: { user_id: userId } },
    data: {
      type: "subscriptions",
      id: subscriptionId,
      attributes: { variant_id: variantId, status, customer_id: "cust_1", ends_at: endsAt, renews_at: renewsAt },
    },
  });
}

// ---------------------------------------------------------------- signature verification

test("a correctly signed request is accepted", async () => {
  const body = orderPayload({ eventName: "some_unhandled_event", orderId: "1", variantId: "999" });
  const res = await postWebhook(body);
  assert.equal(res.status, 200);
});

test("a wrong signature is 401", async () => {
  const body = orderPayload({ eventName: "order_created", orderId: "1", variantId: "210" });
  const res = await postWebhook(body, { signature: sign(body, "a-different-secret") });
  assert.equal(res.status, 401);
  await flush();
  assert.equal(grantCredits.mock.callCount(), 0);
});

test("a missing signature header is 401", async () => {
  const body = orderPayload({ eventName: "order_created", orderId: "1", variantId: "210" });
  const res = await postWebhook(body, { omitSignature: true });
  assert.equal(res.status, 401);
});

test("a signature of the wrong length is 401, not a thrown error (the timingSafeEqual trap)", async () => {
  const body = orderPayload({ eventName: "order_created", orderId: "1", variantId: "210" });
  const res = await postWebhook(body, { signature: "abcd" });
  assert.equal(res.status, 401);
});

test("tampering with one byte of the body invalidates the signature", async () => {
  const body = orderPayload({ eventName: "order_created", orderId: "1", variantId: "210" });
  const validSignature = sign(body);
  const tampered = body.replace('"1"', '"2"');
  const res = await postWebhook(tampered, { signature: validSignature });
  assert.equal(res.status, 401);
});

test("no webhook secret configured is 503, and no handler runs", async () => {
  env.lemonSqueezy.webhookSecret = "";
  const body = orderPayload({ eventName: "order_created", orderId: "1", variantId: "210" });
  const res = await postWebhook(body, { signature: sign(body, "irrelevant") });
  assert.equal(res.status, 503);
  await flush();
  assert.equal(grantCredits.mock.callCount(), 0);
});

// ---------------------------------------------------------------------- order_created

test("order_created for a pack grants credits once, and redelivering the same event keeps a stable reference", async () => {
  const body = orderPayload({ eventName: "order_created", orderId: "999", variantId: "210" });

  const res1 = await postWebhook(body);
  assert.equal(res1.status, 200);
  await flush();
  const res2 = await postWebhook(body); // Lemon Squeezy redelivering the same event
  assert.equal(res2.status, 200);
  await flush();

  // The route itself can't know a delivery is a duplicate — that's what provider_reference
  // dedup in grant_credits (0006) is for (covered at the SQL level separately). What the route
  // owns is passing the SAME deterministic reference every time, which is what makes that
  // dedup possible; the ledger simulation above shows only one grant actually landed.
  assert.equal(grantCredits.mock.callCount(), 2);
  const [first, second] = grantCredits.mock.calls.map((c) => c.arguments[0]);
  assert.equal(first.reference, "ls-order-999");
  assert.equal(second.reference, "ls-order-999");
  assert.equal(first.kind, "image");
  assert.equal(first.amount, 250); // pack-250
  assert.equal(first.source, "purchase");
  assert.equal(grantLedger.get("ls-order-999"), 250, "only one grant actually landed under this reference");
});

test("order_created for a subscription-plan variant grants nothing (subscription_created handles the plan)", async () => {
  const body = orderPayload({ eventName: "order_created", orderId: "1", variantId: "111" }); // "creator" plan variant
  const res = await postWebhook(body);
  assert.equal(res.status, 200);
  await flush();
  assert.equal(grantCredits.mock.callCount(), 0);
});

// --------------------------------------------------------------------- order_refunded

test("order_refunded with an insufficient balance returns 200 and does not throw", async () => {
  const body = orderPayload({ eventName: "order_refunded", orderId: "999", variantId: "210" });
  grantCredits.mock.mockImplementationOnce(async () => {
    const err = new Error("insufficient_credits: image top-up balance is 0, cannot remove 250");
    err.code = "insufficient_credits";
    throw err;
  });

  const res = await postWebhook(body);
  assert.equal(res.status, 200);
  await flush();

  assert.equal(grantCredits.mock.callCount(), 1);
  assert.equal(grantCredits.mock.calls[0].arguments[0].reference, "ls-refund-999");
  assert.equal(grantCredits.mock.calls[0].arguments[0].amount, -250);
  // The clawback was swallowed, not bubbled to the generic failure logger.
  assert.equal(logger.error.mock.calls.filter((c) => c.arguments[1]?.event === "ls_webhook_handler_failed").length, 0);
});

// ---------------------------------------------------------------- subscription events

test("subscription_cancelled does not downgrade: status stays active and current_period_end comes from ends_at", async () => {
  const body = subscriptionPayload({
    eventName: "subscription_cancelled",
    subscriptionId: "sub_1",
    variantId: "111",
    status: "cancelled",
    endsAt: "2026-12-01T00:00:00Z",
  });
  const res = await postWebhook(body);
  assert.equal(res.status, 200);
  await flush();

  assert.equal(applySubscriptionState.mock.callCount(), 1);
  const args = applySubscriptionState.mock.calls[0].arguments[0];
  assert.equal(args.plan, "creator");
  assert.equal(args.status, "active"); // never "cancelled" or anything non-paid
  assert.equal(args.periodEnd, "2026-12-01T00:00:00Z");
  assert.equal(args.restartPeriod, false);
});

test("subscription_expired sets status expired", async () => {
  const body = subscriptionPayload({
    eventName: "subscription_expired",
    subscriptionId: "sub_1",
    variantId: "111",
    status: "expired",
    endsAt: "2026-12-01T00:00:00Z",
  });
  const res = await postWebhook(body);
  assert.equal(res.status, 200);
  await flush();

  assert.equal(applySubscriptionState.mock.callCount(), 1);
  assert.equal(applySubscriptionState.mock.calls[0].arguments[0].status, "expired");
});

test("subscription_created restarts the period; subscription_updated does not", async () => {
  const created = subscriptionPayload({
    eventName: "subscription_created",
    subscriptionId: "sub_1",
    variantId: "111",
    status: "active",
    renewsAt: "2026-10-20T00:00:00Z",
  });
  await postWebhook(created);
  await flush();
  assert.equal(applySubscriptionState.mock.calls[0].arguments[0].restartPeriod, true);
  assert.equal(applySubscriptionState.mock.calls[0].arguments[0].periodEnd, "2026-10-20T00:00:00Z");

  const updated = subscriptionPayload({
    eventName: "subscription_updated",
    subscriptionId: "sub_1",
    variantId: "111",
    status: "active",
    renewsAt: "2026-11-20T00:00:00Z",
  });
  await postWebhook(updated);
  await flush();
  assert.equal(applySubscriptionState.mock.calls[1].arguments[0].restartPeriod, false);
});

test("subscription_payment_success forces status active; subscription_payment_failed forces past_due", async () => {
  const success = subscriptionPayload({ eventName: "subscription_payment_success", subscriptionId: "sub_1", variantId: "111", status: "past_due" });
  await postWebhook(success);
  await flush();
  assert.equal(applySubscriptionState.mock.calls[0].arguments[0].status, "active");

  const failed = subscriptionPayload({ eventName: "subscription_payment_failed", subscriptionId: "sub_1", variantId: "111", status: "active" });
  await postWebhook(failed);
  await flush();
  assert.equal(applySubscriptionState.mock.calls[1].arguments[0].status, "past_due");
});

// --------------------------------------------------------------------- fail-closed cases

test("a missing meta.custom_data.user_id returns 200 and writes nothing", async () => {
  const body = JSON.stringify({
    meta: { event_name: "order_created", custom_data: {} },
    data: { type: "orders", id: "1", attributes: { first_order_item: { variant_id: "210" } } },
  });
  const res = await postWebhook(body);
  assert.equal(res.status, 200);
  await flush();
  assert.equal(grantCredits.mock.callCount(), 0);
  assert.equal(applySubscriptionState.mock.callCount(), 0);
});

test("an unhandled event type is a 200 with no handler running", async () => {
  const body = orderPayload({ eventName: "subscription_paused", orderId: "1", variantId: "210" });
  const res = await postWebhook(body);
  assert.equal(res.status, 200);
  await flush();
  assert.equal(grantCredits.mock.callCount(), 0);
  assert.equal(applySubscriptionState.mock.callCount(), 0);
});

// --------------------------------------------------------------------------- mapStatus

test("mapStatus covers all seven Lemon Squeezy statuses", () => {
  assert.equal(lemonSqueezy.mapStatus("on_trial"), "active");
  assert.equal(lemonSqueezy.mapStatus("active"), "active");
  assert.equal(lemonSqueezy.mapStatus("past_due"), "past_due");
  assert.equal(lemonSqueezy.mapStatus("unpaid"), "past_due");
  // Deliberate: Lemon Squeezy's "cancelled" means "will not renew, keeps access until ends_at".
  assert.equal(lemonSqueezy.mapStatus("cancelled"), "active");
  assert.equal(lemonSqueezy.mapStatus("paused"), "cancelled");
  assert.equal(lemonSqueezy.mapStatus("expired"), "expired");
  assert.equal(lemonSqueezy.mapStatus("something_unknown"), null);
});

test("a failing handler returns 500 so Lemon Squeezy redelivers, instead of silently losing the purchase", async () => {
  // Acking first and processing after would mean a transient database error drops someone's
  // credits with nothing left to retry it. Handlers are idempotent, so a redelivery is safe.
  const failing = new Error("Failed to grant credits: connection reset");
  grantCredits.mock.mockImplementationOnce(async () => {
    throw failing;
  });

  const body = orderPayload({ eventName: "order_created", orderId: "retry-me", variantId: "210" });
  const res = await postWebhook(body);
  assert.equal(res.status, 500, "a handler failure must NOT be acked as captured");
  assert.equal(grantCredits.mock.callCount(), 1);

  // The redelivery succeeds, and because the first attempt never recorded the reference the
  // customer still gets exactly one grant.
  const retry = await postWebhook(body);
  assert.equal(retry.status, 200);
  assert.equal(grantCredits.mock.callCount(), 2);
  assert.equal(grantCredits.mock.calls[1].arguments[0].reference, "ls-order-retry-me");
});
