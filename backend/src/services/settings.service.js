import { env } from "../config/env.js";
import { PLANS, TOPUP_PACKS, DOCUMENT_PACKS } from "../config/plans.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { getAll, setMany, remove } from "../repositories/appSettings.repo.js";

/**
 * The one place that resolves configuration the owner can override from the admin
 * dashboard. Everything else in the codebase keeps reading env.* directly — only the
 * five settings below route through here.
 *
 * ADMIN_EMAILS is deliberately absent: it is the root of trust for every route this
 * service's writes are gated behind (see middleware/requireAdmin.js), and there must
 * be no settings key, endpoint or code path that can write it. If a future key looks
 * like it wants to express "who is an admin", that's a sign it belongs in the
 * environment, not here.
 */

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** A variant id is numeric, whatever type the JSON round-trips it as. */
function isNumericVariantId(v) {
  return (typeof v === "string" || typeof v === "number") && /^[0-9]+$/.test(String(v));
}

/** A key is a plan id, a plan id + "-yearly" (mirrors env.js's LEMONSQUEEZY_VARIANTS convention), or a pack id. */
function isKnownVariantKey(key) {
  if (key.endsWith("-yearly")) {
    const base = key.slice(0, -"-yearly".length);
    // Not just "is this a plan" — is it a plan we actually sell yearly. The three Enterprise tiers are
    // monthly-only, so accepting `enterprise-yearly` here would let the admin page create a variant for a
    // billing interval that has no price on the website.
    return Object.hasOwn(PLANS, base) && Boolean(PLANS[base].billing?.includes("yearly"));
  }
  if (Object.hasOwn(PLANS, key)) return true;
  return TOPUP_PACKS.some((pack) => pack.id === key) || DOCUMENT_PACKS.some((pack) => pack.id === key);
}

/** Same guard lemonSqueezy.service.js/checkoutUrlFor rely on: reject anything not a plan or pack we sell. */
function validateVariants(value) {
  if (!isPlainObject(value)) throw new Error("lemonSqueezyVariants must be an object of plan/pack id to variant id.");
  const clean = Object.create(null);
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(value, key)) continue;
    if (!isKnownVariantKey(key)) throw new Error(`"${key}" is not a plan or pack DriveTag sells.`);
    if (!isNumericVariantId(value[key])) throw new Error(`The variant id for "${key}" must be numeric.`);
    clean[key] = String(value[key]);
  }
  return clean;
}

// Allow-list of every setting the admin dashboard may read or write. A key not in here
// is rejected on write (400 unknown_setting) and never appears in a GET response —
// there is no free-form key/value store underneath this.
const REGISTRY = {
  betaDiscountPercent: {
    envVar: "BETA_DISCOUNT_PERCENT",
    default: 0,
    fromEnv: () => env.beta.discountPercent,
    validate(v) {
      if (!Number.isInteger(v) || v < 0 || v > 90) throw new Error("betaDiscountPercent must be a whole number from 0 to 90.");
      return v;
    },
  },
  betaDiscountCode: {
    envVar: "BETA_DISCOUNT_CODE",
    default: "",
    fromEnv: () => env.beta.discountCode,
    validate(v) {
      if (typeof v !== "string") throw new Error("betaDiscountCode must be text.");
      const trimmed = v.trim();
      if (trimmed.length > 60) throw new Error("betaDiscountCode must be 60 characters or fewer.");
      return trimmed;
    },
  },
  googleAppTesting: {
    envVar: "GOOGLE_APP_TESTING",
    default: false,
    fromEnv: () => env.beta.googleAppTesting,
    validate(v) {
      if (typeof v !== "boolean") throw new Error("googleAppTesting must be true or false.");
      return v;
    },
  },
  lemonSqueezyStore: {
    envVar: "LEMONSQUEEZY_STORE",
    default: "",
    fromEnv: () => env.lemonSqueezy.store,
    validate(v) {
      if (typeof v !== "string") throw new Error("lemonSqueezyStore must be text.");
      const trimmed = v.trim();
      if (trimmed.length > 80) throw new Error("lemonSqueezyStore must be 80 characters or fewer.");
      if (trimmed && !/^[a-z0-9][a-z0-9-]*$/i.test(trimmed)) {
        throw new Error("lemonSqueezyStore must look like a store subdomain (letters, digits, hyphens).");
      }
      return trimmed;
    },
  },
  lemonSqueezyVariants: {
    envVar: "LEMONSQUEEZY_VARIANTS",
    default: Object.create(null),
    fromEnv: () => ({ ...env.lemonSqueezy.variants }),
    validate: validateVariants,
  },
};

// ---------------------------------------------------------------------------- cache
//
// getSetting() is used by hot request paths (lemonSqueezy.service.js's isConfigured/
// variantFor/checkoutUrlFor, which POST /api/checkout and the Lemon Squeezy webhook call
// synchronously and without await — see their module comments). So this cache is read
// synchronously and refreshed in the background: a call never blocks on the database. The
// first call after boot (or after any DB outage) serves env/default values until a
// refresh completes; every write invalidates the cache immediately so the next read
// re-fetches instead of waiting out the TTL.
const TTL_MS = 30_000;

let cache = null; // { byKey: Map<key, value>, fetchedAt: number } | null (nothing successfully loaded yet)
let refreshing = null; // in-flight refresh promise, de-duplicated
let loggedFailure = false;

async function refreshCache() {
  try {
    const rows = await getAll();
    cache = { byKey: new Map(rows.map((row) => [row.key, row.value])), fetchedAt: Date.now() };
    loggedFailure = false;
  } catch (err) {
    // Fail soft: a missing 0007 migration or a transient database error must not take the
    // app down. Logged once per outage (not once per request) so a stuck settings table
    // doesn't spam the logs while every hot request keeps working off env/default values.
    if (!loggedFailure) {
      logger.warn("Could not read app_settings; falling back to environment values", { reason: err.message });
      loggedFailure = true;
    }
    cache = cache ? { ...cache, fetchedAt: Date.now() } : { byKey: new Map(), fetchedAt: Date.now() };
  }
}

function ensureFreshInBackground() {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return;
  if (!refreshing) refreshing = refreshCache().finally(() => { refreshing = null; });
}

function invalidateCache() {
  cache = null;
}

function hasEnvVar(name) {
  const raw = process.env[name];
  return typeof raw === "string" && raw.trim() !== "";
}

function resolveWithSource(key) {
  // Only ever called with keys from Object.keys(REGISTRY), but guarded anyway so it can't become
  // a hole if a caller ever passes something through from outside.
  const def = Object.hasOwn(REGISTRY, key) ? REGISTRY[key] : null;
  if (!def) throw new Error(`Unknown setting: ${key}`);
  const dbValue = cache?.byKey.get(key);
  if (dbValue !== undefined) return { value: dbValue, source: "database" };
  if (hasEnvVar(def.envVar)) return { value: def.fromEnv(), source: "environment" };
  return { value: def.default, source: "default" };
}

// ------------------------------------------------------------------------- sync reads

/**
 * Best-effort synchronous read of one setting's effective value (database ->
 * environment -> default). Never blocks: see the cache comment above.
 */
export function getSetting(key) {
  if (!Object.hasOwn(REGISTRY, key)) throw new Error(`Unknown setting: ${key}`);
  ensureFreshInBackground();
  const dbValue = cache?.byKey.get(key);
  return dbValue !== undefined ? dbValue : REGISTRY[key].fromEnv();
}

/** { store, variants, configured } for lemonSqueezy.service.js — variants comes back
 *  null-prototype, same poison-safety guarantee env.js's own parser gives it, since the
 *  value may now have come from the database instead of LEMONSQUEEZY_VARIANTS. */
export function getLemonSqueezyConfig() {
  const store = getSetting("lemonSqueezyStore");
  const variants = Object.assign(Object.create(null), getSetting("lemonSqueezyVariants"));
  return { store, variants, configured: Boolean(store) && Object.keys(variants).length > 0 };
}

/** { percent, code } for beta.service.js's discountEnabled()/betaStatusFor(). */
export function getBetaDiscount() {
  return { percent: getSetting("betaDiscountPercent"), code: getSetting("betaDiscountCode") };
}

/** For account.routes.js's GET /api/me. */
export function getGoogleAppTesting() {
  return getSetting("googleAppTesting");
}

// ------------------------------------------------------------------------ admin reads/writes

/**
 * Every known setting with its effective value and source. Forces a fresh database read
 * (admin traffic is low-volume; the owner looking at this page wants the true current
 * state, not up to 30s of staleness) rather than reusing the hot-path cache.
 */
export async function getSettingsWithSource() {
  await refreshCache();
  const settings = {};
  for (const key of Object.keys(REGISTRY)) settings[key] = resolveWithSource(key);
  return settings;
}

/**
 * Validates `entries` ({ key: value, ... }) against the registry. All-or-nothing: a
 * single unknown key rejects the whole request (400 unknown_setting) rather than
 * silently applying the rest, which is what makes "a body containing adminEmails is
 * rejected" true for a request that also carries legitimate keys.
 */
function validateSettingsInput(entries) {
  if (!isPlainObject(entries)) throw new HttpError(400, "Body must be an object of setting keys to values.", { code: "invalid_setting" });

  const keys = Object.keys(entries).filter((key) => Object.hasOwn(entries, key));
  if (keys.length === 0) throw new HttpError(400, "No settings in the request body.", { code: "invalid_setting" });

  const clean = {};
  for (const key of keys) {
    // Object.hasOwn, not a bare lookup: the key comes from a request body, and JSON.parse happily
    // makes "__proto__" an own property. REGISTRY["__proto__"] resolves to Object.prototype, which
    // is truthy, so it would sail past the `!def` guard below and then blow up on def.validate —
    // leaking an internal TypeError to the caller instead of a clean "unknown setting".
    const def = Object.hasOwn(REGISTRY, key) ? REGISTRY[key] : null;
    if (!def) {
      throw new HttpError(400, `"${key}" is not a setting this app exposes.`, {
        code: "unknown_setting",
        details: [{ field: key, message: "Unknown setting." }],
      });
    }
    try {
      clean[key] = def.validate(entries[key]);
    } catch (err) {
      throw new HttpError(400, err.message, { code: "invalid_setting", details: [{ field: key, message: err.message }] });
    }
  }
  return clean;
}

/** Validates, saves, invalidates the cache, and returns the fresh { value, source } map. */
export async function saveSettings(entries, adminUserId) {
  const clean = validateSettingsInput(entries);
  await setMany(Object.entries(clean).map(([key, value]) => ({ key, value })), adminUserId);
  invalidateCache();
  logger.info("Admin updated settings", { event: "admin_settings_update", adminUserId, keys: Object.keys(clean) });
  return getSettingsWithSource();
}

/** Clears a key's override so its environment/default value applies again. */
export async function clearSetting(key, adminUserId) {
  if (!Object.hasOwn(REGISTRY, key)) throw new HttpError(400, `"${key}" is not a setting this app exposes.`, { code: "unknown_setting" });
  await remove(key);
  invalidateCache();
  logger.info("Admin cleared setting override", { event: "admin_settings_clear", adminUserId, key });
  return getSettingsWithSource();
}
