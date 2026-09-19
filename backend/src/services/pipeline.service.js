import { env } from "../config/env.js";
import { FILE_LIMITS } from "../config/plans.js";
import { classifyImage, classifyDocument } from "./gemini.service.js";
import { prepareDocument, isStillBeingEdited } from "./document.service.js";
import { getFileBuffer, getFileMetadata, getStartPageToken, listChanges, listFilesInFolder, renameAndMove } from "./drive.service.js";
import { loadEntitlement, rankProcesses } from "./entitlement.service.js";
import { listProcesses } from "../repositories/workProcess.repo.js";
import * as channels from "../repositories/driveChannel.repo.js";
import * as processed from "../repositories/processedFile.repo.js";
import { renderFileName, MIME_TYPES_BY_KIND } from "../utils/filename.js";
import { fileDateString } from "../utils/fileDate.js";
import { logger } from "../utils/logger.js";

/** A row's kind, defaulting to "image" for rows saved before migration 0004 added the column. */
const kindOf = (process) => process.kind ?? "image";

/** The MIME types a process's kind sorts; falls back to images for an unrecognized kind (fail closed). */
const mimeTypesForKind = (kind) => MIME_TYPES_BY_KIND[kind] ?? MIME_TYPES_BY_KIND.image;

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
    userId,
    // Reserved from per-file, so this run gets its own copy rather than sharing entitlement's.
    credits: { ...entitlement.credits },
    processes: ranked,
    runnableIds: new Set(runnable.map((process) => process.id)),
    byRaw: new Map(runnable.map((process) => [process.raw_folder_id, process])),
    rawFolderIds: new Set(processes.map((process) => process.raw_folder_id)),
  };
}

// ---------------------------------------------------------------- deferred (grace-window) files

// A Google Doc/Sheet/Slides file skipped because it was still inside the editing grace window is
// never claimed, so the changes feed won't report it again once the page token moves past it —
// without this, nothing would pick it up until someone clicks "Organize now". userId → Map(fileId
// → { processId, dueAt }).
//
// ponytail: single-instance, in-memory — lost on restart or redeploy, and capped per user below.
// "Organize now" is the fallback for anything dropped or never recorded. A DB-backed queue is the
// upgrade path if that ever actually bites.
const deferred = new Map();
const DEFERRED_CAP_PER_USER = 500;
// On top of the plan's grace window, so a recheck landing right on the boundary doesn't find
// Drive still reporting the same modifiedTime.
const DEFER_BUFFER_MS = 30_000;
// Backoff before retrying a deferred run whose slot was busy (an ordinary sweep or "Organize now"
// was already in progress) — short enough the file isn't stuck long, without spinning every tick.
const DEFERRED_RETRY_MS = 30_000;

const deferredTimers = new Map(); // userId → { timer, dueAt }

function graceDueAt(file) {
  const modified = Date.parse(file?.modifiedTime ?? "");
  const base = Number.isNaN(modified) ? Date.now() : modified;
  return base + FILE_LIMITS.editingGraceMinutes * 60_000 + DEFER_BUFFER_MS;
}

/** Records (or refreshes) a file the sweep or "Organize now" just skipped for the editing grace window. */
function deferGraceFile(userId, process, file) {
  let map = deferred.get(userId);
  if (!map) deferred.set(userId, (map = new Map()));
  if (!map.has(file.id) && map.size >= DEFERRED_CAP_PER_USER) {
    logger.warn("Deferred-file cap reached; file stays waiting for Organize now", { userId, fileId: file.id });
    return;
  }
  map.set(file.id, { processId: process.id, dueAt: graceDueAt(file) });
  scheduleDeferredTimer(userId);
}

/**
 * One setTimeout per user for the earliest dueAt in their map. Only replaced when an earlier
 * dueAt arrives — a later entry just rides along with whatever's already scheduled. unref()d so a
 * pending deferral never keeps the process alive; cleared for good by forgetUser.
 */
function scheduleDeferredTimer(userId) {
  const map = deferred.get(userId);
  if (!map || map.size === 0) return;

  let earliest = Infinity;
  for (const entry of map.values()) earliest = Math.min(earliest, entry.dueAt);

  const existing = deferredTimers.get(userId);
  if (existing && existing.dueAt <= earliest) return; // already covers this

  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => fireDeferredTimer(userId), Math.max(0, earliest - Date.now()));
  timer.unref?.();
  deferredTimers.set(userId, { timer, dueAt: earliest });
}

/** Runs the due deferred files inside the user's normal sweep slot; a busy slot reschedules rather than dropping the work. */
async function fireDeferredTimer(userId) {
  deferredTimers.delete(userId);
  const ran = await runInSlot(userId, { kind: "sweep", processId: null }, () => processDeferredFiles(userId));
  if (!ran) {
    const timer = setTimeout(() => fireDeferredTimer(userId), DEFERRED_RETRY_MS);
    timer.unref?.();
    deferredTimers.set(userId, { timer, dueAt: Date.now() + DEFERRED_RETRY_MS });
  }
}

/**
 * Rechecks every due deferred file and either drops it (gone, trashed, moved out of Raw, or its
 * process no longer runnable), re-defers it (still being edited), or runs it through the normal
 * per-process queue — the same claim, credit, naming and charging path as any other file. Exported
 * so both the per-user timer and the end of every changes sweep can call it directly.
 */
export async function processDeferredFiles(userId) {
  const map = deferred.get(userId);
  if (!map || map.size === 0) return;

  const ctx = await loadSweepContext(userId);
  if (!ctx) return; // no subscription row; leave entries for next time

  const now = Date.now();
  const due = [...map.entries()].filter(([, entry]) => entry.dueAt <= now);
  if (due.length === 0) return scheduleDeferredTimer(userId); // fired early somehow; reschedule for the real earliest

  const processesById = new Map(ctx.processes.map((process) => [process.id, process]));
  const queues = new Map(); // process → file[]

  for (const [fileId, entry] of due) {
    map.delete(fileId); // re-added below only if it's still being edited

    const process = processesById.get(entry.processId);
    if (!process || !ctx.runnableIds.has(process.id)) continue; // process gone, disabled or locked

    let fresh;
    try {
      fresh = await getFileMetadata(userId, fileId);
    } catch (err) {
      // A Drive hiccup mustn't lose the file from the queue — that's the very gap this queue closes.
      map.set(fileId, { processId: process.id, dueAt: now + DEFERRED_RETRY_MS });
      logger.warn("Could not recheck a deferred file; will retry", { userId, fileId, reason: err.message });
      continue;
    }
    if (!fresh || fresh.trashed) continue; // gone or trashed
    if (!(fresh.parents ?? []).includes(process.raw_folder_id)) continue; // moved out of Raw since

    if (isStillBeingEdited(fresh)) {
      map.set(fileId, { processId: process.id, dueAt: graceDueAt(fresh) });
      continue;
    }

    let files = queues.get(process);
    if (!files) queues.set(process, (files = []));
    files.push(fresh);
  }

  // A file that comes back "blocked" (no credits left) was already removed above and isn't
  // re-added here, so it just stays visible as "waiting" until "Organize now" is clicked.
  if (queues.size > 0) {
    await Promise.all([...queues].map(([process, files]) => runProcessQueue(userId, process, files, ctx)));
  }

  if (map.size === 0) clearDeferredTimer(userId, { andMap: true });
  else scheduleDeferredTimer(userId);
}

/** Cancels a user's pending timer, and optionally their deferred map too. */
function clearDeferredTimer(userId, { andMap = false } = {}) {
  if (andMap) deferred.delete(userId);
  const existing = deferredTimers.get(userId);
  if (existing) clearTimeout(existing.timer);
  deferredTimers.delete(userId);
}

/** Drops a user's deferred files and cancels their pending timer. Call when their data is gone (account deletion). */
export function forgetUser(userId) {
  clearDeferredTimer(userId, { andMap: true });
}

/**
 * The active process whose Raw folder directly contains this file, if the file is one its kind
 * sorts. A file of the wrong kind for its Raw folder's process is left alone entirely — never
 * claimed, never counted as blocked. A Google-native file still inside the editing grace window
 * is treated the same way here (skipped, so it stays "waiting" — see rawFolderCounts), but is also
 * recorded in the deferred queue so it's picked up automatically once it's past the grace window,
 * instead of waiting for "Organize now" (see deferGraceFile).
 */
function matchProcess(file, ctx) {
  if (!file || file.trashed) return null;
  for (const parent of file.parents ?? []) {
    const process = ctx.byRaw.get(parent);
    if (!process) continue;
    if (!mimeTypesForKind(kindOf(process)).includes(file.mimeType)) return null;
    if (isStillBeingEdited(file)) {
      deferGraceFile(ctx.userId, process, file);
      return null;
    }
    return process;
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

function readOnlyMessage(kind) {
  const noun = kind === "document" ? "document" : "image";
  return `DriveTag can only view this ${noun}, so it can't rename or move it. Ask for Editor access to the Raw folder.`;
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

/** Downloads and classifies one image. The buffer only exists between acquiring and releasing a global slot (Zero-Retention). */
async function classifyFile(userId, file, process) {
  await aiJobSlots.acquire();
  try {
    const buffer = await getFileBuffer(userId, file.id);
    return await classifyImage(buffer, file.mimeType, process);
  } finally {
    aiJobSlots.release();
  }
}

/** Reads and classifies one document. Its bytes/text only exist between acquiring and releasing the same global slot (Zero-Retention). */
async function classifyDocumentFile(userId, file, process) {
  await aiJobSlots.acquire();
  try {
    const content = await prepareDocument(userId, file);
    return await classifyDocument(content, process);
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

/** Values for {tag:<key>} plus every image-only naming token. */
function imageNamingValues(file, process, destination, result) {
  return {
    destination: destination.name,
    subject: result.subject,
    style: result.style,
    genre: result.genre,
    date: fileDateString(file, process.timezone),
    original: file.name,
    process: process.name,
    tags: Object.fromEntries(result.fields.map((field) => [field.key, field.value])),
  };
}

const DOCUMENT_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Values for {tag:<key>} plus every document-only naming token. docdate falls back to "" unless it's a real date. */
function documentNamingValues(file, process, destination, result) {
  return {
    destination: destination.name,
    type: result.type,
    topic: result.topic,
    organization: result.organization,
    docdate: DOCUMENT_DATE.test(result.documentDate ?? "") ? result.documentDate : "",
    date: fileDateString(file, process.timezone),
    original: file.name,
    process: process.name,
    tags: Object.fromEntries(result.fields.map((field) => [field.key, field.value])),
  };
}

// genre/subject/style, and type/topic/organization/document_date, stay top-level so activity rows and
// clients can read them without knowing which kind produced them.
const imageTags = (result) => ({ genre: result.genre, subject: result.subject, style: result.style, fields: result.fields });
const documentTags = (result) => ({
  type: result.type,
  topic: result.topic,
  organization: result.organization,
  document_date: result.documentDate,
  fields: result.fields,
});

async function processFile(userId, file, process, ctx) {
  const kind = kindOf(process);
  if ((ctx.credits[kind] ?? 0) <= 0) return "blocked";
  // Reserved synchronously, before any await: JS runs this function up to its first
  // await without interruption, so this check-and-decrement can't race another
  // concurrent worker's. Released below for every outcome that isn't actually charged.
  ctx.credits[kind] -= 1;

  const claim = await processed.claimFile(userId, file.id, file.name, process.id, kind);
  if (!claim) {
    ctx.credits[kind] += 1;
    return "skipped";
  }

  try {
    let result;
    if (kind === "document") {
      // A view-only document can't be renamed or moved; find out before paying for an AI call.
      if (file.capabilities?.canRename === false) throw new Error(readOnlyMessage(kind));
      result = await classifyDocumentFile(userId, file, process);
    } else {
      if (Number(file.size) > env.gemini.maxImageBytes) {
        throw new Error(tooLargeMessage(Number(file.size)));
      }
      // A view-only image can't be renamed or moved; find out before paying for a Gemini call.
      if (file.capabilities?.canRename === false) throw new Error(readOnlyMessage(kind));
      result = await classifyFile(userId, file, process);
    }

    const destination = resolveDestination(process, result.destination, ctx);
    const values =
      kind === "document" ? documentNamingValues(file, process, destination, result) : imageNamingValues(file, process, destination, result);

    const newName = renderFileName(process.rename_template, values, { originalName: file.name, mimeType: file.mimeType, kind });

    // A run slow enough to be declared stale may have been taken over; the new owner moves the file.
    if (!(await processed.holdsClaim(userId, file.id, claim))) {
      ctx.credits[kind] += 1; // the new owner charges for this file, not us
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

    const tags = kind === "document" ? documentTags(result) : imageTags(result);
    const limits = ctx.limits[kind] ?? ctx.limits.image;
    const bucket = await processed.completeFile(
      userId,
      file.id,
      claim,
      { newName, tags, destinationId: destination.id, destinationName: destination.name },
      { kind, freeLimit: limits.freeLimit, monthlyLimit: limits.monthlyLimit },
    );

    if (!bucket) {
      ctx.credits[kind] += 1; // nothing was charged; release the reservation
      logger.warn("Claim lost before recording the result", { userId, fileId: file.id, newName });
    } else if (bucket === "overage") {
      // Only reachable when two backend instances overlap mid-deploy: the local count
      // and the database have drifted apart. Stop this run from reserving any more of this kind.
      ctx.credits[kind] = 0;
    }
    // Otherwise the reservation taken at the top of this call is exactly what was charged.
    // Custom tag values can hold client names; log only where the file went.
    logger.info("File tagged and moved", {
      userId,
      fileId: file.id,
      processId: process.id,
      kind,
      destination: destination.name,
      matched: result.matched,
      bucket,
    });
    return "completed";
  } catch (err) {
    ctx.credits[kind] += 1; // failures are never charged; release the reservation
    if (!(await processed.recordFailure(userId, file.id, claim, err.message))) {
      logger.warn("Claim lost before recording the failure", { userId, fileId: file.id });
    }
    logger.error("File processing failed", { userId, fileId: file.id, processId: process.id, kind, reason: err.message });
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

/** The kinds this run could actually process — i.e. that at least one runnable process sorts. */
function kindsInPlay(ctx) {
  const kinds = new Set();
  for (const process of ctx.byRaw.values()) kinds.add(kindOf(process));
  return kinds;
}

/**
 * True once every kind that has a runnable process is out of credits. A run with, say, an image
 * process out of credits and a document process that still has some is NOT exhausted: image files
 * come back "blocked" and wait for "Organize now", while document files keep sorting.
 */
function allKindsExhausted(ctx) {
  for (const kind of kindsInPlay(ctx)) {
    if ((ctx.credits[kind] ?? 0) > 0) return false;
  }
  return true;
}

async function sweepChanges(channel) {
  const userId = channel.user_id;
  try {
    const ctx = await loadSweepContext(userId);
    if (!ctx) return;

    if (ctx.byRaw.size === 0) {
      await fastForward(channel, "no active work processes");
      return;
    }
    if (allKindsExhausted(ctx)) {
      await fastForward(channel, "out of credits for every active process kind");
      return;
    }

    let pageToken = channel.page_token;
    while (pageToken) {
      const page = await listChanges(userId, pageToken);

      // Each matched process gets its own worker pool; different processes' pools run
      // concurrently with each other (mapWithConcurrency caps one process's own pool).
      const queues = groupChangesByProcess(page.changes ?? [], ctx);
      await Promise.all(queues.map(([process, files]) => runProcessQueue(userId, process, files, ctx)));

      if (allKindsExhausted(ctx)) {
        await fastForward(channel, "ran out of credits for every process kind mid-sweep");
        return;
      }

      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
      } else {
        await channels.updatePageToken(channel.channel_id, page.newStartPageToken);
        break;
      }
    }
  } finally {
    // Cheap when nothing's deferred (a Map lookup); runs any deferred files that are due even if their
    // timer hasn't fired yet. Its own failure is logged, never allowed to mask the sweep's result or error.
    await processDeferredFiles(userId).catch((err) =>
      logger.error("Deferred-file recheck failed", { userId, reason: err.message }),
    );
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
      const rawFiles = dedupeById(await listFilesInFolder(userId, process.raw_folder_id, mimeTypesForKind(kindOf(process))));
      // A Google-native file still inside the editing grace window is left alone here too: it stays
      // in Raw, counts as "waiting" below, and is deferred the same way a sweep would (deferGraceFile)
      // so it's picked up automatically once it's past the window, without needing another click.
      const files = rawFiles.filter((file) => {
        if (!isStillBeingEdited(file)) return true;
        deferGraceFile(userId, process, file);
        return false;
      });
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

/**
 * What's in one process's Raw folder right now, split by whether DriveTag has touched each file.
 * A Google-native file inside the editing grace window has no processed_files row (matchProcess
 * never let it be claimed), so it naturally counts as "waiting" here, same as any other new file.
 */
async function rawFolderCounts(userId, process) {
  const files = await listFilesInFolder(userId, process.raw_folder_id, mimeTypesForKind(kindOf(process)));
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
      const value = await rawFolderCounts(userId, process);
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
