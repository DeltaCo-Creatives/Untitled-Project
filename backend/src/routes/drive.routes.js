import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { createFolder, getFolderPath, listFolders } from "../services/drive.service.js";
import { startWatch, stopWatch } from "../services/driveWatch.service.js";
import { getRawFolderStatus, isSweeping, processRawFolder } from "../services/pipeline.service.js";
import { listForUser, saveForUser } from "../services/processes.service.js";
import { getChannelForUser, isPollingChannel } from "../repositories/driveChannel.repo.js";
import { HttpError } from "../utils/httpError.js";
import { serializeLegacyFolderConfig } from "../utils/serialize.js";
import { logger } from "../utils/logger.js";

const router = Router();

router.use(requireAuth);

/** Folder browser: children of parentId ("root" = My Drive), or a name search across Drive. */
router.get("/folders", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const parentId = typeof req.query.parentId === "string" ? req.query.parentId : "root";
  const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
  res.json(await listFolders(req.user.id, { q, parentId, pageToken }));
});

/** "New folder" in the folder browser: an explicit user action. */
router.post("/folders", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const parentId = typeof req.body?.parentId === "string" && req.body.parentId ? req.body.parentId : "root";
  if (!name || name.length > 100) {
    throw new HttpError(400, "Folder names need 1 to 100 characters.", { code: "invalid_folder_name" });
  }
  res.status(201).json({ folder: await createFolder(req.user.id, name, parentId) });
});

router.get("/folders/:id/path", async (req, res) => {
  res.json(await getFolderPath(req.user.id, req.params.id));
});

// ---- Legacy single-folder endpoints, kept so an open tab of the previous
// frontend keeps working through the deploy. Removed in the cleanup release.

router.get("/config", async (req, res) => {
  const { processes } = await listForUser(req.user.id);
  res.json({ config: serializeLegacyFolderConfig(processes[0]) });
});

/**
 * The old single-folder save, mapped onto the user's first work process so it gets the same validation, plan limit,
 * loop guard and folder checks as PUT /api/processes/:id. "Destination" becomes the Master folder, and Unsorted
 * sorts into it, which is what the old app did.
 */
router.post("/config", async (req, res) => {
  const { rawFolderId, destinationFolderId } = req.body ?? {};

  if (typeof rawFolderId !== "string" || typeof destinationFolderId !== "string" || !rawFolderId || !destinationFolderId) {
    return res.status(400).json({ error: "rawFolderId and destinationFolderId are required" });
  }

  const { processes } = await listForUser(req.user.id);
  const first = processes[0];
  const body = first
    ? {
        name: first.name,
        rawFolderId,
        masterFolderId: destinationFolderId,
        renameTemplate: first.rename_template,
        instructions: first.instructions,
        timezone: first.timezone,
        tagFields: first.tag_fields,
        destinations: first.destinations.map((destination) => ({
          id: destination.id,
          name: destination.name,
          description: destination.description,
          isFallback: destination.is_fallback,
          folder: destination.is_fallback ? { mode: "master" } : { mode: "existing", id: destination.folder_id },
        })),
      }
    : {
        name: "My first process",
        rawFolderId,
        masterFolderId: destinationFolderId,
        renameTemplate: "{genre}_{subject}",
        instructions: "",
        timezone: "UTC",
        tagFields: [],
        destinations: [{ name: "Unsorted", description: "", isFallback: true, folder: { mode: "master" } }],
      };

  const process = await saveForUser(req.user.id, first?.id ?? null, body);
  res.json({ config: serializeLegacyFolderConfig(process) });
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

/** One watch per user covers every process: the whole changes feed is swept and matched to Raw folders. */
router.post("/watch", async (req, res) => {
  const { processes } = await listForUser(req.user.id);
  if (!processes.some((process) => process.active)) {
    return res.status(409).json({ error: "Create or turn on a work process before starting automatic sorting" });
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

/** Legacy: images waiting in every active process's Raw folder, summed. */
router.get("/raw-status", async (req, res) => {
  const { processes } = await listForUser(req.user.id);
  const active = processes.filter((process) => process.active);
  if (processes.length === 0) {
    return res.status(409).json({ error: "Select folders first" });
  }
  res.json(await getRawFolderStatus(req.user.id, active));
});

/** Legacy "Organize now": every active process. */
router.post("/organize", async (req, res) => {
  const userId = req.user.id;
  const retryFailed = req.body?.retryFailed === true;

  const { processes, entitlement } = await listForUser(userId);
  if (processes.length === 0) {
    return res.status(409).json({ error: "Select folders first" });
  }
  if (!entitlement || entitlement.credits <= 0) {
    return res.status(402).json({ error: "You're out of images, so tagging is paused." });
  }
  if (isSweeping(userId)) {
    return res.json({ started: false, reason: "DriveTag is already organizing your folder." });
  }

  // Started in this tick so the slot is reserved before anything else can take it.
  processRawFolder(userId, { retryFailed }).catch((err) => {
    logger.error("Organize now failed", { userId, reason: err.message });
  });
  res.status(202).json({ started: true });
});

export default router;
