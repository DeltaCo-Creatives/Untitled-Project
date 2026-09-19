import { env } from "../config/env.js";
import { classifyImage } from "./gemini.service.js";
import { getFileBuffer, getStartPageToken, listChanges, listImagesInFolder, renameAndMove } from "./drive.service.js";
import { loadEntitlement, rankProcesses } from "./entitlement.service.js";
import { listProcesses } from "../repositories/workProcess.repo.js";
import * as channels from "../repositories/driveChannel.repo.js";
import * as processed from "../repositories/processedFile.repo.js";
import { renderFileName, SUPPORTED_MIME_TYPES } from "../utils/filename.js";
import { fileDateString } from "../utils/fileDate.js";
import { logger } from "../utils/logger.js";

// Drive can deliver several notifications for one burst of uploads, and a user
// can click "Organize now" mid-sweep. Collapsing concurrent sweeps per user
// avoids duplicate Gemini calls and keeps the local credit count accurate; the
// claim in processed_files is the real correctness guarantee.
const inFlight = new Map(); // userId → { kind: "sweep" | "organize", processId }

// A notification that arrives while a sweep runs would otherwise be dropped,
// leaving its images waiting until the next Drive change. Remember it and sweep
// once more afterwards.
const rerunRequested = new Set();

export function isSweeping(userId) {
  return inFlight.has(userId);
}

/** What the user's single sweep slot is doing right now, or null. */
export function sweepState(userId) {
  return inFlight.get(userId) ?? null;
}

async function singleFlight(userId, state, work) {
  if (inFlight.has(userId)) {
    logger.info("Sweep already running for user, skipping", { userId });
    return false;
  }
  inFlight.set(userId, state);
  try {
    await work();
    return true;
  } finally {
    inFlight.delete(userId);
    invalidateStatusCache(userId);
  }
}

/**
 * Everything a sweep needs, loaded once: plan, remaining credits, the user's
 * processes ranked against the plan, and every Raw folder id (for the loop
 * guard). Null when the user has no subscription row: fail closed.
 */
async function loadSweepContext(userId) {
  const [entitlement, processes] = await Promise.all([loadEntitlement(userId), listProcesses(userId)]);
  if (!entitlement) {
    logger.warn("Skipping sweep: user has no subscription row", { userId });
    return null;
  }

  const ranked = rankProcesses(processes, entitlement.plan);
  // Every process must have exactly one Unsorted destination (save_work_process enforces it). If one somehow
  // doesn't, skip it before any Gemini spend rather than failing each of its images afterwards.
  const runnable = ranked.filter((process) => {
    if (!process.active) return false;
    if (process.destinations.some((destination) => destination.is_fallback)) return true;
    logger.error("Skipping work process without an Unsorted destination", { userId, processId: process.id });
    return false;
  });
  return {
    ...entitlement,
    processes: ranked,
    runnableIds: new Set(runnable.map((process) => process.id)),
    byRaw: new Map(runnable.map((process) => [process.raw_folder_id, process])),
    rawFolderIds: new Set(processes.map((process) => process.raw_folder_id)),
  };
}

/** The active process whose Raw folder directly contains this file, if it's a supported image. */
function matchProcess(file, ctx) {
  if (!file || file.trashed || !SUPPORTED_MIME_TYPES.includes(file.mimeType)) return null;
  for (const parent of file.parents ?? []) {
    const process = ctx.byRaw.get(parent);
    if (process) return process;
  }
  return null;
}

/**
 * Loop guard: never move an image into any process's Raw folder (including
 * disabled and locked ones), or it would be picked up and sorted again.
 */
function resolveDestination(process, chosen, ctx) {
  const fallback = process.destinations.find((destination) => destination.is_fallback);
  let destination = chosen ?? fallback;

  if (destination && ctx.rawFolderIds.has(destination.folder_id) && destination !== fallback) {
    logger.warn("Destination is a Raw folder; using Unsorted instead", { processId: process.id, destinationId: destination.id });
    destination = fallback;
  }
  if (!destination || ctx.rawFolderIds.has(destination.folder_id)) {
    throw new Error(`"${process.name}" is misconfigured: its Unsorted folder is a Raw folder. Edit the process to fix it.`);
  }
  return destination;
}

const megabytes = (bytes) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

function tooLargeMessage(bytes) {
  return `This image is ${megabytes(bytes)}, over the ${megabytes(env.gemini.maxImageBytes)} DriveTag can send to the AI.`;
}

function readableMoveError(err, destination) {
  const message = String(err?.message ?? "");
  if (destination.folder_id && message.includes(destination.folder_id)) {
    return new Error(`The "${destination.name}" folder is missing or DriveTag can't add files to it. Edit the process to pick another folder.`);
  }
  return err;
}

/**
 * Bounds how many downloads+classifications run at once across every user's run,
 * since each holds an image buffer (up to gemini.maxImageBytes) in memory and Gemini
 * has per-project rate limits. A small in-module FIFO queue: acquire() resolves
 * immediately while permits remain, otherwise waits for a release().
 *
 * ponytail: FIFO isn't fair across users — one huge "Organize now" can sit ahead of
 * everyone else's jobs in the queue. Per-user fairness is the upgrade path if that
 * becomes a real problem.
 */
function createSemaphore(max) {
  let free = max;
  const waiters = [];
  return {
    async acquire() {
      if (free > 0) {
        free -= 1;
        return;
      }
      await new Promise((resolve) => waiters.push(resolve));
    },
    release() {
      const next = waiters.shift();
      if (next) next();
      else free += 1;
    },
  };
}
const aiJobSlots = createSemaphore(env.pipeline.maxConcurrentAiJobs);

/** Downloads and classifies one file. The buffer only exists between acquiring and releasing a global slot (Zero-Retention). */
async function classifyFile(userId, file, process) {
  await aiJobSlots.acquire();
  try {
    const buffer = await getFileBuffer(userId, file.id);
    return await classifyImage(buffer, file.mimeType, process);
  } finally {
    aiJobSlots.release();
  }
}

// Live AI worker counts per process, for the dashboard (getProcessesStatus). Module-level
// because a process's queue can be driven by either a webhook sweep or "Organize now".
const workerCounts = new Map(); // processId → workers currently busy on it

function bumpWorkers(processId, delta) {
  const next = (workerCounts.get(processId) ?? 0) + delta;
  if (next > 0) workerCounts.set(processId, next);
  else workerCounts.delete(processId);
}

/** Last write wins: a file appearing twice in one batch is dispatched once. */
function dedupeById(files) {
  return [...new Map(files.map((file) => [file.id, file])).values()];
}

/**
 * Runs one process's file queue through a worker pool sized to the plan's
 * aiPerProcess. Callers run different processes' queues concurrently
 * (Promise.all); this is the per-process manager that keeps one process's own
 * workers from over-running its cap.
 */
async function runProcessQueue(userId, process, files, ctx) {
  const limit = Math.max(1, ctx.plan.aiPerProcess ?? 1);
  return mapWithConcurrency(files, limit, async (file) => {
    bumpWorkers(process.id, 1);
    try {
      return await processFile(userId, file, process, ctx);
    } finally {
      bumpWorkers(process.id, -1);
    }
  });
}

async function processFile(userId, file, process, ctx) {
  if (ctx.credits <= 0) return "blocked";
  // Reserved synchronously, before any await: JS runs this function up to its first
  // await without interruption, so this check-and-decrement can't race another
  // concurrent worker's. Released below for every outcome that isn't actually charged.
  ctx.credits -= 1;

  const claim = await processed.claimFile(userId, file.id, file.name, process.id);
  if (!claim) {
    ctx.credits += 1;
    return "skipped";
  }

  try {
    if (Number(file.size) > env.gemini.maxImageBytes) {
      throw new Error(tooLargeMessage(Number(file.size)));
    }
    // A view-only image can't be renamed or moved; find out before paying for a Gemini call.
    if (file.capabilities?.canRename === false) {
      throw new Error("DriveTag can only view this image, so it can't rename or move it. Ask for Editor access to the Raw folder.");
    }

    const result = await classifyFile(userId, file, process);
    const destination = resolveDestination(process, result.destination, ctx);

    const newName = renderFileName(
      process.rename_template,
      {
        destination: destination.name,
        subject: result.subject,
        style: result.style,
        genre: result.genre,
        date: fileDateString(file, process.timezone),
        original: file.name,
        process: process.name,
        tags: Object.fromEntries(result.fields.map((field) => [field.key, field.value])),
      },
      { originalName: file.name, mimeType: file.mimeType },
    );

    // A run slow enough to be declared stale may have been taken over; the new owner moves the file.
    if (!(await processed.holdsClaim(userId, file.id, claim))) {
      ctx.credits += 1; // the new owner charges for this file, not us
      logger.warn("Claim taken over before rename; leaving the file to its new owner", { userId, fileId: file.id });
      return "skipped";
    }

    try {
      await renameAndMove(userId, file.id, {
        name: newName,
        addParent: destination.folder_id,
        removeParent: process.raw_folder_id,
      });
    } catch (err) {
      throw readableMoveError(err, destination);
    }

    // genre/subject/style stay top-level so older activity rows and clients read the same shape.
    const tags = { genre: result.genre, subject: result.subject, style: result.style, fields: result.fields };
    const bucket = await processed.completeFile(
      userId,
      file.id,
      claim,
      { newName, tags, destinationId: destination.id, destinationName: destination.name },
      ctx.limits,
    );

    if (!bucket) {
      ctx.credits += 1; // nothing was charged; release the reservation
      logger.warn("Claim lost before recording the result", { userId, fileId: file.id, newName });
    } else if (bucket === "overage") {
      // Only reachable when two backend instances overlap mid-deploy: the local count
      // and the database have drifted apart. Stop this run from reserving any more.
      ctx.credits = 0;
    }
    // Otherwise the reservation taken at the top of this call is exactly what was charged.
    // Custom tag values can hold client names; log only where the file went.
    logger.info("File tagged and moved", {
      userId,
      fileId: file.id,
      processId: process.id,
      destination: destination.name,
      matched: result.matched,
      bucket,
    });
    return "completed";
  } catch (err) {
    ctx.credits += 1; // failures are never charged; release the reservation
    if (!(await processed.recordFailure(userId, file.id, claim, err.message))) {
      logger.warn("Claim lost before recording the failure", { userId, fileId: file.id });
    }
    logger.error("File processing failed", { userId, fileId: file.id, processId: process.id, reason: err.message });
    return "failed";
  }
}

/**
 * Skips the changes feed ahead to "now" without listing it. Used when nothing
 * could be processed anyway (no credits, no active processes): images that
 * arrived meanwhile stay in their Raw folders and wait for "Organize now",
 * instead of every later Drive change re-reading an ever-growing backlog.
 */
async function fastForward(channel, reason) {
  const token = await getStartPageToken(channel.user_id);
  await channels.updatePageToken(channel.channel_id, token);
  logger.info("Changes feed fast-forwarded", { userId: channel.user_id, reason });
}

/** This page's matched, per-process-deduplicated files, grouped by the process whose manager runs them. */
function groupChangesByProcess(changes, ctx) {
  const byProcess = new Map(); // process → Map(fileId → file)
  for (const change of changes) {
    if (change.removed) continue;
    const process = matchProcess(change.file, ctx);
    if (!process) continue;
    let files = byProcess.get(process);
    if (!files) byProcess.set(process, (files = new Map()));
    files.set(change.file.id, change.file);
  }
  return [...byProcess].map(([process, files]) => [process, [...files.values()]]);
}

async function sweepChanges(channel) {
  const userId = channel.user_id;
  const ctx = await loadSweepContext(userId);
  if (!ctx) return;

  if (ctx.byRaw.size === 0) return fastForward(channel, "no active work processes");
  if (ctx.credits <= 0) return fastForward(channel, "out of image credits");

  let pageToken = channel.page_token;
  while (pageToken) {
    const page = await listChanges(userId, pageToken);

    // Each matched process gets its own worker pool; different processes' pools run
    // concurrently with each other (mapWithConcurrency caps one process's own pool).
    const queues = groupChangesByProcess(page.changes ?? [], ctx);
    const outcomes = (await Promise.all(queues.map(([process, files]) => runProcessQueue(userId, process, files, ctx)))).flat();

    if (outcomes.includes("blocked")) return fastForward(channel, "ran out of image credits mid-sweep");

    if (page.nextPageToken) {
      pageToken = page.nextPageToken;
    } else {
      await channels.updatePageToken(channel.channel_id, page.newStartPageToken);
      break;
    }
  }
}

/** Runs the sweeps that notifications asked for while the user's slot was busy. */
async function runRequestedReruns(userId) {
  // Each pass consumes the flag first, so a rerun that keeps failing can't spin: only a new notification re-arms it.
  while (rerunRequested.delete(userId)) {
    try {
      // Re-read: the finished sweep advanced the page token (or the watch was paused).
      const channel = await channels.getChannelForUser(userId);
      if (!channel) return;
      const ran = await singleFlight(userId, { kind: "sweep", processId: null }, () => sweepChanges(channel));
      if (!ran) {
        rerunRequested.add(userId); // whoever holds the slot drains it when they finish
        return;
      }
    } catch (err) {
      logger.error("Queued sweep failed", { userId, reason: err.message });
    }
  }
}

/**
 * Runs work in the user's slot, then drains queued reruns — also when the work
 * threw, so notifications that arrived during a failed run aren't lost. A busy
 * slot queues a rerun instead; its holder drains it.
 */
async function runInSlot(userId, state, work) {
  let ran;
  try {
    ran = await singleFlight(userId, state, work);
  } catch (err) {
    runRequestedReruns(userId).catch(() => {});
    throw err;
  }
  if (ran) await runRequestedReruns(userId);
  return ran;
}

/**
 * Loop B: walk the user's changes feed from the stored page token, sort any
 * new images in active processes' Raw folders, then persist the advanced
 * token. Driven by Drive webhooks, or by the auto-sync poller for
 * polling-mode channels.
 */
export async function processNotification(channel) {
  const userId = channel.user_id;
  const ran = await runInSlot(userId, { kind: "sweep", processId: null }, () => sweepChanges(channel));
  if (!ran) rerunRequested.add(userId);
}

/**
 * "Organize now": sort images already sitting in Raw folders, which the changes
 * feed never reports because they arrived before the watch started (or while
 * the user was out of credits). One process, or every active one.
 */
export async function processRawFolder(userId, { processId = null, retryFailed = false } = {}) {
  const summary = { found: 0, completed: 0, failed: 0, skipped: 0, blocked: 0 };

  // Callers that must know the slot is theirs rely on this reserving it synchronously: an async
  // function runs up to its first await, and singleFlight claims the slot before awaiting anything.
  const ran = await runInSlot(userId, { kind: "organize", processId }, async () => {
    const ctx = await loadSweepContext(userId);
    if (!ctx) return;

    const targets = ctx.processes.filter((process) => ctx.runnableIds.has(process.id) && (!processId || process.id === processId));
    const queues = [];
    for (const process of targets) {
      const files = dedupeById(await listImagesInFolder(userId, process.raw_folder_id, SUPPORTED_MIME_TYPES));
      summary.found += files.length;
      if (retryFailed) await processed.releaseFailed(userId, files.map((file) => file.id));
      queues.push([process, files]);
    }

    // Each process's queue runs through its own worker pool; different processes run concurrently.
    const outcomes = (await Promise.all(queues.map(([process, files]) => runProcessQueue(userId, process, files, ctx)))).flat();
    for (const outcome of outcomes) summary[outcome] += 1;
    logger.info("Raw folders organized", { userId, processId, ...summary });
  });

  if (!ran) logger.warn("Organize now didn't run: the user's sweep slot was busy", { userId, processId });
  return { ran, ...summary };
}

// ---------------------------------------------------------------- status

const STATUS_TTL_MS = 20_000;
const STATUS_CONCURRENCY = 4;
const statusCache = new Map(); // `${userId}:${processId}:${rawFolderId}` → { at, value }
// Bumped whenever a sweep or organize ends, so a count read while it was still running can't be cached afterwards.
const statusGeneration = new Map(); // userId → number

function invalidateStatusCache(userId) {
  statusGeneration.set(userId, (statusGeneration.get(userId) ?? 0) + 1);
  for (const key of statusCache.keys()) {
    if (key.startsWith(`${userId}:`)) statusCache.delete(key);
  }
}

/** What's in one Raw folder right now, split by whether DriveTag has touched each file. */
async function rawFolderCounts(userId, rawFolderId) {
  const files = await listImagesInFolder(userId, rawFolderId, SUPPORTED_MIME_TYPES);
  const statuses = await processed.getStatuses(userId, files.map((file) => file.id));

  const counts = { waiting: 0, processing: 0, failed: 0, total: files.length };
  const now = Date.now();
  for (const file of files) {
    const row = statuses.get(file.id);
    if (!row) counts.waiting += 1;
    // An orphaned claim is effectively failed: "Retry" frees it (processed.releaseFailed).
    else if (row.status === "failed" || processed.isStaleClaim(row, now)) counts.failed += 1;
    else if (row.status === "processing") counts.processing += 1;
    // A "completed" file still listed here is mid-move out of Raw.
  }
  return counts;
}

async function mapWithConcurrency(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Per-process Raw folder counts for the dashboard. Folders not being organized
 * are cached briefly, since the dashboard polls every few seconds while busy.
 */
export async function getProcessesStatus(userId, processes) {
  const state = sweepState(userId);
  const generation = statusGeneration.get(userId) ?? 0;
  const now = Date.now();

  const entries = await mapWithConcurrency(processes, STATUS_CONCURRENCY, async (process) => {
    // Keyed by Raw folder too, so editing a process's Raw folder never serves the old folder's counts.
    const key = `${userId}:${process.id}:${process.raw_folder_id}`;
    const cached = statusCache.get(key);
    const busyHere = Boolean(state) && (state.processId === process.id || state.processId === null);
    if (cached && !busyHere && now - cached.at < STATUS_TTL_MS) return [process.id, cached.value];

    try {
      const value = await rawFolderCounts(userId, process.raw_folder_id);
      // Mid-run counts go stale the moment the run ends; only cache counts nothing was changing underneath.
      if (!busyHere && !isSweeping(userId) && (statusGeneration.get(userId) ?? 0) === generation) {
        statusCache.set(key, { at: now, value });
      }
      return [process.id, value];
    } catch (err) {
      logger.warn("Could not read a Raw folder for status", { userId, processId: process.id, reason: err.message });
      return [process.id, { error: "DriveTag couldn't open this Raw folder. It may have been deleted or unshared." }];
    }
  });

  // Only non-zero entries, per the dashboard contract (absent = 0).
  const workers = {};
  for (const process of processes) {
    const count = workerCounts.get(process.id);
    if (count) workers[process.id] = count;
  }

  return {
    syncing: Boolean(state),
    kind: state?.kind ?? null,
    activeProcessId: state?.processId ?? null,
    statuses: Object.fromEntries(entries),
    workers,
  };
}

/** Legacy single-folder shape ({waiting, processing, failed, total, syncing}) summed over active processes. */
export async function getRawFolderStatus(userId, processes) {
  const { syncing, statuses } = await getProcessesStatus(userId, processes);
  const totals = { waiting: 0, processing: 0, failed: 0, total: 0 };
  for (const counts of Object.values(statuses)) {
    if (counts.error) continue;
    for (const key of Object.keys(totals)) totals[key] += counts[key];
  }
  return { ...totals, syncing };
}
