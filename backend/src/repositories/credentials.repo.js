import { supabase } from "../lib/supabase.js";
import { encrypt, decrypt } from "../utils/crypto.js";

export async function saveRefreshToken(userId, refreshToken, scopes) {
  const { error } = await supabase.from("google_credentials").upsert({
    user_id: userId,
    refresh_token_encrypted: encrypt(refreshToken),
    scopes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Failed to save Google credentials: ${error.message}`);
}

export async function getRefreshToken(userId) {
  const { data, error } = await supabase
    .from("google_credentials")
    .select("refresh_token_encrypted")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load Google credentials: ${error.message}`);
  return data ? decrypt(data.refresh_token_encrypted) : null;
}

/** Whether Drive is connected, and when the credential was last saved/refreshed — without decrypting the token. */
export async function getCredentialStatus(userId) {
  const { data, error } = await supabase.from("google_credentials").select("updated_at").eq("user_id", userId).maybeSingle();

  if (error) throw new Error(`Failed to load Google credential status: ${error.message}`);
  return { connected: Boolean(data), updatedAt: data?.updated_at ?? null };
}

export async function deleteCredentials(userId) {
  const { error } = await supabase.from("google_credentials").delete().eq("user_id", userId);
  if (error) throw new Error(`Failed to delete Google credentials: ${error.message}`);
}
