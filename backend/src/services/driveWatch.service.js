import crypto from "node:crypto";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { getAuthedClient } from "./googleAuth.service.js";
import { getStartPageToken } from "./drive.service.js";
import * as channels from "../repositories/driveChannel.repo.js";
import { logger } from "../utils/logger.js";

/**
 * Watches the user's *changes feed*, not the folder itself: Drive's per-file
 * watch on a folder does not reliably fire for files added inside it. The
 * webhook filters the resulting changes down to the Raw folder.
 */
export async function startWatch(userId) {
  const existing = await channels.getChannelForUser(userId);
  if (existing) await stopWatch(userId);

  const pageToken = await getStartPageToken(userId);
  const channelId = crypto.randomUUID();

  const drive = google.drive({ version: "v3", auth: await getAuthedClient(userId) });
  const { data } = await drive.changes.watch({
    pageToken,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: env.google.webhookUrl,
      token: env.google.webhookToken,
    },
  });

  const record = await channels.createChannel({
    userId,
    channelId,
    resourceId: data.resourceId,
    pageToken,
    // Drive decides the lifetime; we renew off whatever it returns rather than
    // assuming a fixed TTL.
    expiresAt: new Date(Number(data.expiration)).toISOString(),
  });

  logger.info("Drive watch channel opened", { userId, channelId, expiresAt: record.expires_at });
  return record;
}

export async function stopWatch(userId) {
  const channel = await channels.getChannelForUser(userId);
  if (!channel) return false;

  const drive = google.drive({ version: "v3", auth: await getAuthedClient(userId) });
  try {
    await drive.channels.stop({
      requestBody: { id: channel.channel_id, resourceId: channel.resource_id },
    });
  } catch (err) {
    // Already-expired channels 404; the row still has to go.
    logger.warn("Could not stop Drive channel at Google", {
      userId,
      channelId: channel.channel_id,
      reason: err.message,
    });
  }

  await channels.deleteChannel(channel.channel_id);
  logger.info("Drive watch channel closed", { userId, channelId: channel.channel_id });
  return true;
}

/**
 * Channels expire and must be recreated or notifications silently stop.
 * Run from scripts/renew-channels.js on a schedule.
 */
export async function renewExpiringChannels(windowHours = 6) {
  const cutoff = new Date(Date.now() + windowHours * 60 * 60 * 1000).toISOString();
  const expiring = await channels.listExpiringChannels(cutoff);

  const results = { renewed: 0, failed: 0 };
  for (const channel of expiring) {
    try {
      await startWatch(channel.user_id);
      results.renewed += 1;
    } catch (err) {
      results.failed += 1;
      logger.error("Channel renewal failed", { userId: channel.user_id, reason: err.message });
    }
  }
  return results;
}
