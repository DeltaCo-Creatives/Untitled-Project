import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { env } from "../config/env.js";
import { PLANS } from "../config/plans.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { normalizeEmail } from "../services/beta.service.js";
import { getSettingsWithSource, saveSettings, clearSetting } from "../services/settings.service.js";
import { loadEntitlement } from "../services/entitlement.service.js";
import { serializeEntitlement } from "../utils/serialize.js";
import { adminUserLookup, adminSetPlanById, grantCredits } from "../repositories/subscription.repo.js";

const router = Router();

// Every route here is owner-only. isAdmin() re-checks req.user.email (Supabase-verified)
// on every request — the frontend's `me.admin` flag only decides whether to render the
// page, it is never authorisation.
router.use(requireAuth, requireAdmin);

// `adminEmails` itself is never returned anywhere in this file — only its count, so the
// page can confirm ADMIN_EMAILS is set without exposing who is on it. It is not a
// settings key: it stays environment-only (see settings.service.js's module comment).
function readOnly() {
  return { adminEmails: env.admin.emails.length };
}

// ------------------------------------------------------------------------- settings

router.get("/settings", async (req, res) => {
  res.json({ settings: await getSettingsWithSource(), readOnly: readOnly() });
});

router.put("/settings", async (req, res) => {
  const settings = await saveSettings(req.body ?? {}, req.user.id);
  res.json({ settings, readOnly: readOnly() });
});

router.delete("/settings/:key", async (req, res) => {
  const settings = await clearSetting(req.params.key, req.user.id);
  res.json({ settings, readOnly: readOnly() });
});

// --------------------------------------------------------------------------- accounts

const VALID_STATUSES = new Set(["active", "past_due", "cancelled", "expired"]);

function requireEmail(rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    throw new HttpError(400, "email is required.", { code: "invalid_request", details: [{ field: "email", message: "Enter an email." }] });
  }
  return email;
}

async function findUserOrThrow(rawEmail) {
  const email = requireEmail(rawEmail);
  const user = await adminUserLookup(email);
  if (!user) throw new HttpError(404, "No DriveTag account has that email.", { code: "user_not_found" });
  return user;
}

/** { id, email, createdAt, plan, status, usage } — usage is null for an account that has never connected Drive. */
async function userPayload(user) {
  const entitlement = await loadEntitlement(user.id);
  const { plan, usage } = serializeEntitlement(entitlement);
  return { id: user.id, email: user.email, createdAt: user.createdAt, plan: plan?.id ?? "free", status: usage?.status ?? null, usage };
}

router.get("/users", async (req, res) => {
  const email = requireEmail(req.query.email);
  const user = await adminUserLookup(email);
  res.json({ user: user ? await userPayload(user) : null });
});

router.post("/users/plan", async (req, res) => {
  const { email, plan, status, restartPeriod } = req.body ?? {};
  const user = await findUserOrThrow(email);

  if (typeof plan !== "string" || !Object.hasOwn(PLANS, plan)) {
    throw new HttpError(400, "plan must be a real plan id.", { code: "invalid_plan", details: [{ field: "plan", message: "Unknown plan id." }] });
  }
  const finalStatus = status ?? "active";
  if (!VALID_STATUSES.has(finalStatus)) {
    throw new HttpError(400, "status must be one of active, past_due, cancelled, expired.", {
      code: "invalid_status",
      details: [{ field: "status", message: "Unknown status." }],
    });
  }
  if (restartPeriod !== undefined && typeof restartPeriod !== "boolean") {
    throw new HttpError(400, "restartPeriod must be true or false.", {
      code: "invalid_request",
      details: [{ field: "restartPeriod", message: "Must be true or false." }],
    });
  }

  await adminSetPlanById(user.id, plan, finalStatus, restartPeriod === true);
  logger.info("Admin set a user's plan", { event: "admin_set_plan", adminUserId: req.user.id, targetUserId: user.id, plan, status: finalStatus });
  res.json({ user: await userPayload(user) });
});

router.post("/users/credits", async (req, res) => {
  const { email, kind, amount, reason } = req.body ?? {};
  const user = await findUserOrThrow(email);

  if (kind !== "image" && kind !== "document") {
    throw new HttpError(400, "kind must be 'image' or 'document'.", { code: "invalid_kind", details: [{ field: "kind", message: "Unknown kind." }] });
  }
  if (!Number.isInteger(amount)) {
    throw new HttpError(400, "amount must be a whole number.", { code: "invalid_amount", details: [{ field: "amount", message: "Must be a whole number." }] });
  }
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason || trimmedReason.length > 200) {
    throw new HttpError(400, "reason is required, 1-200 characters.", {
      code: "invalid_reason",
      details: [{ field: "reason", message: "Enter a reason, 200 characters or fewer." }],
    });
  }

  try {
    // provider_reference is always null here: a manual grant must stay repeatable (only a
    // non-null reference is deduped by grant_credits — see 0006's comment), so the owner's
    // second correction for the same account isn't silently swallowed as a duplicate.
    await grantCredits({ userId: user.id, kind, amount, reason: trimmedReason, source: "manual", reference: null });
  } catch (err) {
    if (err.code === "insufficient_credits") {
      throw new HttpError(400, err.message, { code: "insufficient_credits" });
    }
    throw err;
  }

  logger.info("Admin granted credits", { event: "admin_grant_credits", adminUserId: req.user.id, targetUserId: user.id, kind, amount });
  res.json({ user: await userPayload(user) });
});

export default router;
