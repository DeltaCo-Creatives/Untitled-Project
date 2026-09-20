import { supabase } from "../lib/supabase.js";

/**
 * Plan and usage (both image and document credits) for one user, with both monthly
 * counters already rolled over to the current billing period (see usage_snapshot in
 * 0004). Null when the user has no subscription row yet.
 */
export async function getUsage(userId) {
  const { data, error } = await supabase.rpc("usage_snapshot", { p_user_id: userId }).maybeSingle();

  if (error) throw new Error(`Failed to load usage: ${error.message}`);
  return data;
}

/**
 * A readable message when the database is missing migration 0002 or 0004, or null.
 * Called once at boot so a deploy that ran before the migration says so. Checks 0002
 * first (image_usage), since 0004 builds on it and a missing 0002 is the more basic
 * problem.
 */
export async function schemaProblem() {
  const zeroUuid = "00000000-0000-0000-0000-000000000000";

  const { error: usageError } = await supabase.rpc("image_usage", { p_user_id: zeroUuid });
  if (usageError) {
    return `The database is missing supabase/migrations/0002_work_processes.sql (${usageError.message}). Run it in the Supabase SQL editor.`;
  }

  const { error: snapshotError } = await supabase.rpc("usage_snapshot", { p_user_id: zeroUuid });
  if (snapshotError) {
    return `The database is missing supabase/migrations/0004_documents.sql (${snapshotError.message}). Run it in the Supabase SQL editor.`;
  }

  // 0005 last: without it the app still sorts files, but every beta route 500s and credit
  // removals fail with a raw constraint violation instead of a readable message.
  const { error: betaError } = await supabase.from("beta_signups").select("id").limit(1);
  if (betaError) {
    return `The database is missing supabase/migrations/0005_beta.sql (${betaError.message}). Run it in the Supabase SQL editor.`;
  }

  return null;
}
