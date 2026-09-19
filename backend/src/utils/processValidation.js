import { PROCESS_LIMITS } from "../config/plans.js";
import { TEMPLATE_TOKENS_BY_KIND, validateTemplate } from "./filename.js";
import { isValidTimeZone } from "./fileDate.js";

const TAG_KEY = /^[a-z][a-z0-9_]{0,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A tag key shares the AI response schema and the template namespace with the process's own
// naming tokens, so it can't reuse one of them. Only the process's own kind is reserved: an image
// process may keep a "type" or "topic" tag (existing ones do), since those names only mean
// something to document processes, and vice versa.
const RESERVED_WORDS = ["tag", "tags", "ext", "unsorted", "fields"];
const RESERVED_TAG_KEYS_BY_KIND = {
  image: new Set([...TEMPLATE_TOKENS_BY_KIND.image, ...RESERVED_WORDS]),
  document: new Set([...TEMPLATE_TOKENS_BY_KIND.document, ...RESERVED_WORDS]),
};
const FOLDER_MODES = new Set(["existing", "create", "master"]);
const KINDS = new Set(["image", "document"]);
const DEFAULT_TEMPLATE_BY_KIND = { image: "{destination}_{subject}", document: "{type}_{organization}_{topic}" };

export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Validates and normalizes a work process from the API body. Pure: folder
 * existence and cross-process folder conflicts are checked by the service
 * once folders are resolved (see folderConflicts).
 *
 * Body: { kind, name, rawFolderId, masterFolderId, renameTemplate, instructions, timezone, enabled,
 *         tagFields: [{ key, label, description }],
 *         destinations: [{ id?, name, description, isFallback, folder: { mode: "existing", id } | { mode: "create" } | { mode: "master" } }] }
 *
 * `existingKind` (from the caller's already-loaded process) tells this function whether it's a
 * create or an update, and is how the "images vs documents" kind is decided:
 * - create (existingKind undefined): `kind` is required and must be "image" or "document".
 * - update (existingKind "image"|"document"): a process's kind never changes. Omitting `kind`
 *   from the body is accepted as "leave it as it is" (the same rule PUT already uses for
 *   `enabled`), because older frontend builds mid-deploy won't send it and the client can't
 *   change it anyway. A `kind` that IS present and differs from existingKind is a 400 on the
 *   `kind` field. save_work_process repeats this check in SQL as a backstop.
 */
export function validateProcessInput(body, { existingKind } = {}) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const input = body && typeof body === "object" ? body : {};
  const L = PROCESS_LIMITS;

  const isCreate = existingKind === undefined;
  const hasKindField = Object.prototype.hasOwnProperty.call(input, "kind");
  let kind;
  if (isCreate) {
    const requestedKind = text(input.kind);
    kind = KINDS.has(requestedKind) ? requestedKind : "image"; // fallback only so later checks (e.g. template) have a kind to validate against
    if (!KINDS.has(requestedKind)) fail("kind", "Choose whether this process sorts images or documents.");
  } else {
    if (hasKindField) {
      const requestedKind = text(input.kind);
      if (requestedKind !== existingKind) {
        fail("kind", "A process can't switch between images and documents. Create a new process instead.");
      }
    }
    kind = existingKind;
  }

  const name = text(input.name);
  if (!name) fail("name", "Give this process a name.");
  else if (name.length > L.nameMax) fail("name", `Keep the name under ${L.nameMax} characters.`);

  const rawFolderId = text(input.rawFolderId);
  const masterFolderId = text(input.masterFolderId);
  if (!rawFolderId) fail("rawFolderId", "Choose the Raw folder DriveTag watches.");
  if (!masterFolderId) fail("masterFolderId", "Choose the Master folder sorted files go into.");
  if (rawFolderId && rawFolderId === masterFolderId) {
    fail("masterFolderId", "The Master folder has to be different from the Raw folder.");
  }

  const instructions = typeof input.instructions === "string" ? input.instructions.trim() : "";
  if (instructions.length > L.instructionsMax) {
    fail("instructions", `Keep instructions under ${L.instructionsMax} characters.`);
  }

  const timezone = isValidTimeZone(input.timezone) ? input.timezone : "UTC";

  // ---- tag fields
  const rawTagFields = input.tagFields ?? [];
  const tagFields = [];
  if (!Array.isArray(rawTagFields)) {
    fail("tagFields", "Tag fields must be a list.");
  } else if (rawTagFields.length > L.maxTagFields) {
    fail("tagFields", `A process can have up to ${L.maxTagFields} tag fields.`);
  } else {
    const seen = new Set();
    rawTagFields.forEach((field, index) => {
      const key = text(field?.key).toLowerCase();
      const label = text(field?.label);
      const description = text(field?.description);
      const at = `tagFields[${index}]`;
      if (!TAG_KEY.test(key)) fail(`${at}.key`, "Use a short key: lowercase letters, numbers and _, starting with a letter.");
      else if (RESERVED_TAG_KEYS_BY_KIND[kind].has(key)) fail(`${at}.key`, `"${key}" is already a built-in token; pick another key.`);
      else if (seen.has(key)) fail(`${at}.key`, `Two tag fields use the key "${key}".`);
      seen.add(key);
      if (!label) fail(`${at}.label`, "Give this tag field a label.");
      else if (label.length > L.tagLabelMax) fail(`${at}.label`, `Keep labels under ${L.tagLabelMax} characters.`);
      if (description.length > L.tagDescriptionMax) {
        fail(`${at}.description`, `Keep descriptions under ${L.tagDescriptionMax} characters.`);
      }
      tagFields.push({ key, label, description });
    });
  }

  const renameTemplate = text(input.renameTemplate) || DEFAULT_TEMPLATE_BY_KIND[kind];
  if (renameTemplate.length > L.templateMax) {
    fail("renameTemplate", `Keep the naming template under ${L.templateMax} characters.`);
  } else {
    for (const message of validateTemplate(renameTemplate, tagFields.map((field) => field.key), kind)) {
      fail("renameTemplate", message);
    }
  }

  // ---- destinations
  const rawDestinations = input.destinations;
  const destinations = [];
  if (!Array.isArray(rawDestinations)) {
    fail("destinations", "Add at least the Unsorted destination.");
  } else {
    const fallbacks = rawDestinations.filter((destination) => destination?.isFallback === true).length;
    if (fallbacks !== 1) fail("destinations", "A process needs exactly one Unsorted destination.");
    if (rawDestinations.length - fallbacks > L.maxDestinations) {
      fail("destinations", `A process can have up to ${L.maxDestinations} destinations besides Unsorted.`);
    }

    const names = new Set();
    const ids = new Set();
    rawDestinations.forEach((destination, index) => {
      const at = `destinations[${index}]`;
      const isFallback = destination?.isFallback === true;
      const destinationName = text(destination?.name);
      const description = text(destination?.description);
      const folder = destination?.folder ?? {};
      const id = destination?.id == null || destination.id === "" ? null : destination.id;

      if (id !== null && !isUuid(id)) fail(`${at}.id`, "Unknown destination.");
      // A repeated id would update one row twice and could leave the process without Unsorted.
      else if (id !== null && ids.has(id)) fail(`${at}.id`, "This destination appears twice.");
      if (id !== null) ids.add(id);
      if (!destinationName) fail(`${at}.name`, "Give this destination a name.");
      else if (destinationName.length > L.nameMax) fail(`${at}.name`, `Keep names under ${L.nameMax} characters.`);
      else if (names.has(destinationName.toLowerCase())) fail(`${at}.name`, `Two destinations are called "${destinationName}".`);
      names.add(destinationName.toLowerCase());
      if (description.length > L.descriptionMax) {
        fail(`${at}.description`, `Keep descriptions under ${L.descriptionMax} characters.`);
      }

      if (!FOLDER_MODES.has(folder.mode)) {
        fail(`${at}.folder`, "Choose a folder or let DriveTag create one.");
      } else if (folder.mode === "existing" && !text(folder.id)) {
        fail(`${at}.folder`, "Choose a folder.");
      } else if (folder.mode === "master" && !isFallback) {
        fail(`${at}.folder`, "Only Unsorted can use the Master folder itself.");
      }

      destinations.push({
        id,
        name: destinationName,
        description,
        isFallback,
        folder: { mode: folder.mode, id: folder.mode === "existing" ? text(folder.id) : null },
      });
    });
  }

  return {
    errors,
    value: {
      kind,
      name,
      rawFolderId,
      masterFolderId,
      renameTemplate,
      instructions,
      timezone,
      enabled: input.enabled === undefined ? undefined : input.enabled === true,
      tagFields,
      destinations,
    },
  };
}

/**
 * Folder relationships that would let files loop between processes, checked
 * against the user's OTHER processes (all of them, including disabled and
 * locked ones) once every destination folder id is known.
 *
 * folders: { rawFolderId, masterFolderId, destinations: [{ index, folderId }] }
 */
export function folderConflicts(folders, otherProcesses) {
  const errors = [];
  const rawOwners = new Map();
  const sortedIntoOwners = new Map();
  for (const process of otherProcesses) {
    rawOwners.set(process.raw_folder_id, process.name);
    sortedIntoOwners.set(process.master_folder_id, process.name);
    for (const destination of process.destinations ?? []) sortedIntoOwners.set(destination.folder_id, process.name);
  }

  if (rawOwners.has(folders.rawFolderId)) {
    errors.push({ field: "rawFolderId", message: `That's already the Raw folder of "${rawOwners.get(folders.rawFolderId)}".` });
  } else if (sortedIntoOwners.has(folders.rawFolderId)) {
    errors.push({
      field: "rawFolderId",
      message: `"${sortedIntoOwners.get(folders.rawFolderId)}" sorts files into that folder, so it can't be a Raw folder too.`,
    });
  }

  if (rawOwners.has(folders.masterFolderId)) {
    errors.push({ field: "masterFolderId", message: `That's the Raw folder of "${rawOwners.get(folders.masterFolderId)}"; files would loop.` });
  }

  for (const { index, folderId } of folders.destinations) {
    if (folderId === folders.rawFolderId) {
      errors.push({ field: `destinations[${index}].folder`, message: "That's this process's own Raw folder." });
    } else if (rawOwners.has(folderId)) {
      errors.push({
        field: `destinations[${index}].folder`,
        message: `That's the Raw folder of "${rawOwners.get(folderId)}"; files would loop.`,
      });
    }
  }
  return errors;
}
