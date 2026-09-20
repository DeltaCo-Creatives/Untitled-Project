import { supabase } from "../lib/supabase.js";

const TABLE = "beta_signups";

/**
 * Upserts on the `unique (email)` constraint (0005). `email` must already be
 * trimmed + lower-cased by the caller (services/beta.service.js) — both the
 * constraint and the app's notion of "already signed up" depend on it.
 *
 * A repeat submission only updates name/work_type/weekly_volume/consent_at.
 * added_to_google, added_at and notes aren't in this payload, so PostgREST's
 * upsert never touches them.
 */
export async function upsertSignup({ email, name, workType, weeklyVolume, consentAt }) {
  const { error } = await supabase.from(TABLE).upsert(
    { email, name, work_type: workType || null, weekly_volume: weeklyVolume || null, consent_at: consentAt },
    { onConflict: "email" },
  );

  if (error) throw new Error(`Failed to save beta signup: ${error.message}`);
}

/** Every column, newest first. Used by the admin table and the CSV export. */
export async function listSignups({ limit = 500 } = {}) {
  const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(limit);

  if (error) throw new Error(`Failed to list beta signups: ${error.message}`);
  return data ?? [];
}

/** Sets added_to_google (added_at to now, or null when un-marking). Returns the updated row, or null if id is unknown. */
export async function setAdded(id, added) {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ added_to_google: added, added_at: added ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(`Failed to update beta signup: ${error.message}`);
  return data ?? null;
}

/** Returns the updated row, or null if id is unknown. */
export async function setNotes(id, notes) {
  const { data, error } = await supabase.from(TABLE).update({ notes }).eq("id", id).select("*").maybeSingle();

  if (error) throw new Error(`Failed to update beta signup notes: ${error.message}`);
  return data ?? null;
}

/** Lower-cased lookup; returns the row or null. */
export async function findByEmail(email) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("email", String(email ?? "").trim().toLowerCase())
    .maybeSingle();

  if (error) throw new Error(`Failed to load beta signup: ${error.message}`);
  return data ?? null;
}
