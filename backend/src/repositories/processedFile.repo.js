import { supabase } from "../lib/supabase.js";

// Processing one image takes seconds; a claim still "processing" after this long was
// orphaned by a crash or redeploy mid-file and would otherwise block that file forever.
const STALE_CLAIM_MS = 15 * 60 * 1000;

export function isStaleClaim(row, now = Date.now()) {
  return (
    row?.status === "processing" &&
    Boolean(row.claimed_at) &&
    now - new Date(row.claimed_at).getTime() > STALE_CLAIM_MS
  );
}

function staleCutoffIso() {
  return new Date(Date.now() - STALE_CLAIM_MS).toISOString();
}

/** Deletes this file's claim only if it is an orphaned "processing" claim. */
async function releaseStaleClaim(userId, fileId) {
  const { data, error } = await supabase
    .from("processed_files")
    .delete()
    .eq("user_id", userId)
    .eq("file_id", fileId)
    .eq("status", "processing")
    .lt("claimed_at", staleCutoffIso())
    .select("file_id");

  if (error) throw new Error(`Failed to release stale claim: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Idempotency ledger + user-facing activity history. Stores filenames and
 * tags only — never image bytes, per the Zero-Retention posture.
 *
 * Returns a claim token (the row's claimed_at) when this caller now owns the
 * file, or null when it was already processed or is being processed (unique
 * violation) — the guard against Drive redelivering a notification.
 */
export async function claimFile(userId, fileId, originalName, processId) {
  const insert = () =>
    supabase
      .from("processed_files")
      .insert({ user_id: userId, file_id: fileId, original_name: originalName, process_id: processId })
      .select("claimed_at")
      .single();

  let { data, error } = await insert();
  // unique_violation: someone holds the claim. Take it over only if that claim was orphaned.
  if (error?.code === "23505" && (await releaseStaleClaim(userId, fileId))) {
    ({ data, error } = await insert());
  }

  if (error) {
    if (error.code === "23505") return null;
    // foreign_key_violation: the process (or user) was deleted since the sweep loaded it. Skip this file;
    // don't abort the whole sweep for every other process.
    if (error.code === "23503") return null;
    throw new Error(`Failed to claim file: ${error.message}`);
  }
  return data.claimed_at;
}

// Every write below is fenced by the claim token: a worker whose stale claim was
// taken over must not overwrite the new owner's row.
const ownedBy = (query, userId, fileId, claim) =>
  query.eq("user_id", userId).eq("file_id", fileId).eq("status", "processing").eq("claimed_at", claim);

/** Whether this claim still owns the file (false once it has been taken over as stale). */
export async function holdsClaim(userId, fileId, claim) {
  const { data, error } = await ownedBy(supabase.from("processed_files").select("file_id"), userId, fileId, claim).maybeSingle();
  if (error) throw new Error(`Failed to check file claim: ${error.message}`);
  return Boolean(data);
}

/**
 * Records the result and charges one image credit in a single transaction
 * (complete_processed_file in 0002), fenced by the claim token. Returns the
 * bucket charged — "free" | "monthly" | "topup" | "overage" — or null if the
 * claim was lost, in which case nothing was recorded or charged.
 */
export async function completeFile(userId, fileId, claim, result, { freeLimit, monthlyLimit }) {
  const { data, error } = await supabase.rpc("complete_processed_file", {
    p_user_id: userId,
    p_file_id: fileId,
    p_claimed_at: claim,
    p_new_name: result.newName,
    p_tags: result.tags,
    p_destination_id: result.destinationId ?? null,
    p_destination_name: result.destinationName ?? null,
    p_free_limit: freeLimit,
    p_monthly_limit: monthlyLimit,
  });

  if (error) throw new Error(`Failed to record result: ${error.message}`);
  return data ?? null;
}

/** Returns false if the claim was lost and nothing was recorded. */
export async function recordFailure(userId, fileId, claim, message) {
  const update = supabase
    .from("processed_files")
    .update({ status: "failed", error_message: message, processed_at: new Date().toISOString() });
  const { data, error } = await ownedBy(update, userId, fileId, claim).select("file_id");

  if (error) throw new Error(`Failed to record failure: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

// Keeps `in (...)` filters well under PostgREST's URL length limit.
const ID_BATCH = 100;

function batches(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += ID_BATCH) out.push(ids.slice(i, i + ID_BATCH));
  return out;
}

/** Map of file_id → { status, claimed_at } for the given files; ids with no row are simply absent. */
export async function getStatuses(userId, fileIds) {
  const statuses = new Map();
  for (const ids of batches(fileIds)) {
    const { data, error } = await supabase
      .from("processed_files")
      .select("file_id, status, claimed_at")
      .eq("user_id", userId)
      .in("file_id", ids);

    if (error) throw new Error(`Failed to load file statuses: ${error.message}`);
    for (const row of data ?? []) statuses.set(row.file_id, row);
  }
  return statuses;
}

/** Frees failed and orphaned "processing" claims so those files can be attempted again. */
export async function releaseFailed(userId, fileIds) {
  for (const ids of batches(fileIds)) {
    const failed = await supabase
      .from("processed_files")
      .delete()
      .eq("user_id", userId)
      .eq("status", "failed")
      .in("file_id", ids);
    if (failed.error) throw new Error(`Failed to release failed files: ${failed.error.message}`);

    const stale = await supabase
      .from("processed_files")
      .delete()
      .eq("user_id", userId)
      .eq("status", "processing")
      .lt("claimed_at", staleCutoffIso())
      .in("file_id", ids);
    if (stale.error) throw new Error(`Failed to release stale claims: ${stale.error.message}`);
  }
}

export async function listRecent(userId, { limit = 50, processId } = {}) {
  let query = supabase
    .from("processed_files")
    .select(
      "file_id, original_name, new_name, tags, status, error_message, processed_at, claimed_at, process_id, destination_name",
    )
    .eq("user_id", userId);
  if (processId) query = query.eq("process_id", processId);

  const { data, error } = await query.order("processed_at", { ascending: false, nullsFirst: false }).limit(limit);

  if (error) throw new Error(`Failed to list activity: ${error.message}`);
  return data ?? [];
}
