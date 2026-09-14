import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { listFolders, getFolder } from "../services/drive.service.js";
import { startWatch, stopWatch } from "../services/driveWatch.service.js";
import { getFolderConfig, saveFolderConfig } from "../repositories/folderConfig.repo.js";
import { getChannelForUser } from "../repositories/driveChannel.repo.js";

const router = Router();

router.use(requireAuth);

/** Folder list for the onboarding picker. */
router.get("/folders", async (req, res) => {
  const folders = await listFolders(req.user.id, req.query.q);
  res.json({ folders });
});

router.get("/config", async (req, res) => {
  res.json({ config: await getFolderConfig(req.user.id) });
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

  res.json({ config });
});

router.get("/watch", async (req, res) => {
  const channel = await getChannelForUser(req.user.id);
  res.json({
    watching: Boolean(channel),
    expiresAt: channel?.expires_at ?? null,
  });
});

router.post("/watch", async (req, res) => {
  const config = await getFolderConfig(req.user.id);
  if (!config) {
    return res.status(409).json({ error: "Select folders before starting the watch" });
  }

  const channel = await startWatch(req.user.id);
  res.json({ watching: true, expiresAt: channel.expires_at });
});

router.delete("/watch", async (req, res) => {
  const stopped = await stopWatch(req.user.id);
  res.json({ watching: false, stopped });
});

export default router;
