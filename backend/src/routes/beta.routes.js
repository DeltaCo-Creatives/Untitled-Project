import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../utils/httpError.js";
import { isUuid } from "../utils/processValidation.js";
import { listSignups } from "../repositories/betaSignup.repo.js";
import {
  assertValidSignup,
  isAdmin,
  listSignupsForAdmin,
  patchSignup,
  saveSignup,
  signupsToCsv,
} from "../services/beta.service.js";

const router = Router();

// ---- rate limit: 5 public signups per IP per hour, sliding window ----
// ponytail: per-instance in-memory Map (no dependency) — bounded because every write sweeps out
// expired entries across all keys, not just the caller's. A multi-instance backend would need a
// shared store (Redis) instead; DigitalOcean App Platform runs this as one instance today.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const submissionsByIp = new Map();

function withinRateLimit(ip) {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  for (const [key, timestamps] of submissionsByIp) {
    const kept = timestamps.filter((t) => t > cutoff);
    if (kept.length === 0) submissionsByIp.delete(key);
    else submissionsByIp.set(key, kept);
  }

  const timestamps = submissionsByIp.get(ip) ?? [];
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  submissionsByIp.set(ip, timestamps);
  return true;
}

/** Must run after requireAuth — req.user.email comes from Supabase's verified token. */
function requireAdmin(req, res, next) {
  if (!isAdmin(req.user.email)) return next(new HttpError(403, "Admins only.", { code: "not_admin" }));
  next();
}

/** Public: closed-beta signup form. No auth — this runs before anyone has an account. */
router.post("/signups", async (req, res) => {
  // Validated before the rate limit is spent, on purpose: the budget exists to protect the table,
  // and a rejected body never reaches it. Charging someone for mistyping their own email would
  // lock them out of signing up for an hour over a typo.
  const signup = assertValidSignup(req.body);
  if (!withinRateLimit(req.ip)) {
    throw new HttpError(429, "Too many signups from this address. Try again in a bit.", { code: "rate_limited" });
  }
  await saveSignup(signup);
  // Same response whether the email was new or already on the list — never disclose which.
  res.status(201).json({ received: true });
});

router.get("/signups", requireAuth, requireAdmin, async (req, res) => {
  res.json(await listSignupsForAdmin());
});

router.patch("/signups/:id", requireAuth, requireAdmin, async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, "That beta signup doesn't exist.", { code: "signup_not_found" });

  const body = req.body ?? {};
  const hasAdded = Object.prototype.hasOwnProperty.call(body, "addedToGoogle");
  const hasNotes = Object.prototype.hasOwnProperty.call(body, "notes");
  if (hasAdded && typeof body.addedToGoogle !== "boolean") {
    throw new HttpError(400, "addedToGoogle must be true or false.", {
      code: "invalid_request",
      details: [{ field: "addedToGoogle", message: "Must be true or false." }],
    });
  }
  // The 2000 cap mirrors beta_signups' check constraint (0005). Without it, a longer note
  // fails in the database and surfaces as a bare "Internal server error".
  if (hasNotes && (typeof body.notes !== "string" || body.notes.length > 2000)) {
    throw new HttpError(400, "Notes must be text of 2000 characters or fewer.", {
      code: "invalid_request",
      details: [{ field: "notes", message: "Keep notes to 2000 characters or fewer." }],
    });
  }
  if (!hasAdded && !hasNotes) throw new HttpError(400, "Send addedToGoogle or notes.", { code: "invalid_request" });

  const signup = await patchSignup(req.params.id, {
    addedToGoogle: hasAdded ? body.addedToGoogle : undefined,
    notes: hasNotes ? body.notes : undefined,
  });
  if (!signup) throw new HttpError(404, "That beta signup doesn't exist.", { code: "signup_not_found" });
  res.json({ signup });
});

/** Admin export, for pasting into Google Auth Platform → Audience → Test users. */
router.get("/signups.csv", requireAuth, requireAdmin, async (req, res) => {
  const rows = await listSignups();
  res.set("Content-Type", "text/csv");
  res.set("Content-Disposition", "attachment; filename=beta-signups.csv");
  res.send(signupsToCsv(rows));
});

export default router;
