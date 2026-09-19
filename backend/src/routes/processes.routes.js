import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  deleteForUser,
  getForUser,
  listForUser,
  saveForUser,
  setEnabledForUser,
} from "../services/processes.service.js";
import { getProcessesStatus, isSweeping, processRawFolder } from "../services/pipeline.service.js";
import { HttpError } from "../utils/httpError.js";
import { isUuid } from "../utils/processValidation.js";
import { serializeProcess } from "../utils/serialize.js";
import { logger } from "../utils/logger.js";

const router = Router();

router.use(requireAuth);

// Non-UUID ids would otherwise reach Postgres and fail as a 500.
router.param("id", (req, res, next, id) => {
  if (!isUuid(id)) return next(new HttpError(404, "That work process doesn't exist.", { code: "process_not_found" }));
  next();
});

function outOfCreditsMessage(plan, kind) {
  const noun = kind === "document" ? "document" : "image";
  const plural = kind === "document" ? "documents" : "images";
  const packArticle = kind === "document" ? "a" : "an";
  if (plan.id === "free") {
    const freeLimit = kind === "document" ? plan.freeDocuments : plan.freeImages;
    return `You've used all ${freeLimit.toLocaleString("en-US")} free ${plural}. Upgrade your plan or add ${packArticle} ${noun} pack to keep sorting.`;
  }
  return `You're out of ${noun} credits. Add ${packArticle} ${noun} pack, or they'll refill when your next billing period starts.`;
}

router.get("/", async (req, res) => {
  const { processes, limit } = await listForUser(req.user.id);
  res.json({ processes: processes.map(serializeProcess), limit });
});

router.post("/", async (req, res) => {
  const process = await saveForUser(req.user.id, null, req.body);
  res.status(201).json({ process: serializeProcess(process) });
});

/** Raw folder counts for every process, plus what the user's sweep slot is doing. */
router.get("/status", async (req, res) => {
  const { processes } = await listForUser(req.user.id);
  res.json(await getProcessesStatus(req.user.id, processes));
});

router.get("/:id", async (req, res) => {
  res.json({ process: serializeProcess(await getForUser(req.user.id, req.params.id)) });
});

router.put("/:id", async (req, res) => {
  const process = await saveForUser(req.user.id, req.params.id, req.body);
  res.json({ process: serializeProcess(process) });
});

router.patch("/:id", async (req, res) => {
  if (typeof req.body?.enabled !== "boolean") {
    throw new HttpError(400, "Send { enabled: true | false }.", { code: "invalid_request" });
  }
  const process = await setEnabledForUser(req.user.id, req.params.id, req.body.enabled);
  res.json({ process: serializeProcess(process) });
});

router.delete("/:id", async (req, res) => {
  res.json(await deleteForUser(req.user.id, req.params.id));
});

/**
 * "Organize now" for one process: sort the images already in its Raw folder.
 * Checks the process and remaining images up front so no Gemini spend happens
 * for work that can't run, then acks and works in the background.
 */
router.post("/:id/organize", async (req, res) => {
  const userId = req.user.id;
  const retryFailed = req.body?.retryFailed === true;
  const { processes, entitlement } = await listForUser(userId);
  const process = processes.find((candidate) => candidate.id === req.params.id);

  if (!process) throw new HttpError(404, "That work process doesn't exist.", { code: "process_not_found" });
  if (process.locked) {
    throw new HttpError(409, "This process is over your plan's limit, so it can't run.", { code: "process_locked" });
  }
  if (!process.enabled) throw new HttpError(409, "Turn this process on first.", { code: "process_disabled" });
  if (!entitlement) throw new HttpError(402, "Connect Google Drive first.", { code: "no_plan" });

  const kind = process.kind ?? "image";
  const kindCredits = entitlement.credits[kind] ?? 0;
  if (kindCredits <= 0) {
    throw new HttpError(402, outOfCreditsMessage(entitlement.plan, kind), {
      code: kind === "document" ? "out_of_documents" : "out_of_images",
    });
  }
  if (isSweeping(userId)) {
    return res.json({ started: false, reason: "DriveTag is already organizing. Try again when it finishes." });
  }

  const { statuses } = await getProcessesStatus(userId, [process]);
  const counts = statuses[process.id];
  const waiting = counts?.error ? 0 : counts.waiting + (retryFailed ? counts.failed : 0);

  // A sweep may have taken the slot while the counts loaded. Check again, then start in this same tick:
  // processRawFolder reserves the slot synchronously, so nothing can slip in between the check and the run.
  if (isSweeping(userId)) {
    return res.json({ started: false, reason: "DriveTag is already organizing. Try again when it finishes." });
  }
  processRawFolder(userId, { processId: process.id, retryFailed }).catch((err) => {
    logger.error("Organize now failed", { userId, processId: process.id, reason: err.message });
  });

  res.status(202).json({ started: true, waiting, willProcess: Math.min(waiting, kindCredits) });
});

export default router;
