import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listFolders, getFolder } from "../services/drive.service.js";
import { startWatch, stopWatch } from "../services/driveWatch.service.js";
import { getRawFolderStatus, isSweeping, processRawFolder } from "../services/pipeline.service.js";
import { getFolderConfig, saveFolderConfig } from "../repositories/folderConfig.repo.js";
import { getChannelForUser, isPollingChannel } from "../repositories/driveChannel.repo.js";
import { getSubscription, isEntitled } from "../repositories/subscription.repo.js";
import { serializeFolderConfig } from "../utils/serialize.js";
import { logger } from "../utils/logger.js";

const router = Router();

router.use(requireAuth);

/** Folder list for the onboarding picker. */
router.get("/folders", async (req, res) => {
  const folders = await listFolders(req.user.id, req.query.q);
  res.json({ folders });
});

router.get("/config", async (req, res) => {
  res.json({ config: serializeFolderConfig(await getFolderConfig(req.user.id)) });
});

router.post("/config", async (req, res) => {
  const { rawFolderId, destinationFolderId } = req.body ?? {};

  if (!rawFolderId || !destinationFolderId) {
    return res.status(400).json({ error: "rawFolderId and destinationFolderId are required" });
  }
  if (rawFolderId === destinationFolderId) {
    return res.status(400).json({ error: "Raw and destination folders must be different" });
  }

  // Confirm both exist and are folders this user can reach before saving.
  const [raw, destination] = await Promise.all([
    getFolder(req.user.id, rawFolderId),
    getFolder(req.user.id, destinationFolderId),
  ]);

  for (const folder of [raw, destination]) {
    if (folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) {
      return res.status(400).json({ error: `${folder.id} is not an active folder` });
    }
  }

  const config = await saveFolderConfig(req.user.id, {
    rawFolderId,
    rawFolderName: raw.name,
    destinationFolderId,
    destinationFolderName: destination.name,
  });

  res.json({ config: serializeFolderConfig(config) });
});

router.get("/watch", async (req, res) => {
  const channel = await getChannelForUser(req.user.id);
  const polling = isPollingChannel(channel);
  res.json({
    watching: Boolean(channel),
    mode: channel ? (polling ? "polling" : "live") : null,
    expiresAt: channel && !polling ? channel.expires_at : null,
  });
});

router.post("/watch", async (req, res) => {
  const config = await getFolderConfig(req.user.id);
  if (!config) {
    return res.status(409).json({ error: "Select folders before starting the watch" });
  }

  const channel = await startWatch(req.user.id);
  const polling = isPollingChannel(channel);
  res.json({
    watching: true,
    mode: polling ? "polling" : "live",
    expiresAt: polling ? null : channel.expires_at,
  });
});

router.delete("/watch", async (req, res) => {
  const stopped = await stopWatch(req.user.id);
  res.json({ watching: false, stopped });
});

/** Images currently in the Raw folder: waiting, being processed, or failed. */
router.get("/raw-status", async (req, res) => {
  const config = await getFolderConfig(req.user.id);
  if (!config) {
    return res.status(409).json({ error: "Select folders first" });
  }
  res.json(await getRawFolderStatus(req.user.id, config));
});

/**
 * "Organize now": tag, rename and move the images already sitting in Raw.
 * Checks folders and entitlement up front so no Gemini spend happens for a
 * user who can't be served, then acks and works in the background.
 */
router.post("/organize", async (req, res) => {
  const userId = req.user.id;
  const retryFailed = req.body?.retryFailed === true;

  const [config, subscription] = await Promise.all([getFolderConfig(userId), getSubscription(userId)]);
  if (!config) {
    return res.status(409).json({ error: "Select folders first" });
  }
  if (!isEntitled(subscription)) {
    return res.status(402).json({ error: "Your trial has ended, so tagging is paused." });
  }
  if (isSweeping(userId)) {
    return res.json({ started: false, reason: "DriveTag is already organizing your folder." });
  }

  res.status(202).json({ started: true });

  setImmediate(() => {
    processRawFolder(userId, { retryFailed }).catch((err) => {
      logger.error("Organize now failed", { userId, reason: err.message });
    });
  });
});

export default router;
