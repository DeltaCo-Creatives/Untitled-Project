import crypto from "node:crypto";
import { DRIVE_SCOPES, revokeRefreshToken } from "./googleAuth.service.js";
import { saveRefreshToken } from "../repositories/credentials.repo.js";
import { ensureSubscription } from "../repositories/subscription.repo.js";
import { decrypt, encrypt } from "../utils/crypto.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";

// The OAuth callback can't prove who finished Google's consent screen: the signed
// state only names the DriveTag user who *started* the flow. Storing the grant
// there would let anyone who sends a victim their own consent link attach the
// victim's Drive to the sender's account. So the callback parks the grant under
// a one-time id, and only the signed-in user who started the flow can claim it.
//
// In memory, like the pipeline's locks: this assumes a single backend instance.
// A restart in the seconds between callback and claim just means "try again".
const PENDING_TTL_MS = 10 * 60 * 1000;
const pending = new Map(); // id → { userId, sealedToken, expiresAt }

function dropExpired(now = Date.now()) {
  for (const [id, entry] of pending) {
    if (entry.expiresAt <= now) pending.delete(id);
  }
}

/** Parks a freshly exchanged refresh token for the user named in the OAuth state. Returns the one-time claim id. */
export function parkGrant(userId, refreshToken) {
  dropExpired();
  const id = crypto.randomBytes(32).toString("base64url");
  pending.set(id, { userId, sealedToken: encrypt(refreshToken), expiresAt: Date.now() + PENDING_TTL_MS });
  return id;
}

/**
 * Stores a parked grant for the signed-in user, only if they started the flow.
 * A mismatch revokes the grant at Google so it isn't left live anywhere.
 */
export async function claimGrant(pendingId, userId) {
  const entry = typeof pendingId === "string" ? pending.get(pendingId) : undefined;
  if (entry) pending.delete(pendingId); // single use, whatever happens next

  if (!entry || entry.expiresAt <= Date.now()) {
    throw new HttpError(404, "That connection link expired or was already used. Please try again.", {
      code: "connect_expired",
    });
  }

  const refreshToken = decrypt(entry.sealedToken);

  if (entry.userId !== userId) {
    logger.warn("Drive connection claimed by a different user; revoking it", { startedBy: entry.userId, claimedBy: userId });
    try {
      await revokeRefreshToken(refreshToken);
    } catch (err) {
      logger.error("Could not revoke an unclaimed Drive grant", { reason: err.message });
    }
    throw new HttpError(
      403,
      "This Google Drive connection was started from a different DriveTag account. Sign in with that account, or start Connect Drive again from this one.",
      { code: "drive_connect_mismatch" },
    );
  }

  await saveRefreshToken(userId, refreshToken, DRIVE_SCOPES);
  await ensureSubscription(userId);
  logger.info("Drive connected", { userId });
}

/**
 * Revokes and drops any grant parked for this user but never claimed — e.g. the
 * account was deleted in the few minutes between starting Connect Drive and
 * finishing Google's consent screen. Never throws: a stuck revoke at Google
 * must not block account deletion, and the entry is dropped either way.
 */
export async function dropPendingGrantsForUser(userId) {
  for (const [id, entry] of pending) {
    if (entry.userId !== userId) continue;
    pending.delete(id);
    try {
      await revokeRefreshToken(decrypt(entry.sealedToken));
    } catch (err) {
      logger.warn("Could not revoke a pending Drive grant during account deletion", { userId, reason: err.message });
    }
  }
}
