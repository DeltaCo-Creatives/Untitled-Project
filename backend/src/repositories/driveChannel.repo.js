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

export async function deleteChannel(channelId) {
  const { error } = await supabase.from("drive_channels").delete().eq("channel_id", channelId);
  if (error) throw new Error(`Failed to delete Drive channel: ${error.message}`);
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
