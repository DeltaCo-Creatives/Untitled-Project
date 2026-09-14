import { supabase } from "../lib/supabase.js";
import { env } from "../config/env.js";

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

export async function getSubscription(userId) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load subscription: ${error.message}`);
  return data;
}

/** Called on first Drive connect so onboarding works before billing exists. */
export async function startTrialIfNew(userId) {
  const existing = await getSubscription(userId);
  if (existing) return existing;

  const trialEnds = new Date(Date.now() + env.trialDays * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({ user_id: userId, status: "trialing", trial_ends_at: trialEnds.toISOString() })
    .select()
    .single();

  if (error) throw new Error(`Failed to start trial: ${error.message}`);
  return data;
}

/**
 * Gate for the AI pipeline — checked before any Gemini spend. Fails closed:
 * no subscription row means no processing.
 */
export function isEntitled(subscription) {
  if (!subscription || !ACTIVE_STATUSES.has(subscription.status)) return false;

  if (subscription.status === "trialing") {
    return !subscription.trial_ends_at || new Date(subscription.trial_ends_at) > new Date();
  }
  return true;
}
