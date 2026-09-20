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

// Message-shaped like "invalid api key", a bad/expired JWT, "legacy API keys are disabled",
// or a plain permission/auth refusal — none of these mean a migration is missing, they mean
// SUPABASE_SERVICE_ROLE_KEY itself is wrong. Matched case-insensitively; this happened for real
// during a key rotation and sent the owner chasing an already-applied migration.
const AUTH_ERROR_PATTERN = /invalid api key|jwt|legacy api keys are disabled|permission denied|unauthorized/i;

// PostgREST's own "no such function/signature" error (code PGRST202) — the one case where an
// RPC error genuinely does mean a migration wasn't run.
function isMissingFunctionError(error) {
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

function describeSchemaError(error, migrationFile) {
  if (AUTH_ERROR_PATTERN.test(error.message ?? "")) {
    return `Supabase rejected the request (${error.message}). This is not a missing migration — check that SUPABASE_SERVICE_ROLE_KEY is correct and hasn't been rotated or disabled in the Supabase dashboard.`;
  }
  return `The database is missing supabase/migrations/${migrationFile} (${error.message}). Run it in the Supabase SQL editor.`;
}

/**
 * A readable message when the database is missing migration 0002, 0004, 0005 or 0006, or when
 * Supabase itself refused the request (a wrong/rotated/disabled service-role key), or null.
 * Called once at boot so a deploy that ran before the migration — or a bad key — says so.
 * Checks 0002 first (image_usage), since 0004 builds on it and a missing 0002 is the more
 * basic problem. An auth-shaped error surfaces on whichever check runs into it first, since a
 * bad key fails every call identically.
 */
export async function schemaProblem() {
  const zeroUuid = "00000000-0000-0000-0000-000000000000";

  const { error: usageError } = await supabase.rpc("image_usage", { p_user_id: zeroUuid });
  if (usageError) return describeSchemaError(usageError, "0002_work_processes.sql");

  const { error: snapshotError } = await supabase.rpc("usage_snapshot", { p_user_id: zeroUuid });
  if (snapshotError) return describeSchemaError(snapshotError, "0004_documents.sql");

  // 0005 next: without it the app still sorts files, but every beta route 500s and credit
  // removals fail with a raw constraint violation instead of a readable message.
  const { error: betaError } = await supabase.from("beta_signups").select("id").limit(1);
  if (betaError) return describeSchemaError(betaError, "0005_beta.sql");

  // 0006 last (checkout): apply_subscription_state writes, so it can't be probed with a
  // harmless read the way the functions above are. It is called with a deliberately INVALID
  // plan id, which subscriptions_plan_check rejects, so the insert can never succeed no matter
  // which user id is passed and nothing is ever persisted. (Relying on the user-id foreign key
  // instead would leave a boot-time write that only fails by luck.) A function that exists
  // therefore always errors; only PostgREST's own "no such function" error means the migration
  // is missing.
  const { error: checkoutError } = await supabase.rpc("apply_subscription_state", {
    p_user_id: zeroUuid,
    p_plan: "__schema_probe__",
    p_status: "active",
    p_provider: "schema_probe",
    p_customer_id: null,
    p_subscription_id: null,
    p_period_end: null,
    p_restart_period: false,
  });
  if (checkoutError && (AUTH_ERROR_PATTERN.test(checkoutError.message ?? "") || isMissingFunctionError(checkoutError))) {
    return describeSchemaError(checkoutError, "0006_checkout.sql");
  }

  return null;
}
