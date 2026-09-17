import { supabase } from "../lib/supabase.js";

/**
 * Idempotency ledger + user-facing activity history. Stores filenames and
 * tags only — never image bytes, per the Zero-Retention posture.
 *
 * Returns false when this file was already processed (unique violation),
 * which is the guard against Drive redelivering a notification.
 */
export async function claimFile(userId, fileId, originalName) {
  const { error } = await supabase
    .from("processed_files")
    .insert({ user_id: userId, file_id: fileId, original_name: originalName });

  if (error) {
    if (error.code === "23505") return false; // unique_violation
    throw new Error(`Failed to claim file: ${error.message}`);
  }
  return true;
}

export async function recordResult(userId, fileId, result) {
  const { error } = await supabase
    .from("processed_files")
    .update({
      new_name: result.newName,
      tags: result.tags,
      status: "completed",
      processed_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("file_id", fileId);

  if (error) throw new Error(`Failed to record result: ${error.message}`);
}

export async function recordFailure(userId, fileId, message) {
  const { error } = await supabase
    .from("processed_files")
    .update({ status: "failed", error_message: message, processed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("file_id", fileId);

  if (error) throw new Error(`Failed to record failure: ${error.message}`);
}

// Keeps `in (...)` filters well under PostgREST's URL length limit.
const ID_BATCH = 100;

function batches(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) out.push(ids.slice(i, i + ID_BATCH));
  return out;
}

/** Map of file_id → status for the given files; ids with no row are simply absent. */
export async function getStatuses(userId, fileIds) {
  const statuses = new Map();
  for (const ids of batches(fileIds)) {
    const { data, error } = await supabase
      .from("processed_files")
      .select("file_id, status")
      .eq("user_id", userId)
      .in("file_id", ids);

    if (error) throw new Error(`Failed to load file statuses: ${error.message}`);
    for (const row of data ?? []) statuses.set(row.file_id, row.status);
  }
  return statuses;
}

/** Frees failed claims so those files can be attempted again. */
export async function releaseFailed(userId, fileIds) {
  for (const ids of batches(fileIds)) {
    const { error } = await supabase
      .from("processed_files")
      .delete()
      .eq("user_id", userId)
      .eq("status", "failed")
      .in("file_id", ids);

    if (error) throw new Error(`Failed to release failed files: ${error.message}`);
  }
}

export async function releaseClaim(userId, fileId) {
  await supabase.from("processed_files").delete().eq("user_id", userId).eq("file_id", fileId);
}

export async function listRecent(userId, limit = 50) {
  const { data, error } = await supabase
    .from("processed_files")
    .select("file_id, original_name, new_name, tags, status, error_message, processed_at")
    .eq("user_id", userId)
    .order("processed_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new Error(`Failed to list activity: ${error.message}`);
  return data ?? [];
}
