import { google } from "googleapis";
import { getAuthedClient } from "./googleAuth.service.js";

// googleapis requests have no timeout by default; a hung one would hold the
// user's sweep lock (pipeline inFlight) indefinitely.
const REQUEST_TIMEOUT_MS = 60_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const MAX_PATH_DEPTH = 20;

async function driveFor(userId) {
  return google.drive({ version: "v3", auth: await getAuthedClient(userId) });
}

/** Escapes a value for a Drive query string literal: backslashes first, then quotes. */
export function escapeQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * One page of folders for the folder browser: the children of parentId
 * ("root" is My Drive), or a name search across every folder the user can see.
 */
export async function listFolders(userId, { q, parentId = "root", pageToken } = {}) {
  const drive = await driveFor(userId);
  const clauses = [`mimeType = '${FOLDER_MIME_TYPE}'`, "trashed = false"];
  if (q) clauses.push(`name contains '${escapeQueryValue(q)}'`);
  else clauses.push(`'${escapeQueryValue(parentId || "root")}' in parents`);

  const { data } = await drive.files.list(
    {
      q: clauses.join(" and "),
      fields: "nextPageToken, files(id, name, parents, driveId)",
      pageSize: 100,
      orderBy: "name",
      pageToken: pageToken || undefined,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return { folders: data.files ?? [], nextPageToken: data.nextPageToken ?? null };
}

const MAX_FOLDER_SCAN = 500;

/** Supported files of the given MIME types currently sitting directly in a folder, for on-demand organizing. */
export async function listFilesInFolder(userId, folderId, mimeTypes) {
  const drive = await driveFor(userId);
  const mimeClause = mimeTypes.map((type) => `mimeType = '${type}'`).join(" or ");
  const q = `'${escapeQueryValue(folderId)}' in parents and trashed = false and (${mimeClause})`;

  const files = [];
  let pageToken;
  do {
    const { data } = await drive.files.list(
      {
        q,
        fields:
          "nextPageToken, files(id, name, mimeType, size, parents, trashed, createdTime, modifiedTime, imageMediaMetadata(time), capabilities(canRename))",
        pageSize: 100,
        orderBy: "createdTime",
        pageToken,
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken && files.length < MAX_FOLDER_SCAN);

  return files.slice(0, MAX_FOLDER_SCAN);
}

/** Alias kept for callers that predate document processes. */
export const listImagesInFolder = listFilesInFolder;

/**
 * Current metadata for one file — the same fields the changes feed and folder listings request,
 * so a caller rechecking a file it saw earlier (the editing-grace deferral queue) gets a
 * directly comparable shape. Null when the file is gone (404); any other error is left to the caller.
 */
export async function getFileMetadata(userId, fileId) {
  const drive = await driveFor(userId);
  try {
    const { data } = await drive.files.get(
      {
        fileId,
        fields:
          "id, name, mimeType, parents, size, trashed, modifiedTime, createdTime, imageMediaMetadata(time), capabilities(canRename)",
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );
    return data;
  } catch (err) {
    if (err?.code === 404 || err?.response?.status === 404) return null;
    throw err;
  }
}

export async function getFolder(userId, folderId) {
  const drive = await driveFor(userId);
  const { data } = await drive.files.get(
    {
      fileId: folderId,
      fields: "id, name, mimeType, trashed, parents, driveId, capabilities(canAddChildren, canRemoveChildren)",
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data;
}

export async function createFolder(userId, name, parentId) {
  const drive = await driveFor(userId);
  const { data } = await drive.files.create(
    {
      requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] },
      fields: "id, name, parents",
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data;
}

async function findChildFolder(drive, parentId, name) {
  const { data } = await drive.files.list(
    {
      q: `'${escapeQueryValue(parentId)}' in parents and name = '${escapeQueryValue(name)}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
      fields: "files(id, name, parents)",
      pageSize: 1,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data.files?.[0] ?? null;
}

/** The folder called `name` directly inside parentId, created if it doesn't exist yet. */
export async function ensureChildFolder(userId, parentId, name) {
  const drive = await driveFor(userId);
  const existing = await findChildFolder(drive, parentId, name);
  if (existing) return { ...existing, created: false };
  return { ...(await createFolder(userId, name, parentId)), created: true };
}

/**
 * Breadcrumbs from My Drive down to a folder. inMyDrive is false for folders
 * that are only shared with the user, which the changes feed doesn't cover.
 */
export async function getFolderPath(userId, folderId) {
  const drive = await driveFor(userId);
  const get = async (fileId) =>
    (await drive.files.get({ fileId, fields: "id, name, parents" }, { timeout: REQUEST_TIMEOUT_MS })).data;

  const root = await get("root");
  const path = [];
  let current = await get(folderId);

  for (let depth = 0; current && depth < MAX_PATH_DEPTH; depth += 1) {
    const isRoot = current.id === root.id;
    path.unshift({ id: current.id, name: isRoot ? "My Drive" : current.name });
    if (isRoot || !current.parents?.length) break;
    try {
      current = await get(current.parents[0]);
    } catch {
      break; // a parent the user can't see (shared folder)
    }
  }

  return { path, inMyDrive: path[0]?.id === root.id };
}

/**
 * Downloads file content into memory. The returned Buffer is the only copy —
 * it is never written to disk or forwarded to storage (Zero-Retention).
 */
export async function getFileBuffer(userId, fileId) {
  const drive = await driveFor(userId);
  const { data } = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer", timeout: DOWNLOAD_TIMEOUT_MS },
  );
  return Buffer.from(data);
}

export async function renameAndMove(userId, fileId, { name, addParent, removeParent }) {
  const drive = await driveFor(userId);
  const { data } = await drive.files.update(
    {
      fileId,
      requestBody: { name },
      addParents: addParent,
      removeParents: removeParent,
      fields: "id, name, parents",
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data;
}

/** Baseline for the changes feed, captured before a watch channel is opened. */
export async function getStartPageToken(userId) {
  const drive = await driveFor(userId);
  const { data } = await drive.changes.getStartPageToken({}, { timeout: REQUEST_TIMEOUT_MS });
  return data.startPageToken;
}

/**
 * One page of the changes feed. Drive push notifications carry no payload, so
 * this is how we learn *which* files changed.
 */
export async function listChanges(userId, pageToken) {
  const drive = await driveFor(userId);
  const { data } = await drive.changes.list(
    {
      pageToken,
      pageSize: 100,
      includeRemoved: false,
      spaces: "drive",
      restrictToMyDrive: true,
      fields:
        "newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, mimeType, size, parents, trashed, createdTime, modifiedTime, imageMediaMetadata(time), capabilities(canRename)))",
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return data;
}

/** Readable message for Drive's export-size limit (~10MB); any other export error passes through unchanged. */
function readableExportError(err) {
  const reason = err?.errors?.[0]?.reason ?? err?.response?.data?.error?.errors?.[0]?.reason ?? "";
  const message = String(err?.message ?? "");
  if (reason === "exportSizeLimitExceeded" || /export.*(too large|size limit)/i.test(message)) {
    return new Error("This document is too large for DriveTag to read from Google Drive (Google limits exports to 10 MB).");
  }
  return err;
}

/**
 * A Google Doc/Sheet/Slides file exported as text, in memory — the returned string is
 * the only copy and is never written to disk (Zero-Retention). Google-native files have
 * no downloadable bytes, so this is the only way to read their content.
 */
export async function exportFileText(userId, fileId, exportMimeType) {
  const drive = await driveFor(userId);
  let data;
  try {
    ({ data } = await drive.files.export(
      { fileId, mimeType: exportMimeType },
      { responseType: "arraybuffer", timeout: REQUEST_TIMEOUT_MS },
    ));
  } catch (err) {
    throw readableExportError(err);
  }
  return Buffer.from(data).toString("utf8");
}
