import { supabase } from "../lib/supabase.js";

export async function createChannel(channel) {
  const { data, error } = await supabase
    .from("drive_channels")
    .insert({
      user_id: channel.userId,
      channel_id: channel.channelId,
      resource_id: channel.resourceId,
      page_token: channel.pageToken,
      expires_at: channel.expiresAt,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save Drive channel: ${error.message}`);
  return data;
}

export async function getChannelByChannelId(channelId) {
  const { data, error } = await supabase
    .from("drive_channels")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error) throw new Error(`Failed to look up Drive channel: ${error.message}`);
  return data;
}

export async function getChannelForUser(userId) {
  const { data, error } = await supabase
    .from("drive_channels")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to look up Drive channel: ${error.message}`);
  return data;
}

export async function updatePageToken(channelId, pageToken) {
  const { error } = await supabase
    .from("drive_channels")
    .update({ page_token: pageToken })
    .eq("channel_id", channelId);

  if (error) throw new Error(`Failed to advance page token: ${error.message}`);
}

/**
 * Points a user's channel row at a newly opened channel, keeping its page_token.
 * Returns null if the row is gone (the user paused, or another renewal won).
 */
export async function replaceChannel(oldChannelId, { channelId, resourceId, expiresAt }) {
  const { data, error } = await supabase
    .from("drive_channels")
    .update({ channel_id: channelId, resource_id: resourceId, expires_at: expiresAt })
    .eq("channel_id", oldChannelId)
    .select()
    .maybeSingle();

  if (error) throw new Error(`Failed to replace Drive channel: ${error.message}`);
  return data;
}

/**
 * Removes the user's channel row and returns the row actually deleted, or null.
 * Keyed by user rather than channel id so a renewal swapping the channel id
 * mid-pause can't leave the renewed channel behind.
 */
export async function deleteChannelForUser(userId) {
  const { data, error } = await supabase
    .from("drive_channels")
    .delete()
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error) throw new Error(`Failed to delete Drive channel: ${error.message}`);
  return data;
}

/**
 * Polling-mode channels are rows with this resource_id instead of a Drive
 * resource: the auto-sync poller sweeps them because Google won't push to us.
 */
export const POLLING_RESOURCE_ID = "polling";

export function isPollingChannel(channel) {
  return channel?.resource_id === POLLING_RESOURCE_ID;
}

export async function listPollingChannels() {
  const { data, error } = await supabase
    .from("drive_channels")
    .select("*")
    .eq("resource_id", POLLING_RESOURCE_ID);

  if (error) throw new Error(`Failed to list polling channels: ${error.message}`);
  return data ?? [];
}

/** Live channels whose Drive-issued expiration falls within the given window. */
export async function listExpiringChannels(beforeIso) {
  const { data, error } = await supabase
    .from("drive_channels")
    .select("*")
    .neq("resource_id", POLLING_RESOURCE_ID)
    .lt("expires_at", beforeIso);

  if (error) throw new Error(`Failed to list expiring channels: ${error.message}`);
  return data ?? [];
}
