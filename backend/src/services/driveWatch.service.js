import crypto from "node:crypto";
import { google } from "googleapis";
import { env } from "../config/env.js";
import { getAuthedClient, revokeAccess } from "./googleAuth.service.js";
import { getStartPageToken } from "./drive.service.js";
import * as channels from "../repositories/driveChannel.repo.js";
import { deleteCredentials } from "../repositories/credentials.repo.js";
import { logger } from "../utils/logger.js";

// Without an explicit expiration Drive closes a channel after one hour. Changes
// channels may last up to a week; ask for a little less so renewal has slack.
const CHANNEL_TTL_MS = 6 * 24 * 60 * 60 * 1000;
const RENEW_WITHIN_HOURS = 24;
const RENEWAL_INTERVAL_MS = 60 * 60 * 1000;

// Polling channels never expire at Google, so they get a date the renewal job ignores.
const POLLING_EXPIRES_AT = "9999-12-31T00:00:00.000Z";

async function registerWebhook(userId, channelId, pageToken) {
  const drive = google.drive({ version: "v3", auth: await getAuthedClient(userId) });
  const { data } = await drive.changes.watch({
    pageToken,
    requestBody: {
      id: channelId,
      type: "web_hook",
      address: env.google.webhookUrl,
      token: env.google.webhookToken,
      expiration: String(Date.now() + CHANNEL_TTL_MS),
    },
  });
  return {
    resourceId: data.resourceId,
    // Drive decides the real lifetime; renew off what it returns, not what we asked for.
    expiresAt: new Date(Number(data.expiration)).toISOString(),
  };
}

async function stopAtGoogle(userId, channel) {
  if (channels.isPollingChannel(channel)) return;
  try {
    const drive = google.drive({ version: "v3", auth: await getAuthedClient(userId) });
    await drive.channels.stop({
      requestBody: { id: channel.channel_id, resourceId: channel.resource_id },
    });
  } catch (err) {
    // Already-expired channels 404; nothing else to clean up at Google.
    logger.warn("Could not stop Drive channel at Google", {
      userId,
      channelId: channel.channel_id,
      reason: err.message,
    });
  }
}

// Start, stop, renew and disconnect for the same user run one at a time within
// this process, so a pause or disconnect can't interleave with an in-flight start
// or renewal and leave a live channel (or one that can't be stopped) behind.
// Assumes a single backend instance, which is how App Platform runs it today.
const userLocks = new Map();

function withUserLock(userId, work) {
  const previous = userLocks.get(userId) ?? Promise.resolve();
  const run = previous.then(work);
  const tail = run.catch(() => {});
  userLocks.set(userId, tail);
  tail.then(() => {
    if (userLocks.get(userId) === tail) userLocks.delete(userId);
  });
  return run;
}

/** Stops a channel we just registered but failed to record, so it can't linger at Google. */
async function discardRegistered(userId, channelId, live) {
  await stopAtGoogle(userId, { channel_id: channelId, resource_id: live.resourceId });
}

async function startWatchUnlocked(userId) {
  await stopWatchUnlocked(userId);

  const pageToken = await getStartPageToken(userId);
  const channelId = crypto.randomUUID();

  let live;
  try {
    live = await registerWebhook(userId, channelId, pageToken);
  } catch (err) {
    if (env.autoSync.intervalSeconds <= 0) throw err;

    logger.warn("Webhook registration failed; falling back to polling", { userId, reason: err.message });
    return channels.createChannel({
      userId,
      channelId: `poll-${channelId}`,
      resourceId: channels.POLLING_RESOURCE_ID,
      pageToken,
      expiresAt: POLLING_EXPIRES_AT,
    });
  }

  let record;
  try {
    record = await channels.createChannel({
      userId,
      channelId,
      resourceId: live.resourceId,
      pageToken,
      expiresAt: live.expiresAt,
    });
  } catch (err) {
    await discardRegistered(userId, channelId, live);
    throw err;
  }

  logger.info("Drive watch channel opened", { userId, channelId, expiresAt: record.expires_at });
  return record;
}

async function stopWatchUnlocked(userId) {
  // Delete first, then stop whichever channel the row held at that moment.
  const removed = await channels.deleteChannelForUser(userId);
  if (!removed) return false;

  await stopAtGoogle(userId, removed);
  logger.info("Drive watch channel closed", { userId, channelId: removed.channel_id });
  return true;
}

async function renewChannelUnlocked(channel) {
  const userId = channel.user_id;
  const channelId = crypto.randomUUID();
  const live = await registerWebhook(userId, channelId, channel.page_token);

  let replaced;
  try {
    replaced = await channels.replaceChannel(channel.channel_id, {
      channelId,
      resourceId: live.resourceId,
      expiresAt: live.expiresAt,
    });
  } catch (err) {
    await discardRegistered(userId, channelId, live);
    throw err;
  }
  if (!replaced) {
    // The row is gone or already holds another channel (paused or renewed since it was listed).
    await discardRegistered(userId, channelId, live);
    return null;
  }

  await stopAtGoogle(userId, channel);
  logger.info("Drive watch channel renewed", {
    userId,
    previousChannelId: channel.channel_id,
    channelId,
    expiresAt: replaced.expires_at,
  });
  return replaced;
}

/**
 * Watches the user's *changes feed*, not the folder itself: Drive's per-file
 * watch on a folder does not reliably fire for files added inside it. The
 * webhook filters the resulting changes down to the Raw folder.
 *
 * If Google refuses the webhook (it needs a public, verified domain) and
 * auto-sync is enabled, the same page token is stored as a polling channel
 * that the auto-sync poller sweeps instead.
 */
export function startWatch(userId) {
  return withUserLock(userId, () => startWatchUnlocked(userId));
}

export function stopWatch(userId) {
  return withUserLock(userId, () => stopWatchUnlocked(userId));
}

/**
 * Swaps a channel for a fresh live one. The new channel is opened *before* the
 * old one is stopped, and it resumes from the stored page token, so changes that
 * arrived since the last sweep are not skipped. If opening the new channel
 * fails, the existing channel and row are left untouched.
 */
export function renewChannel(channel) {
  return withUserLock(channel.user_id, () => renewChannelUnlocked(channel));
}

/**
 * Stops sorting, revokes DriveTag's grant at Google, then deletes the stored
 * token — in that order and under the user's lock, so the channel is stopped
 * while the credentials needed to stop it still exist.
 */
export function disconnectDrive(userId) {
  return withUserLock(userId, async () => {
    await stopWatchUnlocked(userId);
    try {
      await revokeAccess(userId);
    } catch (err) {
      logger.warn("Token revocation failed, deleting locally anyway", { userId, reason: err.message });
    }
    await deleteCredentials(userId);
    logger.info("Drive disconnected", { userId });
  });
}

/**
 * Channels expire and must be recreated or notifications silently stop. Runs
 * inside the production server (startChannelRenewal) and from
 * scripts/renew-channels.js.
 */
export async function renewExpiringChannels(windowHours = RENEW_WITHIN_HOURS) {
  const cutoff = new Date(Date.now() + windowHours * 60 * 60 * 1000).toISOString();
  const expiring = await channels.listExpiringChannels(cutoff);

  const results = { renewed: 0, failed: 0, skipped: 0 };
  for (const channel of expiring) {
    try {
      results[(await renewChannel(channel)) ? "renewed" : "skipped"] += 1;
    } catch (err) {
      results.failed += 1;
      logger.error("Channel renewal failed", { userId: channel.user_id, reason: err.message });
    }
  }
  return results;
}

/** Hourly renewal inside the server process: DigitalOcean App Platform has no built-in cron. */
export function startChannelRenewal() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const results = await renewExpiringChannels();
      if (results.renewed || results.failed || results.skipped) {
        logger.info("Channel renewal sweep finished", results);
      }
    } catch (err) {
      logger.error("Channel renewal sweep failed", { reason: err.message });
    } finally {
      running = false;
    }
  };

  void run();
  return setInterval(run, RENEWAL_INTERVAL_MS);
}

/**
 * With auto-sync switched off nothing sweeps polling channels, so their users
 * would silently stop being organized. Try to upgrade each to a live channel.
 */
export async function convertPollingChannels() {
  const polling = await channels.listPollingChannels();
  for (const channel of polling) {
    try {
      await renewChannel(channel);
    } catch (err) {
      logger.error("Polling channel left stranded: auto-sync is off and the webhook was refused", {
        userId: channel.user_id,
        reason: err.message,
      });
    }
  }
}
