import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { getChannelByChannelId } from "../repositories/driveChannel.repo.js";
import { processNotification } from "../services/pipeline.service.js";
import { logger } from "../utils/logger.js";

const router = Router();

function tokenMatches(given) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(env.google.webhookToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Google Drive push notifications arrive as a POST with an empty body and all
 * the useful information in X-Goog-* headers. Google retries on non-2xx and
 * expects a fast ack, so this handler validates, acks, and runs the pipeline
 * after responding.
 */
router.post("/", async (req, res) => {
  if (!tokenMatches(req.header("X-Goog-Channel-Token"))) {
    logger.warn("Rejected Drive webhook: channel token mismatch");
    return res.sendStatus(403);
  }

  const channelId = req.header("X-Goog-Channel-ID");
  const resourceState = req.header("X-Goog-Resource-State");

  logger.info("Drive push notification received", {
    channelId,
    resourceState,
    messageNumber: req.header("X-Goog-Message-Number"),
  });

  // Fired once when the channel opens; carries no change to act on.
  if (resourceState === "sync") return res.sendStatus(200);

  const channel = await getChannelByChannelId(channelId);
  if (!channel) {
    // Ack anyway: retrying an unknown channel will never succeed.
    logger.warn("Notification for unknown channel", { channelId });
    return res.sendStatus(200);
  }

  res.sendStatus(200);

  setImmediate(() => {
    processNotification(channel).catch((err) => {
      logger.error("Pipeline sweep failed", { userId: channel.user_id, reason: err.message });
    });
  });
});

export default router;
