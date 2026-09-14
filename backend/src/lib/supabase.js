import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/**
 * Service-role client: bypasses RLS, so it must never be exposed to the
 * browser. All client-side reads go through the anon key + RLS policies
 * defined in supabase/migrations/0001_init.sql.
 */
export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
