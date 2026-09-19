import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { forgetUser, isSweeping } from "./pipeline.service.js";
import { disconnectDrive } from "./driveWatch.service.js";
import { dropPendingGrantsForUser } from "./driveConnect.service.js";
import { deleteAuthUser } from "../repositories/user.repo.js";

/**
 * Permanently deletes the signed-in user's DriveTag account and data. Stops
 * sorting and revokes Drive access first, then deletes the Supabase auth
 * user — every app table cascades from auth.users(id), so that removes the
 * rest (see repositories/user.repo.js).
 */
export async function deleteAccount(userId) {
  // A worker mid-sweep could still move a file after the account (and its
  // Drive credentials) are gone. Refuse rather than race it.
  if (isSweeping(userId)) {
    throw new HttpError(409, "DriveTag is sorting your files right now. Try again in a minute.", {
      code: "sorting_in_progress",
    });
  }

  try {
    // Stops the watch channel, revokes the refresh token at Google, then deletes the stored credentials.
    await disconnectDrive(userId);
  } catch (err) {
    // Google being unreachable (or the token already invalid) must not block deletion: once our rows
    // are gone the token is unusable anyway, and the user can also revoke it at myaccount.google.com/permissions.
    logger.warn("Drive disconnect failed during account deletion; continuing", { userId, reason: err.message });
  }

  // A Drive-connect grant parked mid-flow (not yet claimed) lives in driveConnect's in-memory
  // store, not in anything disconnectDrive touches.
  await dropPendingGrantsForUser(userId);

  await deleteAuthUser(userId);
  // In-memory only: drop any Google Docs still queued for a re-check after their editing grace window.
  forgetUser(userId);
  logger.info("Account deleted", { userId });
}
