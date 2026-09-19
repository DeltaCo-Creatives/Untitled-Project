import { ApiError, type DestinationInput, type ProcessInput, type ProcessLimits, type WorkProcess } from '../../lib/api';
import { TEMPLATE_TOKENS_BY_KIND, slugify, validateTemplate, type ProcessKind } from '../../lib/filename';
import type { DisabledFolders, PickedFolder } from '../drive/types';

export type { ProcessKind };

// Form state and rules for the work-process editor. The rules mirror
// backend/src/utils/processValidation.js (same field paths, same limits), so the
// editor can point at problems before the server has to.

export interface DestinationDraft {
  /** Stable React key; never sent to the server. */
  localId: string;
  /** Server id for destinations that already exist. */
  id: string | null;
  name: string;
  description: string;
  isFallback: boolean;
  folderMode: 'existing' | 'create' | 'master';
  /** Only used when folderMode is 'existing'. */
  folder: PickedFolder | null;
}

export interface TagFieldDraft {
  localId: string;
  key: string;
  label: string;
  description: string;
  /** Once the user types a key, it stops following the label. */
  keyEdited: boolean;
}

export interface ProcessDraft {
  /** null only for a brand new, not-yet-created process: the kind picker requires an explicit choice. */
  kind: ProcessKind | null;
  name: string;
  raw: PickedFolder | null;
  master: PickedFolder | null;
  renameTemplate: string;
  instructions: string;
  tagFields: TagFieldDraft[];
  destinations: DestinationDraft[];
  enabled: boolean;
}

export type FieldErrors = Record<string, string>;

/** Starting naming template per kind: unchanged for images, {type}_{organization}_{topic} for documents. */
export const DEFAULT_TEMPLATE_BY_KIND: Record<ProcessKind, string> = {
  image: '{destination}_{subject}',
  document: '{type}_{organization}_{topic}',
};
/** Kept for callers that only ever dealt with images. */
export const DEFAULT_TEMPLATE = DEFAULT_TEMPLATE_BY_KIND.image;
export const UNSORTED_NAME = 'Unsorted';
/** The quick (onboarding) form suggests starting small. */
export const QUICK_DESTINATION_LIMIT = 3;
export const TAG_KEY_MAX = 32;

const TAG_KEY = /^[a-z][a-z0-9_]{0,31}$/;
// A tag key shares the AI response schema and the template namespace with the process's own naming
// tokens, so it can't reuse one of them. Only the process's own kind is reserved: an image process
// may keep a "type" or "topic" tag (existing ones do), since those names only mean something to
// document processes, and vice versa. Mirrors RESERVED_TAG_KEYS_BY_KIND in backend/src/utils/processValidation.js.
const RESERVED_WORDS = ['tag', 'tags', 'ext', 'unsorted', 'fields'];
const RESERVED_TAG_KEYS_BY_KIND: Record<ProcessKind, Set<string>> = {
  image: new Set([...TEMPLATE_TOKENS_BY_KIND.image, ...RESERVED_WORDS]),
  document: new Set([...TEMPLATE_TOKENS_BY_KIND.document, ...RESERVED_WORDS]),
};
const SEPARATORS = '-_. ';

/** Same numbers as PROCESS_LIMITS in backend/src/config/plans.js, used if /api/plans can't be loaded. */
export const DEFAULT_PROCESS_LIMITS: ProcessLimits = {
  maxDestinations: 20,
  maxTagFields: 10,
  nameMax: 60,
  descriptionMax: 300,
  instructionsMax: 1000,
  tagLabelMax: 40,
  tagDescriptionMax: 200,
  templateMax: 200,
};

/** Anchor ids of the editor's sections, in page order. */
export const PROCESS_SECTIONS = [
  { id: 'basics', label: 'Basics' },
  { id: 'destinations', label: 'Destinations' },
  { id: 'naming', label: 'File names' },
  { id: 'tags', label: 'Tag fields' },
  { id: 'instructions', label: 'AI instructions' },
] as const;

export type ProcessSectionId = (typeof PROCESS_SECTIONS)[number]['id'];

/** Which editor section shows the error for a server field path. The kind picker sits right above Basics. */
export function sectionOfField(field: string): ProcessSectionId {
  if (field.startsWith('destinations')) return 'destinations';
  if (field.startsWith('tagFields')) return 'tags';
  if (field === 'renameTemplate') return 'naming';
  if (field === 'instructions') return 'instructions';
  return 'basics';
}

/** One-click starting points shown under the destination list, per process kind. */
export const DESTINATION_IDEAS_BY_KIND: Record<ProcessKind, { name: string; description: string }[]> = {
  image: [
    { name: 'Logos', description: 'Brand marks, wordmarks and app icons.' },
    { name: 'Product shots', description: 'Products on a plain or studio background, packshots and flat lays.' },
    { name: 'Lifestyle', description: 'People using products, candid moments and on-location photos.' },
    { name: 'Social graphics', description: 'Designed posts, banners and ads with text on them.' },
  ],
  document: [
    { name: 'Invoices', description: 'Bills and receipts from suppliers.' },
    { name: 'Contracts', description: 'Signed agreements and NDAs.' },
    { name: 'Reports', description: 'Briefs, proposals and write-ups.' },
    { name: 'Statements', description: 'Bank, financial or account statements.' },
  ],
};

/** Examples offered when a process has no tag fields yet, per process kind. */
export const TAG_FIELD_IDEAS_BY_KIND: Record<ProcessKind, { label: string; description: string }[]> = {
  image: [
    { label: 'Client', description: 'The client or brand the image is for, when a logo or product makes it clear.' },
    { label: 'Color palette', description: 'The two or three dominant colors, like warm neutrals or teal and orange.' },
    { label: 'Orientation', description: 'portrait, landscape or square.' },
  ],
  document: [
    { label: 'Invoice number', description: 'The invoice or reference number printed on the document, if there is one.' },
    { label: 'Client', description: 'The client or vendor named on the document, when it’s clear.' },
    { label: 'Document date', description: 'The date shown on the document itself, written out in full.' },
  ],
};

let localCounter = 0;

export function nextLocalId(prefix: string) {
  localCounter += 1;
  return `${prefix}-${localCounter.toString(36)}`;
}

export function newDestinationDraft(values: Partial<Pick<DestinationDraft, 'name' | 'description'>> = {}): DestinationDraft {
  return {
    localId: nextLocalId('destination'),
    id: null,
    name: values.name ?? '',
    description: values.description ?? '',
    isFallback: false,
    folderMode: 'create',
    folder: null,
  };
}

function fallbackDraft(): DestinationDraft {
  return { ...newDestinationDraft({ name: UNSORTED_NAME }), isFallback: true };
}

export function newTagFieldDraft(label = '', description = '', takenKeys: string[] = [], kind: ProcessKind = 'image'): TagFieldDraft {
  return {
    localId: nextLocalId('tag'),
    key: deriveTagKey(label, takenKeys, kind),
    label,
    description,
    keyEdited: false,
  };
}

export function emptyDraft(): ProcessDraft {
  return {
    kind: null,
    name: '',
    raw: null,
    master: null,
    renameTemplate: DEFAULT_TEMPLATE,
    instructions: '',
    tagFields: [],
    destinations: [fallbackDraft()],
    enabled: true,
  };
}

export function draftFromProcess(process: WorkProcess): ProcessDraft {
  // Regular destinations in their saved order, Unsorted always last.
  const ordered = [...process.destinations].sort(
    (a, b) => Number(a.isFallback) - Number(b.isFallback) || a.position - b.position,
  );
  const destinations: DestinationDraft[] = ordered.map((destination) => {
    const usesMaster = destination.isFallback && destination.folderId === process.masterFolderId;
    return {
      localId: nextLocalId('destination'),
      id: destination.id,
      name: destination.name,
      description: destination.description ?? '',
      isFallback: destination.isFallback,
      folderMode: usesMaster ? 'master' : 'existing',
      folder: usesMaster ? null : { id: destination.folderId, name: destination.folderName ?? destination.name },
    };
  });
  if (!destinations.some((destination) => destination.isFallback)) destinations.push(fallbackDraft());

  return {
    kind: process.kind,
    name: process.name,
    raw: { id: process.rawFolderId, name: process.rawFolderName ?? 'Raw folder' },
    master: { id: process.masterFolderId, name: process.masterFolderName ?? 'Master folder' },
    renameTemplate: process.renameTemplate || DEFAULT_TEMPLATE_BY_KIND[process.kind],
    instructions: process.instructions ?? '',
    // Saved keys may already be used in names, so they never follow label edits.
    tagFields: process.tagFields.map((field) => ({
      localId: nextLocalId('tag'),
      key: field.key,
      label: field.label,
      description: field.description ?? '',
      keyEdited: true,
    })),
    destinations,
    enabled: process.enabled,
  };
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

export function toProcessInput(draft: ProcessDraft, timezone: string): ProcessInput {
  return {
    // Falls back to 'image' only while a new draft's kind is still unset; validateDraft blocks saving before then.
    kind: draft.kind ?? 'image',
    name: draft.name.trim(),
    rawFolderId: draft.raw?.id ?? '',
    masterFolderId: draft.master?.id ?? '',
    renameTemplate: draft.renameTemplate.trim(),
    instructions: draft.instructions.trim(),
    timezone,
    // No `enabled`: the on/off switch lives on the dashboard. Omitting it keeps the server's current setting
    // (new processes start on), so saving from a stale editor tab can't undo a switch flipped elsewhere.
    tagFields: draft.tagFields.map((field) => ({
      key: normalizeKey(field.key),
      label: field.label.trim(),
      description: field.description.trim(),
    })),
    // Order matters: server error paths like destinations[2].name index into this array.
    destinations: draft.destinations.map(
      (destination): DestinationInput => ({
        id: destination.id,
        name: destination.name.trim(),
        description: destination.description.trim(),
        isFallback: destination.isFallback,
        folder:
          destination.folderMode === 'existing'
            ? { mode: 'existing', id: destination.folder?.id ?? '' }
            : { mode: destination.folderMode },
      }),
    ),
  };
}

/** What would be saved, as a string: equal snapshots mean no unsaved changes. */
export function draftSnapshot(draft: ProcessDraft) {
  return JSON.stringify(toProcessInput(draft, ''));
}

// ------------------------------------------------------------------ validation

export function validateDraft(draft: ProcessDraft, limits: ProcessLimits, otherProcesses: WorkProcess[]): FieldErrors {
  const errors: FieldErrors = {};
  const fail = (field: string, message: string) => {
    if (!(field in errors)) errors[field] = message;
  };

  if (!draft.kind) fail('kind', 'Choose what this process sorts.');
  const kind = draft.kind ?? 'image';
  const nouns = kind === 'document' ? 'documents' : 'images';

  const name = draft.name.trim();
  if (!name) fail('name', 'Give this process a name.');
  else if (name.length > limits.nameMax) fail('name', `Keep the name under ${limits.nameMax} characters.`);

  const rawFolderId = draft.raw?.id ?? '';
  const masterFolderId = draft.master?.id ?? '';
  if (!rawFolderId) fail('rawFolderId', 'Choose the Raw folder DriveTag watches.');
  if (!masterFolderId) fail('masterFolderId', `Choose the Master folder sorted ${nouns} go into.`);
  if (rawFolderId && rawFolderId === masterFolderId) {
    fail('masterFolderId', 'The Master folder has to be different from the Raw folder.');
  }

  if (draft.instructions.trim().length > limits.instructionsMax) {
    fail('instructions', `Keep instructions under ${limits.instructionsMax} characters.`);
  }

  // ---- tag fields
  if (draft.tagFields.length > limits.maxTagFields) {
    fail('tagFields', `A process can have up to ${limits.maxTagFields} tag fields.`);
  }
  const seenKeys = new Set<string>();
  draft.tagFields.forEach((field, index) => {
    const at = `tagFields[${index}]`;
    const key = normalizeKey(field.key);
    const label = field.label.trim();
    if (!TAG_KEY.test(key)) fail(`${at}.key`, 'Use a short key: lowercase letters, numbers and _, starting with a letter.');
    else if (RESERVED_TAG_KEYS_BY_KIND[kind].has(key)) fail(`${at}.key`, `“${key}” is already a built-in token; pick another key.`);
    else if (seenKeys.has(key)) fail(`${at}.key`, `Two tag fields use the key “${key}”.`);
    seenKeys.add(key);
    if (!label) fail(`${at}.label`, 'Give this tag field a label.');
    else if (label.length > limits.tagLabelMax) fail(`${at}.label`, `Keep labels under ${limits.tagLabelMax} characters.`);
    if (field.description.trim().length > limits.tagDescriptionMax) {
      fail(`${at}.description`, `Keep descriptions under ${limits.tagDescriptionMax} characters.`);
    }
  });

  const template = draft.renameTemplate.trim();
  if (template.length > limits.templateMax) {
    fail('renameTemplate', `Keep the naming template under ${limits.templateMax} characters.`);
  } else {
    const [problem] = validateTemplate(template, draft.tagFields.map((field) => normalizeKey(field.key)), kind);
    if (problem) fail('renameTemplate', problem);
  }

  // ---- destinations
  const fallbacks = draft.destinations.filter((destination) => destination.isFallback).length;
  if (fallbacks !== 1) fail('destinations', 'A process needs exactly one Unsorted destination.');
  if (draft.destinations.length - fallbacks > limits.maxDestinations) {
    fail('destinations', `A process can have up to ${limits.maxDestinations} destinations besides Unsorted.`);
  }
  const names = new Set<string>();
  draft.destinations.forEach((destination, index) => {
    const at = `destinations[${index}]`;
    const destinationName = destination.name.trim();
    if (!destinationName) fail(`${at}.name`, 'Give this destination a name.');
    else if (destinationName.length > limits.nameMax) fail(`${at}.name`, `Keep names under ${limits.nameMax} characters.`);
    else if (names.has(destinationName.toLowerCase())) fail(`${at}.name`, `Two destinations are called “${destinationName}”.`);
    names.add(destinationName.toLowerCase());
    if (destination.description.trim().length > limits.descriptionMax) {
      fail(`${at}.description`, `Keep descriptions under ${limits.descriptionMax} characters.`);
    }
    if (destination.folderMode === 'existing' && !destination.folder?.id) {
      fail(`${at}.folder`, 'Choose a folder.');
    } else if (destination.folderMode === 'master' && !destination.isFallback) {
      fail(`${at}.folder`, 'Only Unsorted can use the Master folder itself.');
    }
  });

  // ---- folders shared with other processes (folderConflicts on the server)
  const { rawOwners, sortedIntoOwners } = folderOwners(otherProcesses);
  if (rawFolderId) {
    if (rawOwners.has(rawFolderId)) {
      fail('rawFolderId', `That’s already the Raw folder of “${rawOwners.get(rawFolderId)}”.`);
    } else if (sortedIntoOwners.has(rawFolderId)) {
      fail('rawFolderId', `“${sortedIntoOwners.get(rawFolderId)}” sorts files into that folder, so it can’t be a Raw folder too.`);
    }
  }
  if (masterFolderId && rawOwners.has(masterFolderId)) {
    fail('masterFolderId', `That’s the Raw folder of “${rawOwners.get(masterFolderId)}”; files would loop.`);
  }
  draft.destinations.forEach((destination, index) => {
    const folderId =
      destination.folderMode === 'existing' ? destination.folder?.id : destination.folderMode === 'master' ? masterFolderId : null;
    if (!folderId) return;
    const at = `destinations[${index}].folder`;
    if (folderId === rawFolderId) fail(at, 'That’s this process’s own Raw folder.');
    else if (rawOwners.has(folderId)) fail(at, `That’s the Raw folder of “${rawOwners.get(folderId)}”; files would loop.`);
  });

  return errors;
}

function folderOwners(processes: WorkProcess[]) {
  const rawOwners = new Map<string, string>();
  const sortedIntoOwners = new Map<string, string>();
  for (const process of processes) {
    rawOwners.set(process.rawFolderId, process.name);
    sortedIntoOwners.set(process.masterFolderId, process.name);
    for (const destination of process.destinations) sortedIntoOwners.set(destination.folderId, process.name);
  }
  return { rawOwners, sortedIntoOwners };
}

/** Field errors from a 400 response, keyed by server field path (first message per field). */
export function fieldErrorsFromApi(err: unknown): FieldErrors {
  if (!(err instanceof ApiError) || !err.details?.length) return {};
  const errors: FieldErrors = {};
  for (const detail of err.details) {
    if (detail?.field && detail.message && !(detail.field in errors)) errors[detail.field] = detail.message;
  }
  return errors;
}

/** The part of a draft a server error is about; if it changed, the error no longer applies. */
function errorScope(draft: ProcessDraft, field: string) {
  const destination = /^destinations\[(\d+)\]/.exec(field);
  if (destination) {
    return JSON.stringify([
      draft.destinations.map((entry) => entry.localId),
      draft.destinations[Number(destination[1])] ?? null,
      draft.raw?.id,
      draft.master?.id,
    ]);
  }
  const tagField = /^tagFields\[(\d+)\]/.exec(field);
  if (tagField) {
    return JSON.stringify([draft.tagFields.map((entry) => entry.localId), draft.tagFields[Number(tagField[1])] ?? null]);
  }
  switch (field) {
    case 'kind':
      return draft.kind;
    case 'name':
      return draft.name;
    case 'rawFolderId':
    case 'masterFolderId':
      return JSON.stringify([draft.raw?.id, draft.master?.id]);
    case 'renameTemplate':
      return JSON.stringify([draft.renameTemplate, draft.tagFields.map((entry) => entry.key)]);
    case 'instructions':
      return draft.instructions;
    case 'tagFields':
      return JSON.stringify(draft.tagFields);
    case 'destinations':
      return JSON.stringify(draft.destinations);
    default:
      return JSON.stringify(draft);
  }
}

/** Server errors that still describe the current draft (edited fields drop theirs). */
export function currentServerErrors(errors: FieldErrors, sentDraft: ProcessDraft, draft: ProcessDraft): FieldErrors {
  const current: FieldErrors = {};
  for (const [field, message] of Object.entries(errors)) {
    if (errorScope(sentDraft, field) === errorScope(draft, field)) current[field] = message;
  }
  return current;
}

// ------------------------------------------------------------------ folders

export function disabledFoldersFor(
  otherProcesses: WorkProcess[],
  role: 'raw' | 'master' | 'destination',
  draft: ProcessDraft,
): DisabledFolders {
  const disabled: DisabledFolders = {};
  const add = (folderId: string | null | undefined, reason: string) => {
    if (folderId && !(folderId in disabled)) disabled[folderId] = reason;
  };

  for (const process of otherProcesses) add(process.rawFolderId, `Already the Raw folder of “${process.name}”`);

  if (role === 'raw') {
    for (const process of otherProcesses) {
      add(process.masterFolderId, `“${process.name}” sorts into this folder`);
      for (const destination of process.destinations) add(destination.folderId, `“${process.name}” sorts into this folder`);
    }
    add(draft.master?.id, 'This process’s Master folder');
    for (const destination of draft.destinations) {
      if (destination.folderMode !== 'existing') continue;
      const destinationName = destination.name.trim();
      add(destination.folder?.id, destinationName ? `This process’s “${destinationName}” destination` : 'A destination of this process');
    }
  } else {
    add(draft.raw?.id, 'This process’s Raw folder');
  }
  return disabled;
}

// ------------------------------------------------------------------ tag keys

/** "Color palette" → "color_palette", steering clear of this kind's built-in tokens and keys already in use. */
export function deriveTagKey(label: string, takenKeys: Iterable<string> = [], kind: ProcessKind = 'image') {
  const trimEnd = (value: string) => value.slice(0, TAG_KEY_MAX).replace(/_+$/, '');
  let base = trimEnd(slugify(label).replace(/-/g, '_'));
  if (!base) return '';
  if (!/^[a-z]/.test(base)) base = trimEnd(`tag_${base}`);
  if (RESERVED_TAG_KEYS_BY_KIND[kind].has(base)) base = `${base}_tag`;

  const taken = new Set(takenKeys);
  let key = base;
  for (let n = 2; taken.has(key); n += 1) {
    const suffix = `_${n}`;
    key = `${base.slice(0, TAG_KEY_MAX - suffix.length)}${suffix}`;
  }
  return key;
}

/** Lowercase, spaces and hyphens to underscores, nothing a key can't hold. */
export function normalizeTypedKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, TAG_KEY_MAX);
}

export function isUsableTagKey(key: string, kind: ProcessKind = 'image') {
  const normalized = normalizeKey(key);
  return TAG_KEY.test(normalized) && !RESERVED_TAG_KEYS_BY_KIND[kind].has(normalized);
}

function removeToken(template: string, token: string) {
  let result = template;
  for (let index = result.indexOf(token); index !== -1; index = result.indexOf(token)) {
    const before = result.slice(0, index);
    const after = result.slice(index + token.length);
    const separatorBefore = before.length > 0 && SEPARATORS.includes(before[before.length - 1]);
    const separatorAfter = after.length > 0 && SEPARATORS.includes(after[0]);
    // Take one neighbouring separator along so "{a}_{tag:x}_{b}" becomes "{a}_{b}".
    if (separatorAfter) result = before + after.slice(1);
    else if (separatorBefore) result = before.slice(0, -1) + after;
    else result = before + after;
  }
  return result;
}

/** Keeps {tag:key} tokens in the template in step with renamed and removed tag fields. */
export function syncTemplateWithTagFields(template: string, previous: TagFieldDraft[], next: TagFieldDraft[]) {
  let result = template;
  const nextById = new Map(next.map((field) => [field.localId, field]));
  for (const old of previous) {
    const oldKey = normalizeKey(old.key);
    const token = `{tag:${oldKey}}`;
    if (!oldKey || !result.includes(token)) continue;
    // Another field still answers to this key, so the token isn't orphaned.
    if (next.some((field) => field.localId !== old.localId && normalizeKey(field.key) === oldKey)) continue;

    const current = nextById.get(old.localId);
    if (!current) {
      result = removeToken(result, token);
      continue;
    }
    const newKey = normalizeKey(current.key);
    if (newKey && newKey !== oldKey) result = result.split(token).join(`{tag:${newKey}}`);
  }
  return result;
}
