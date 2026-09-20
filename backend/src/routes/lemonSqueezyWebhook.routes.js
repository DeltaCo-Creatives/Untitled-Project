import { Router, raw } from "express";
import { webhookConfigured, verifySignature, planForVariant, mapStatus, packCreditsFor } from "../services/lemonSqueezy.service.js";
import { applySubscriptionState, grantCredits } from "../repositories/subscription.repo.js";
import { logger } from "../utils/logger.js";

const router = Router();

const SUBSCRIPTION_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_cancelled",
  "subscription_expired",
]);

// event name -> { restartPeriod, statusOverride? }. statusOverride skips deriving the
// status from the payload's own `status` field, for events whose meaning isn't "here is
// the subscription's current status" (a payment failing/succeeding, or lapsing).
const SUBSCRIPTION_EVENT_CONFIG = {
  subscription_created: { restartPeriod: true },
  subscription_updated: { restartPeriod: false },
  subscription_payment_success: { restartPeriod: false, statusOverride: "active" },
  subscription_payment_failed: { restartPeriod: false, statusOverride: "past_due" },
  // Lemon Squeezy's payload status here is "cancelled", and mapStatus() deliberately maps
  // that to our "active" (see its comment) — so this re-applies the SAME plan and status the
  // customer already has, just refreshing current_period_end from `ends_at`. It never downgrades.
  subscription_cancelled: { restartPeriod: false },
  subscription_expired: { restartPeriod: false, statusOverride: "expired" },
};

async function handleOrderCreated(userId, data) {
  const variantId = data?.attributes?.first_order_item?.variant_id;
  const mapping = planForVariant(variantId);
  // A subscription-plan variant needs no action here: Lemon Squeezy always sends
  // subscription_created alongside an order for a plan, and that's what grants it.
  if (!mapping || mapping.kind !== "pack") return;

  const pack = packCreditsFor(mapping.itemId);
  if (!pack) return;

  await grantCredits({
    userId,
    kind: pack.creditKind,
    amount: pack.amount,
    reason: `Lemon Squeezy order ${data.id}`,
    source: "purchase",
    reference: `ls-order-${data.id}`,
  });
}

async function handleOrderRefunded(userId, data) {
  const variantId = data?.attributes?.first_order_item?.variant_id;
  const mapping = planForVariant(variantId);
  if (!mapping || mapping.kind !== "pack") return;

  const pack = packCreditsFor(mapping.itemId);
  if (!pack) return;

  try {
    await grantCredits({
      userId,
      kind: pack.creditKind,
      amount: -pack.amount,
      reason: `Refund for Lemon Squeezy order ${data.id}`,
      source: "refund",
      reference: `ls-refund-${data.id}`,
    });
  } catch (err) {
    if (err.code === "insufficient_credits") {
      // The customer already spent what this order granted. They keep the credits they
      // used — there's nothing left to claw back, which is the correct commercial outcome,
      // not a bug. Must still 200, or Lemon Squeezy retries this refund forever.
      logger.warn("Refund clawback skipped: balance already spent", { event: "ls_webhook_refund_insufficient" });
      return;
    }
    throw err;
  }
}

async function handleSubscriptionEvent(eventName, userId, data) {
  const config = SUBSCRIPTION_EVENT_CONFIG[eventName];
  const attributes = data?.attributes ?? {};
  const mapping = planForVariant(attributes.variant_id);
  if (!mapping || mapping.kind !== "plan") {
    logger.warn("Lemon Squeezy subscription event for an unmapped variant", { event: "ls_webhook_unknown_variant", eventName });
    return;
  }

  const status = config.statusOverride ?? mapStatus(attributes.status);
  if (!status) {
    logger.warn("Lemon Squeezy subscription event with an unmapped status", { event: "ls_webhook_unknown_status", eventName });
    return;
  }

  await applySubscriptionState({
    userId,
    plan: mapping.itemId,
    status,
    provider: "lemonsqueezy",
    customerId: attributes.customer_id != null ? String(attributes.customer_id) : null,
    subscriptionId: data?.id != null ? String(data.id) : null,
    periodEnd: attributes.ends_at ?? attributes.renews_at ?? null,
    restartPeriod: config.restartPeriod,
  });
}

/** Every handler above must be safe to run twice: Lemon Squeezy retries on non-2xx. */
async function dispatch(eventName, userId, data) {
  if (eventName === "order_created") return handleOrderCreated(userId, data);
  if (eventName === "order_refunded") return handleOrderRefunded(userId, data);
  if (SUBSCRIPTION_EVENTS.has(eventName)) return handleSubscriptionEvent(eventName, userId, data);
  // Any other event: nothing to do, but still a 200 below so it isn't retried forever.
}

/**
 * Lemon Squeezy webhook. Mounted in app.js BEFORE express.json() and reads the RAW body
 * here with express.raw(): the signature is an HMAC over the exact bytes sent, and the
 * global JSON parser would consume and re-serialize them, so every signature would
 * silently fail to verify against the reserialized copy.
 *
 * UNLIKE the Drive webhook, this does the work BEFORE acking. A missed Drive notification is
 * recoverable (the changes feed or "Organize now" finds the file again); a missed payment is
 * not. Acking first would let a transient database error drop someone's credits with nothing
 * left to retry it. Lemon Squeezy redelivers anything that isn't 2xx — three more times, at
 * roughly 5s, 25s and 125s — and every handler above is idempotent, so a redelivery is safe
 * and is the thing that stops a failure becoming lost money.
 *
 * A verified request that simply cannot be acted on (malformed JSON, no user_id, an event we
 * don't handle) still answers 200: retrying would never fix it, and a non-2xx would make
 * Lemon Squeezy retry forever.
 */
router.post("/", raw({ type: "application/json" }), async (req, res) => {
  if (!webhookConfigured()) {
    logger.warn("Lemon Squeezy webhook received with no LEMONSQUEEZY_WEBHOOK_SECRET configured", { event: "ls_webhook_unconfigured" });
    return res.sendStatus(503);
  }

  // Never 200 a request we did not verify.
  if (!verifySignature(req.body, req.header("X-Signature"))) {
    logger.warn("Lemon Squeezy webhook signature did not verify", { event: "ls_webhook_bad_signature" });
    return res.sendStatus(401);
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body);
  } catch {
    // Verified (the signature matched) but unreadable — nothing about retrying fixes malformed JSON.
    logger.warn("Lemon Squeezy webhook body was not valid JSON despite a valid signature", { event: "ls_webhook_bad_json" });
    return res.sendStatus(200);
  }

  const eventName = payload?.meta?.event_name;
  const userId = payload?.meta?.custom_data?.user_id;
  if (typeof userId !== "string" || !userId) {
    // Missing/invalid user_id: verified, but nothing to attribute it to. Retrying won't
    // produce one, so this must still 200 or Lemon Squeezy retries forever.
    logger.warn("Lemon Squeezy webhook missing custom_data.user_id", { event: "ls_webhook_no_user", eventName });
    return res.sendStatus(200);
  }

  // Unlike the Drive webhook, this one does the work BEFORE acking, on purpose. A missed Drive
  // notification is recoverable — the changes feed or "Organize now" finds the file again. A
  // missed payment is not: acking first means a transient database error drops someone's credits
  // with nothing left to retry it, and the only trace is a log line nobody reads. Every handler
  // here is idempotent (grant_credits dedupes on provider_reference, subscription writes converge
  // on the same end state), which is exactly what makes a retry safe. So a failure returns 500 and
  // lets Lemon Squeezy redeliver (3 more times, ~5s/25s/125s) instead of losing the money.
  try {
    await dispatch(eventName, userId, payload?.data);
    res.sendStatus(200);
  } catch (err) {
    logger.error("Lemon Squeezy webhook handler failed; asking for a redelivery", {
      event: "ls_webhook_handler_failed",
      eventName,
      reason: err.message,
    });
    res.sendStatus(500);
  }
});

export default router;
