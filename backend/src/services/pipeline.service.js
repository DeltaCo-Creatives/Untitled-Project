import { env } from "../config/env.js";
import { classifyImage } from "./gemini.service.js";
import { getFileBuffer, listChanges, listImagesInFolder, renameAndMove } from "./drive.service.js";
import { getFolderConfig } from "../repositories/folderConfig.repo.js";
import { getSubscription, isEntitled } from "../repositories/subscription.repo.js";
import * as channels from "../repositories/driveChannel.repo.js";
import * as processed from "../repositories/processedFile.repo.js";
import { buildFileName, SUPPORTED_MIME_TYPES } from "../utils/filename.js";
import { logger } from "../utils/logger.js";

// Drive can deliver several notifications for one burst of uploads, and a user
// can click "Organize now" mid-sweep. Collapsing concurrent sweeps per user
// avoids duplicate Gemini calls; the unique constraint in processed_files is
// the real correctness guarantee.
const inFlight = new Set();

export function isSweeping(userId) {
  return inFlight.has(userId);
}

async function singleFlight(userId, work) {
  if (inFlight.has(userId)) {
    logger.info("Sweep already running for user, skipping", { userId });
    return false;
  }
  inFlight.add(userId);
  try {
    await work();
    return true;
  } finally {
    inFlight.delete(userId);
  }
}

/** The folder config for a sweep, or null when the user has no folders or no entitlement. */
async function loadSweepConfig(userId) {
  const [config, subscription] = await Promise.all([getFolderConfig(userId), getSubscription(userId)]);

  if (!config) {
    logger.warn("Sweep for user without folder config", { userId });
    return null;
  }
  if (!isEntitled(subscription)) {
    logger.warn("Skipping sweep: no active entitlement", { userId });
    return null;
  }
  return config;
}

function isCandidate(file, rawFolderId) {
  return (
    file &&
    !file.trashed &&
    file.parents?.includes(rawFolderId) &&
    SUPPORTED_MIME_TYPES.includes(file.mimeType)
  );
}

async function processFile(userId, file, config) {
  const claimed = await processed.claimFile(userId, file.id, file.name);
  if (!claimed) return "skipped";

  try {
    if (Number(file.size) > env.gemini.maxImageBytes) {
      throw new Error(`File exceeds ${env.gemini.maxImageBytes} byte limit`);
    }

    // In memory for exactly as long as the classification takes.
    const buffer = await getFileBuffer(userId, file.id);
    const tags = await classifyImage(buffer, file.mimeType);

    const newName = buildFileName(tags, file.name, file.mimeType);
    await renameAndMove(userId, file.id, {
      name: newName,
      addParent: config.destination_folder_id,
      removeParent: config.raw_folder_id,
    });

    await processed.recordResult(userId, file.id, { newName, tags });
    logger.info("File tagged and moved", { userId, fileId: file.id, newName, tags });
    return "completed";
  } catch (err) {
    await processed.recordFailure(userId, file.id, err.message);
    logger.error("File processing failed", { userId, fileId: file.id, reason: err.message });
    return "failed";
  }
}

/**
 * Loop B: walk the user's changes feed from the stored page token, process any
 * new images in the Raw folder, then persist the advanced token. Driven by Drive
 * webhooks, or by the auto-sync poller for polling-mode channels.
 */
export async function processNotification(channel) {
  const userId = channel.user_id;

  await singleFlight(userId, async () => {
    const config = await loadSweepConfig(userId);
    if (!config) return;

    let pageToken = channel.page_token;
    while (pageToken) {
      const page = await listChanges(userId, pageToken);
      const candidates = (page.changes ?? [])
        .filter((change) => !change.removed)
        .map((change) => change.file)
        .filter((file) => isCandidate(file, config.raw_folder_id));

      // Sequential on purpose: one image buffer alive at a time, and it keeps
      // us inside Gemini's rate limits.
      for (const file of candidates) {
        await processFile(userId, file, config);
      }

      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
      } else {
        await channels.updatePageToken(channel.channel_id, page.newStartPageToken);
        break;
      }
    }
  });
}

/**
 * "Organize now": process images already sitting in the Raw folder, which the
 * changes feed never reports because they arrived before the watch started.
 */
export async function processRawFolder(userId, { retryFailed = false } = {}) {
  const summary = { found: 0, completed: 0, failed: 0, skipped: 0 };

  const ran = await singleFlight(userId, async () => {
    const config = await loadSweepConfig(userId);
    if (!config) return;

    const files = await listImagesInFolder(userId, config.raw_folder_id, SUPPORTED_MIME_TYPES);
    summary.found = files.length;
    if (retryFailed) await processed.releaseFailed(userId, files.map((file) => file.id));

    for (const file of files) {
      summary[await processFile(userId, file, config)] += 1;
    }
    logger.info("Raw folder organized", { userId, ...summary });
  });

  return { ran, ...summary };
}

/** What's in the Raw folder right now, split by whether DriveTag has touched each file. */
export async function getRawFolderStatus(userId, config) {
  const files = await listImagesInFolder(userId, config.raw_folder_id, SUPPORTED_MIME_TYPES);
  const statuses = await processed.getStatuses(userId, files.map((file) => file.id));

  const counts = { waiting: 0, processing: 0, failed: 0 };
  for (const file of files) {
    const status = statuses.get(file.id);
    if (!status) counts.waiting += 1;
    else if (status === "processing") counts.processing += 1;
    else if (status === "failed") counts.failed += 1;
    // A "completed" file still listed here is mid-move out of Raw.
  }

  return { ...counts, total: files.length, syncing: inFlight.has(userId) };
}
