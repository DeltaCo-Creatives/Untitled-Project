import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { env } from "../config/env.js";
import { getChannelForUser, isPollingChannel } from "../repositories/driveChannel.repo.js";
import { getCredentialStatus } from "../repositories/credentials.repo.js";
import { isStaleClaim, listRecent } from "../repositories/processedFile.repo.js";
import { listForUser } from "../services/processes.service.js";
import { deleteAccount } from "../services/account.service.js";
import { betaStatusFor, isAdmin } from "../services/beta.service.js";
import { getGoogleAppTesting } from "../services/settings.service.js";
import { isUuid } from "../utils/processValidation.js";
import { serializeEntitlement, serializeLegacyFolderConfig } from "../utils/serialize.js";
import { HttpError } from "../utils/httpError.js";

const router = Router();

router.use(requireAuth);

/** Everything the dashboard needs to render in one call. */
router.get("/me", async (req, res) => {
  const userId = req.user.id;
  const [credential, channel, { processes, limit, entitlement }, beta] = await Promise.all([
    getCredentialStatus(userId),
    getChannelForUser(userId),
    listForUser(userId),
    betaStatusFor(req.user.email),
  ]);

  const polling = isPollingChannel(channel);
  const { plan, usage } = serializeEntitlement(entitlement);

  res.json({
    user: { id: userId, email: req.user.email },
    driveConnected: credential.connected,
    watching: Boolean(channel),
    watchMode: channel ? (polling ? "polling" : "live") : null,
    watchExpiresAt: channel && !polling ? channel.expires_at : null,
    autoSyncSeconds: env.autoSync.intervalSeconds > 0 ? env.autoSync.intervalSeconds : null,
    plan,
    usage,
    processCounts: {
      total: limit.used,
      active: processes.filter((process) => process.active).length,
      max: limit.max,
    },
    // Legacy fields for the previous frontend; removed in the cleanup release.
    config: serializeLegacyFolderConfig(processes[0]),
    subscription: entitlement
      ? { status: entitlement.usage.status, plan: plan.id, trialEndsAt: null, currentPeriodEnd: usage.periodResetsAt }
      : null,
    entitled: Boolean(entitlement && (entitlement.credits.image > 0 || entitlement.credits.document > 0)),
    admin: isAdmin(req.user.email),
    beta,
    googleAppTesting: getGoogleAppTesting(),
    driveConnectedAt: credential.updatedAt,
  });
});

/** Tag/rename history — metadata only, no image data is ever stored. */
router.get("/activity", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const processId = isUuid(req.query.processId) ? req.query.processId : undefined;
  const now = Date.now();
  // An orphaned claim would otherwise show as "Processing" forever; raw-status already counts it as failed.
  const activity = (await listRecent(req.user.id, { limit, processId })).map(({ claimed_at: claimedAt, ...row }) =>
    isStaleClaim({ ...row, claimed_at: claimedAt }, now)
      ? {
          ...row,
          status: "failed",
          error_message: "Interrupted while processing (the server restarted). If it's still in your Raw folder, use Retry.",
        }
      : row,
  );
  res.json({ activity });
});

/** Permanently deletes the signed-in user's DriveTag account and data. Guarded by a confirm phrase. */
router.delete("/me", async (req, res) => {
  if (req.body?.confirm !== "DELETE") {
    throw new HttpError(400, 'Send { "confirm": "DELETE" } to permanently delete your account.', {
      code: "confirm_required",
    });
  }
  await deleteAccount(req.user.id);
  res.json({ deleted: true });
});

export default router;
