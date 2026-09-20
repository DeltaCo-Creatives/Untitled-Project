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
