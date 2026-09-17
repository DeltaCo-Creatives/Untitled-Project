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
