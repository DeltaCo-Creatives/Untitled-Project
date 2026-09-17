/** API shape of a folder_configs row; the frontend reads camelCase. */
export function serializeFolderConfig(row) {
  if (!row) return null;
  return {
    rawFolderId: row.raw_folder_id,
    rawFolderName: row.raw_folder_name,
    destinationFolderId: row.destination_folder_id,
    destinationFolderName: row.destination_folder_name,
  };
}
