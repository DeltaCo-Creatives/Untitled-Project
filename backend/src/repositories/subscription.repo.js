import { supabase } from "../lib/supabase.js";

export async function getSubscription(userId) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load subscription: ${error.message}`);
  return data;
}

/**
 * Called on first Drive connect. A missing row means no processing at all (the
 * pipeline fails closed), so every connected user gets the Free plan row; the
 * table defaults supply plan 'free' and status 'active'.
 */
export async function ensureSubscription(userId) {
  const { error } = await supabase
    .from("subscriptions")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

  if (error) throw new Error(`Failed to create subscription: ${error.message}`);
}

/**
 * Grants (or, with a negative amount, claws back) one kind of top-up credit via the
 * grant_credits SQL function (0002/0005/0006). Passing a `reference` makes the grant
 * idempotent at the database level: a webhook redelivered with the same reference is
 * a no-op that returns the current balance rather than granting twice.
 *
 * Throws an Error with `.code === "insufficient_credits"` when a negative amount
 * (a refund clawback) would take the balance below zero — the caller decides whether
 * that's fine to swallow (it is, for a refund: the customer already spent it).
 */
export async function grantCredits({ userId, kind, amount, reason, source = "manual", reference = null }) {
  const { data, error } = await supabase.rpc("grant_credits", {
    p_user_id: userId,
    p_kind: kind,
    p_amount: amount,
    p_reason: reason,
    p_source: source,
    p_reference: reference,
  });

  if (error) {
    if (/insufficient_credits/i.test(error.message)) {
      const insufficient = new Error(error.message);
      insufficient.code = "insufficient_credits";
      throw insufficient;
    }
    throw new Error(`Failed to grant credits: ${error.message}`);
  }
  return data;
}

/**
 * Upserts a user's subscription row from a payment-provider event via
 * apply_subscription_state (0006). Idempotent by construction: re-applying the same
 * event converges to the same row rather than accumulating state.
 */
export async function applySubscriptionState({
  userId,
  plan,
  status,
  provider,
  customerId,
  subscriptionId,
  periodEnd,
  restartPeriod,
}) {
  const { data, error } = await supabase
    .rpc("apply_subscription_state", {
      p_user_id: userId,
      p_plan: plan,
      p_status: status,
      p_provider: provider,
      p_customer_id: customerId,
      p_subscription_id: subscriptionId,
      p_period_end: periodEnd,
      p_restart_period: restartPeriod,
    })
    .maybeSingle();

  if (error) throw new Error(`Failed to apply subscription state: ${error.message}`);
  return data;
}

/**
 * Resolves an email to { id, email, createdAt } via admin_user_lookup (0007), or null
 * when no account has that address. Case-insensitive. This is an email-enumeration
 * surface (the SQL function's own comment says so) — service_role only, and callable
 * here only through admin-gated routes (requireAuth + requireAdmin).
 */
export async function adminUserLookup(email) {
  const { data, error } = await supabase.rpc("admin_user_lookup", { p_email: email }).maybeSingle();
  if (error) throw new Error(`Failed to look up user: ${error.message}`);
  if (!data) return null;
  return { id: data.user_id, email: data.email, createdAt: data.created_at };
}

/**
 * Sets a user's plan/status via admin_set_plan_by_id (0007) — the backend-reachable
 * sibling of admin_set_plan (0002, email-keyed, SQL-editor-only). Delegates entirely to
 * apply_subscription_state with a NULL provider and null provider ids, so it validates
 * p_plan/p_status and applies the same period_anchor rule as every other write path. Null, not
 * 'manual': apply_subscription_state coalesces it, so an existing Lemon Squeezy subscriber keeps
 * 'lemonsqueezy' instead of being relabelled every time the owner nudges their plan.
 * Returns the updated subscriptions row.
 */
export async function adminSetPlanById(userId, plan, status, restartPeriod) {
  const { data, error } = await supabase
    .rpc("admin_set_plan_by_id", { p_user_id: userId, p_plan: plan, p_status: status, p_restart_period: restartPeriod })
    .maybeSingle();

  if (error) {
    if (/invalid_plan/i.test(error.message)) {
      const invalid = new Error(error.message);
      invalid.code = "invalid_plan";
      throw invalid;
    }
    if (/invalid_status/i.test(error.message)) {
      const invalid = new Error(error.message);
      invalid.code = "invalid_status";
      throw invalid;
    }
    throw new Error(`Failed to set plan: ${error.message}`);
  }
  return data;
}
