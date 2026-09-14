import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getFolderConfig } from "../repositories/folderConfig.repo.js";
import { getChannelForUser } from "../repositories/driveChannel.repo.js";
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

  res.json({
    user: { id: userId, email: req.user.email },
    driveConnected: Boolean(credential),
    config,
    watching: Boolean(channel),
    watchExpiresAt: channel?.expires_at ?? null,
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
