import { supabase } from "../lib/supabase.js";

const TABLE = "app_settings";

/** Every stored setting row, unfiltered: [{ key, value, updated_at, updated_by }, ...]. */
export async function getAll() {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) throw new Error(`Failed to load app settings: ${error.message}`);
  return data ?? [];
}

/**
 * Upserts each entry's key/value, stamped with the acting admin's user id.
 * `entries` is [{ key, value }, ...] — already validated by the caller
 * (services/settings.service.js), never raw request input.
 */
export async function setMany(entries, adminUserId) {
  if (entries.length === 0) return;
  const rows = entries.map(({ key, value }) => ({
    key,
    value,
    updated_by: adminUserId,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "key" });
  if (error) throw new Error(`Failed to save app settings: ${error.message}`);
}

/** Deletes a key so the setting falls back to its environment variable again. */
export async function remove(key) {
  const { error } = await supabase.from(TABLE).delete().eq("key", key);
  if (error) throw new Error(`Failed to clear app setting: ${error.message}`);
}
