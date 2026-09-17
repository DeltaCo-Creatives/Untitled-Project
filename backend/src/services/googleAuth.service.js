import { google } from "googleapis";
import { env } from "../config/env.js";
import { getRefreshToken } from "../repositories/credentials.repo.js";

/**
 * Full `drive` scope is required, not the narrower `drive.file`: the product
 * must read images that *other people* drop into the watched folder, which a
 * per-file grant does not cover. This makes the app subject to Google's
 * restricted-scope verification — see ForDev.md.
 */
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

function newOAuthClient() {
  return new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.oauthRedirectUri,
  );
}

export function buildConsentUrl(state) {
  return newOAuthClient().generateAuthUrl({
    access_type: "offline", // required for a refresh token usable while the user is away
    prompt: "consent",
    include_granted_scopes: true,
    scope: DRIVE_SCOPES,
    state,
  });
}

export async function exchangeCode(code) {
  const { tokens } = await newOAuthClient().getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app's access and re-consent with prompt=consent.",
    );
  }
  return tokens;
}

/** An OAuth client for background work, hydrated from the stored refresh token. */
export async function getAuthedClient(userId) {
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) throw new Error(`No Google credentials stored for user ${userId}`);

  const client = newOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Revokes the stored grant at Google. Revoking the refresh token revokes the
 * whole grant; client.revokeCredentials() only works on an access token, which
 * a client hydrated from a refresh token doesn't hold, so it always threw.
 */
export async function revokeAccess(userId) {
  const refreshToken = await getRefreshToken(userId);
  if (!refreshToken) return;
  await revokeRefreshToken(refreshToken);
}

/** Revokes a grant DriveTag holds but never stored (e.g. a Drive connection nobody could claim). */
export async function revokeRefreshToken(refreshToken) {
  await newOAuthClient().revokeToken(refreshToken);
}
