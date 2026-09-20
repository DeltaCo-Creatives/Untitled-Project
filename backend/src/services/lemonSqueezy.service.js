import crypto from "node:crypto";
import { env } from "../config/env.js";
import { PLANS, TOPUP_PACKS, DOCUMENT_PACKS } from "../config/plans.js";

/** Store + at least one variant are both needed to build a real checkout link. */
export function isConfigured() {
  return env.lemonSqueezy.configured;
}

/** The webhook only needs a signing secret — it never builds a checkout link. */
export function webhookConfigured() {
  return Boolean(env.lemonSqueezy.webhookSecret);
}

/**
 * Our plan/pack id -> Lemon Squeezy variant id. Packs use their own id as the key;
 * plans use their id for monthly and `<planId>-yearly` for yearly. Null when nothing
 * is configured for it, which the caller (checkoutUrlFor, or the checkout route) must
 * treat as "not purchasable" rather than building a broken link.
 */
export function variantFor(itemId, billing) {
  // The id arrives in a request body, so it is untrusted. A bare property lookup would let
  // "__proto__", "constructor" or "toString" resolve to inherited members of Object.prototype,
  // sail past a `!variantId` guard, and produce a nonsense checkout link that still answers 200.
  // Two guards: the item must be something we actually sell, and the variant must be an own key.
  if (typeof itemId !== "string" || !itemId) return null;
  if (!Object.hasOwn(PLANS, itemId) && packCreditsFor(itemId) === null) return null;

  const key = billing === "yearly" ? `${itemId}-yearly` : itemId;
  const variantId = Object.hasOwn(env.lemonSqueezy.variants, key) ? env.lemonSqueezy.variants[key] : null;
  if (typeof variantId !== "string" && typeof variantId !== "number") return null;
  return String(variantId);
}

/** Which kind of credit a pack id grants, and how many. Null for anything else. */
export function packCreditsFor(itemId) {
  const image = TOPUP_PACKS.find((pack) => pack.id === itemId);
  if (image) return { creditKind: "image", amount: image.images };
  const doc = DOCUMENT_PACKS.find((pack) => pack.id === itemId);
  if (doc) return { creditKind: "document", amount: doc.documents };
  return null;
}

/**
 * A plain checkout-buy-link URL (no API key needed for these). `userId` is mandatory:
 * without it in `checkout[custom][user_id]`, the webhook has no way to attribute the
 * purchase to an account, so this refuses to build a URL without one. Returns null
 * (not a thrown error) when the item/billing combination has no configured variant,
 * since that is an ordinary "not purchasable" outcome the route turns into a 400.
 */
export function checkoutUrlFor({ itemId, billing, userId, email }) {
  if (!userId) {
    throw new Error("checkoutUrlFor requires a userId: an anonymous purchase can't be attributed to an account.");
  }
  const variantId = variantFor(itemId, billing);
  if (!variantId) return null;

  const params = [`checkout[custom][user_id]=${encodeURIComponent(userId)}`];
  if (email) params.push(`checkout[email]=${encodeURIComponent(email)}`);

  return `https://${encodeURIComponent(env.lemonSqueezy.store)}.lemonsqueezy.com/checkout/buy/${encodeURIComponent(variantId)}?${params.join("&")}`;
}

/**
 * HMAC-SHA256 of the raw request body, hex-compared with crypto.timingSafeEqual.
 * Never throws: a missing header, non-hex header, or a header of the wrong length
 * (timingSafeEqual itself throws on unequal-length buffers) all just return false.
 */
export function verifySignature(rawBody, signatureHeader) {
  if (!env.lemonSqueezy.webhookSecret) return false;
  if (!signatureHeader || typeof signatureHeader !== "string") return false;

  try {
    const expected = crypto.createHmac("sha256", env.lemonSqueezy.webhookSecret).update(rawBody).digest();
    const given = Buffer.from(signatureHeader, "hex");
    if (given.length !== expected.length) return false;
    return crypto.timingSafeEqual(given, expected);
  } catch {
    return false;
  }
}

/** Reverse lookup: a Lemon Squeezy variant id -> what we sell under it, or null. */
export function planForVariant(variantId) {
  if (variantId === null || variantId === undefined) return null;
  const target = String(variantId);

  for (const [key, configuredId] of Object.entries(env.lemonSqueezy.variants)) {
    if (String(configuredId) !== target) continue;

    const yearly = key.endsWith("-yearly");
    const itemId = yearly ? key.slice(0, -"-yearly".length) : key;

    if (PLANS[itemId]) return { itemId, kind: "plan", billing: yearly ? "yearly" : "monthly" };
    if (!yearly && packCreditsFor(itemId)) return { itemId, kind: "pack", billing: null };
  }
  return null;
}

/**
 * Lemon Squeezy status -> ours. `cancelled` deliberately maps to `active`: Lemon
 * Squeezy's "cancelled" means "will not renew", not "access revoked" — the customer
 * keeps access until `ends_at`, which is exactly what our Terms promise. The event
 * that actually downgrades a lapsed subscriber is `subscription_expired`, handled
 * separately in the webhook. Getting this mapping backwards would cut off people
 * who have already paid for the current period.
 */
const STATUS_MAP = {
  on_trial: "active",
  active: "active",
  past_due: "past_due",
  unpaid: "past_due",
  cancelled: "active",
  paused: "cancelled",
  expired: "expired",
};

export function mapStatus(lsStatus) {
  return STATUS_MAP[lsStatus] ?? null;
}
