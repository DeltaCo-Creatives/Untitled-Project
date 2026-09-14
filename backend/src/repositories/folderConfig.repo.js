import { supabase } from "../lib/supabase.js";

export async function getFolderConfig(userId) {
  const { data, error } = await supabase
    .from("folder_configs")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load folder config: ${error.message}`);
  return data;
}

export async function saveFolderConfig(userId, config) {
  const { data, error } = await supabase
    .from("folder_configs")
    .upsert({
      user_id: userId,
      raw_folder_id: config.rawFolderId,
      raw_folder_name: config.rawFolderName,
      destination_folder_id: config.destinationFolderId,
      destination_folder_name: config.destinationFolderName,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to save folder config: ${error.message}`);
  return data;
}
