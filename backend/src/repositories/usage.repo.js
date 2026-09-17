import { supabase } from "../lib/supabase.js";

/**
 * Plan and image usage for one user, with the monthly counter already rolled
 * over to the current billing period (see image_usage in 0002). Null when the
 * user has no subscription row yet.
 */
export async function getUsage(userId) {
  const { data, error } = await supabase.rpc("image_usage", { p_user_id: userId }).maybeSingle();

  if (error) throw new Error(`Failed to load image usage: ${error.message}`);
  return data;
}

/**
 * A readable message when the database is missing migration 0002, or null.
 * Called once at boot so a deploy that ran before the migration says so.
 */
export async function schemaProblem() {
  const { error } = await supabase.rpc("image_usage", { p_user_id: "00000000-0000-0000-0000-000000000000" });
  if (!error) return null;
  return `The database is missing supabase/migrations/0002_work_processes.sql (${error.message}). Run it in the Supabase SQL editor.`;
}
