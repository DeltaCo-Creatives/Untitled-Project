import { google } from "googleapis";
import { getAuthedClient } from "./googleAuth.service.js";

async function driveFor(userId) {
  return google.drive({ version: "v3", auth: await getAuthedClient(userId) });
}

export async function listFolders(userId, query) {
  const drive = await driveFor(userId);
  const clauses = ["mimeType = 'application/vnd.google-apps.folder'", "trashed = false"];
  if (query) clauses.push(`name contains '${query.replace(/'/g, "\\'")}'`);

  const { data } = await drive.files.list({
    q: clauses.join(" and "),
    fields: "files(id, name)",
    pageSize: 100,
    orderBy: "name",
  });
  return data.files ?? [];
}

const MAX_FOLDER_SCAN = 500;

/** Supported images currently sitting directly in a folder, for on-demand organizing. */
export async function listImagesInFolder(userId, folderId, mimeTypes) {
  const drive = await driveFor(userId);
  const mimeClause = mimeTypes.map((type) => `mimeType = '${type}'`).join(" or ");
  const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false and (${mimeClause})`;

  const files = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, mimeType, size, parents, trashed)",
      pageSize: 100,
      orderBy: "createdTime",
      pageToken,
    });
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken && files.length < MAX_FOLDER_SCAN);

  return files.slice(0, MAX_FOLDER_SCAN);
}

export async function getFolder(userId, folderId) {
  const drive = await driveFor(userId);
  const { data } = await drive.files.get({
    fileId: folderId,
    fields: "id, name, mimeType, trashed",
  });
  return data;
}

/**
 * Downloads file content into memory. The returned Buffer is the only copy —
 * it is never written to disk or forwarded to storage (Zero-Retention).
 */
export async function getFileBuffer(userId, fileId) {
  const drive = await driveFor(userId);
  const { data } = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(data);
}

export async function renameAndMove(userId, fileId, { name, addParent, removeParent }) {
  const drive = await driveFor(userId);
  const { data } = await drive.files.update({
    fileId,
    requestBody: { name },
    addParents: addParent,
    removeParents: removeParent,
    fields: "id, name, parents",
  });
  return data;
}

/** Baseline for the changes feed, captured before a watch channel is opened. */
export async function getStartPageToken(userId) {
  const drive = await driveFor(userId);
  const { data } = await drive.changes.getStartPageToken();
  return data.startPageToken;
}

/**
 * One page of the changes feed. Drive push notifications carry no payload, so
 * this is how we learn *which* files changed.
 */
export async function listChanges(userId, pageToken) {
  const drive = await driveFor(userId);
  const { data } = await drive.changes.list({
    pageToken,
    pageSize: 100,
    includeRemoved: false,
    spaces: "drive",
    restrictToMyDrive: true,
    fields:
      "newStartPageToken, nextPageToken, changes(fileId, removed, file(id, name, mimeType, size, parents, trashed))",
  });
  return data;
}
