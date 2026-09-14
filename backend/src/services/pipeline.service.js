import { env } from "../config/env.js";
import { classifyImage } from "./gemini.service.js";
import { getFileBuffer, listChanges, renameAndMove } from "./drive.service.js";
import { getFolderConfig } from "../repositories/folderConfig.repo.js";
import { getSubscription, isEntitled } from "../repositories/subscription.repo.js";
import * as channels from "../repositories/driveChannel.repo.js";
import * as processed from "../repositories/processedFile.repo.js";
import { buildFileName, SUPPORTED_MIME_TYPES } from "../utils/filename.js";
import { logger } from "../utils/logger.js";

// Drive can deliver several notifications for one burst of uploads. Collapsing
// concurrent sweeps per user avoids duplicate Gemini calls; the unique
// constraint in processed_files is the real correctness guarantee.
const inFlight = new Set();

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
 * new images in the Raw folder, then persist the advanced token.
 */
export async function processNotification(channel) {
  const userId = channel.user_id;
  if (inFlight.has(userId)) {
    logger.info("Sweep already running for user, skipping", { userId });
    return;
  }
  inFlight.add(userId);

  try {
    const [config, subscription] = await Promise.all([
      getFolderConfig(userId),
      getSubscription(userId),
    ]);

    if (!config) {
      logger.warn("Notification for user without folder config", { userId });
      return;
    }
    if (!isEntitled(subscription)) {
      logger.warn("Skipping sweep: no active entitlement", { userId });
      return;
    }

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
  } finally {
    inFlight.delete(userId);
  }
}
