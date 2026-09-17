import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getFolderConfig } from "../repositories/folderConfig.repo.js";
import { env } from "../config/env.js";
import { getChannelForUser, isPollingChannel } from "../repositories/driveChannel.repo.js";
import { serializeFolderConfig } from "../utils/serialize.js";
import { getSubscription, isEntitled } from "../repositories/subscription.repo.js";
import { getRefreshToken } from "../repositories/credentials.repo.js";
import { listRecent } from "../repositories/processedFile.repo.js";

const router = Router();

router.use(requireAuth);

/** Everything the dashboard needs to render in one call. */
router.get("/me", async (req, res) => {
  const userId = req.user.id;
  const [credential, config, channel, subscription] = await Promise.all([
    getRefreshToken(userId),
    getFolderConfig(userId),
    getChannelForUser(userId),
    getSubscription(userId),
  ]);

  const polling = isPollingChannel(channel);

  res.json({
    user: { id: userId, email: req.user.email },
    driveConnected: Boolean(credential),
    config: serializeFolderConfig(config),
    watching: Boolean(channel),
    watchMode: channel ? (polling ? "polling" : "live") : null,
    watchExpiresAt: channel && !polling ? channel.expires_at : null,
    autoSyncSeconds: env.autoSync.intervalSeconds > 0 ? env.autoSync.intervalSeconds : null,
    subscription: subscription
      ? {
          status: subscription.status,
          plan: subscription.plan,
          trialEndsAt: subscription.trial_ends_at,
          currentPeriodEnd: subscription.current_period_end,
        }
      : null,
    entitled: isEntitled(subscription),
  });
});

/** Tag/rename history — metadata only, no image data is ever stored. */
router.get("/activity", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json({ activity: await listRecent(req.user.id, limit) });
});

export default router;
