import { env } from "../config/env.js";
import { listPollingChannels } from "../repositories/driveChannel.repo.js";
import { processNotification } from "./pipeline.service.js";
import { logger } from "../utils/logger.js";

/**
 * Stands in for Drive push notifications on polling-mode channels: every tick
 * it runs the exact sweep a webhook would trigger. Off unless
 * AUTO_SYNC_INTERVAL_SECONDS > 0.
 */
export function startAutoSync() {
  const seconds = env.autoSync.intervalSeconds;
  if (!(seconds > 0)) return null;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const channel of await listPollingChannels()) {
        // Re-read each tick: sweeps advance the page token stored on the row.
        await processNotification(channel).catch((err) => {
          logger.error("Auto-sync sweep failed", { userId: channel.user_id, reason: err.message });
        });
      }
    } catch (err) {
      logger.error("Auto-sync tick failed", { reason: err.message });
    } finally {
      running = false;
    }
  };

  logger.info("Auto-sync enabled", { intervalSeconds: seconds });
  return setInterval(tick, seconds * 1000);
}
