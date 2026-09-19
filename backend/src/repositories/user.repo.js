import { supabase } from "../lib/supabase.js";

/**
 * Deletes the Supabase auth user. Every app table with user data references
 * auth.users(id) on delete cascade, directly or (process_destinations, via
 * work_processes) transitively — see supabase/migrations/0001_init.sql and
 * 0002_work_processes.sql — so this removes the account's rows too.
 */
export async function deleteAuthUser(userId) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Failed to delete user: ${error.message}`);
}
