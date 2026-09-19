import { PLANS } from "../config/plans.js";
import { ensureChildFolder, getFolder } from "./drive.service.js";
import { loadEntitlement, rankProcesses } from "./entitlement.service.js";
import { stopWatch } from "./driveWatch.service.js";
import * as repo from "../repositories/workProcess.repo.js";
import { ensureSubscription } from "../repositories/subscription.repo.js";
import { HttpError } from "../utils/httpError.js";
import { folderConflicts, validateProcessInput } from "../utils/processValidation.js";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function planLimitMessage(plan) {
  const count = plan.maxProcesses === 1 ? "1 work process" : `${plan.maxProcesses} work processes`;
  return `Your ${plan.label} plan includes ${count}. Upgrade your plan to add more.`;
}

async function entitlementFor(userId) {
  let entitlement = await loadEntitlement(userId);
  if (!entitlement) {
    // Users who connected Drive before plans existed may lack a row; give them Free.
    await ensureSubscription(userId);
    entitlement = await loadEntitlement(userId);
  }
  return entitlement;
}

/** The user's processes marked locked/active against their plan, plus the plan's process limit. */
export async function listForUser(userId) {
  const [processes, entitlement] = await Promise.all([repo.listProcesses(userId), loadEntitlement(userId)]);
  const plan = entitlement?.plan ?? PLANS.free;
  return {
    processes: rankProcesses(processes, plan),
    limit: { used: processes.length, max: plan.maxProcesses, planId: plan.id },
    entitlement,
  };
}

export async function getForUser(userId, processId) {
  const { processes } = await listForUser(userId);
  const process = processes.find((candidate) => candidate.id === processId);
  if (!process) throw new HttpError(404, "That work process doesn't exist.", { code: "process_not_found" });
  return process;
}

/** Checks a folder the user picked is usable; returns a validation error or null. */
function folderProblem(folder, field, { needsAddChildren = false, needsRemoveChildren = false }) {
  if (!folder || folder.mimeType !== FOLDER_MIME_TYPE || folder.trashed) {
    return { field, message: "That folder no longer exists in Google Drive." };
  }
  if (folder.driveId) {
    return { field, message: "Shared drive folders aren't supported yet. Pick a folder in My Drive." };
  }
  if (needsAddChildren && folder.capabilities?.canAddChildren === false) {
    return { field, message: "DriveTag can't add files to that folder. Pick one you can edit." };
  }
  // A view-only Raw folder would send every file to the AI and then fail the move.
  if (needsRemoveChildren && folder.capabilities?.canRemoveChildren === false) {
    return { field, message: "DriveTag can't move files out of that folder. Ask for Editor access, or pick one you can edit." };
  }
  return null;
}

async function fetchFolder(userId, folderId) {
  try {
    return await getFolder(userId, folderId);
  } catch (err) {
    // Deleted, or no longer shared with this user: either way it can't be used.
    if ([403, 404].includes(Number(err?.status ?? err?.code))) return null;
    throw err;
  }
}

function invalid(details) {
  return new HttpError(400, details[0]?.message ?? "Some settings need fixing.", { code: "invalid_process", details });
}

/**
 * Creates (processId null) or updates a work process. Validates the input,
 * checks every folder in Drive, creates "create in Master" destinations, and
 * rejects folder layouts that would loop files between processes.
 */
export async function saveForUser(userId, processId, body) {
  const [processes, entitlement] = await Promise.all([repo.listProcesses(userId), entitlementFor(userId)]);
  const plan = entitlement?.plan ?? PLANS.free;
  const ranked = rankProcesses(processes, plan);
  const current = processId ? ranked.find((process) => process.id === processId) : null;

  if (processId && !current) throw new HttpError(404, "That work process doesn't exist.", { code: "process_not_found" });
  if (!processId && processes.length >= plan.maxProcesses) {
    throw new HttpError(402, planLimitMessage(plan), { code: "process_limit_reached" });
  }

  // current is null on create, so current?.kind is undefined — validateProcessInput reads that as "create".
  const { errors, value } = validateProcessInput(body, { existingKind: current?.kind });
  if (errors.length > 0) throw invalid(errors);

  // An id this process doesn't have (deleted in another tab, or not ours) just becomes a new destination.
  // save_work_process only ever updates rows of this process, so another process's destination can't be taken over.
  const existingIds = new Set((current?.destinations ?? []).map((destination) => destination.id));
  for (const destination of value.destinations) {
    if (destination.id && !existingIds.has(destination.id)) destination.id = null;
  }

  // ---- folders the user picked
  const pickedIds = [
    ...new Set(
      [value.rawFolderId, value.masterFolderId, ...value.destinations.map((destination) => destination.folder.id)].filter(Boolean),
    ),
  ];
  const fetched = await Promise.all(pickedIds.map((id) => fetchFolder(userId, id)));
  const folders = new Map(pickedIds.map((id, index) => [id, fetched[index]]));

  const problems = [
    folderProblem(folders.get(value.rawFolderId), "rawFolderId", { needsRemoveChildren: true }),
    folderProblem(folders.get(value.masterFolderId), "masterFolderId", { needsAddChildren: true }),
    ...value.destinations.map((destination, index) =>
      destination.folder.mode === "existing"
        ? folderProblem(folders.get(destination.folder.id), `destinations[${index}].folder`, { needsAddChildren: true })
        : null,
    ),
  ].filter(Boolean);
  if (problems.length > 0) throw invalid(problems);

  const others = processes.filter((process) => process.id !== processId);
  const knownDestinationFolders = value.destinations
    .map((destination, index) => ({
      index,
      folderId: destination.folder.mode === "existing" ? destination.folder.id : destination.folder.mode === "master" ? value.masterFolderId : null,
    }))
    .filter((entry) => entry.folderId);
  const conflicts = folderConflicts(
    { rawFolderId: value.rawFolderId, masterFolderId: value.masterFolderId, destinations: knownDestinationFolders },
    others,
  );
  if (conflicts.length > 0) throw invalid(conflicts);

  // ---- "create in Master": reuse a same-named subfolder if one exists
  const master = folders.get(value.masterFolderId);
  const destinationRows = [];
  for (const [index, destination] of value.destinations.entries()) {
    let folder;
    if (destination.folder.mode === "existing") folder = folders.get(destination.folder.id);
    else if (destination.folder.mode === "master") folder = master;
    else folder = await ensureChildFolder(userId, master.id, destination.name);

    if (destination.folder.mode === "create") {
      const created = folderConflicts(
        { rawFolderId: value.rawFolderId, masterFolderId: value.masterFolderId, destinations: [{ index, folderId: folder.id }] },
        others,
      ).filter((conflict) => conflict.field.startsWith("destinations"));
      if (created.length > 0) throw invalid(created);
    }

    destinationRows.push({
      id: destination.id,
      name: destination.name,
      description: destination.description,
      folder_id: folder.id,
      folder_name: folder.name,
      is_fallback: destination.isFallback,
    });
  }

  // A locked process keeps its switch as it was; the plan decides whether it runs.
  const enabled = current?.locked ? current.enabled : value.enabled ?? current?.enabled ?? true;

  const processRow = {
    kind: value.kind,
    name: value.name,
    raw_folder_id: value.rawFolderId,
    raw_folder_name: folders.get(value.rawFolderId).name,
    master_folder_id: value.masterFolderId,
    master_folder_name: master.name,
    rename_template: value.renameTemplate,
    instructions: value.instructions,
    tag_fields: value.tagFields,
    timezone: value.timezone,
    enabled,
  };

  let savedId;
  try {
    savedId = await repo.saveProcess(userId, processId, processRow, destinationRows, plan.maxProcesses);
  } catch (err) {
    // save_work_process's own immutability check, hit only if two requests race between our
    // existingKind check above and this write. workProcess.repo.js's RAISED_CODES doesn't list
    // this code, so err.code won't be set for it — match on the message it wraps instead.
    if (err.code === "process_kind_immutable" || /process_kind_immutable/.test(err.message ?? "")) {
      throw invalid([
        { field: "kind", message: "A process can't switch between images and documents. Create a new process instead." },
      ]);
    }
    switch (err.code) {
      case "process_limit_reached":
        throw new HttpError(402, planLimitMessage(plan), { code: err.code });
      case "process_not_found":
        throw new HttpError(404, "That work process doesn't exist.", { code: err.code });
      case "duplicate_raw_folder":
        throw invalid([{ field: "rawFolderId", message: "Another of your processes already watches that Raw folder." }]);
      case "duplicate_destination_name":
        throw invalid([{ field: "destinations", message: "Two destinations have the same name." }]);
      case "raw_is_master":
        throw invalid([{ field: "masterFolderId", message: "The Master folder has to be different from the Raw folder." }]);
      case "exactly_one_fallback":
        throw invalid([{ field: "destinations", message: "A process needs exactly one Unsorted destination." }]);
      case "duplicate_destination_id":
        throw invalid([{ field: "destinations", message: "The same destination appears twice." }]);
      default:
        throw err;
    }
  }

  return getForUser(userId, savedId);
}

export async function setEnabledForUser(userId, processId, enabled) {
  const process = await getForUser(userId, processId);
  if (enabled && process.locked) {
    throw new HttpError(409, "This process is over your plan's limit. Upgrade or delete another process to turn it on.", {
      code: "process_locked",
    });
  }
  await repo.setEnabled(userId, processId, enabled);
  return getForUser(userId, processId);
}

/** Deleting the last process also stops the Drive watch; there's nothing left to sort for. */
export async function deleteForUser(userId, processId) {
  if (!(await repo.deleteProcess(userId, processId))) {
    throw new HttpError(404, "That work process doesn't exist.", { code: "process_not_found" });
  }
  const remaining = await repo.listProcesses(userId);
  if (remaining.length === 0) await stopWatch(userId);
  return { deleted: true, watchStopped: remaining.length === 0 };
}
