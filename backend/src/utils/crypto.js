import crypto from "node:crypto";
import { env } from "../config/env.js";

if (!/^[0-9a-fA-F]{64}$/.test(env.security.tokenEncryptionKey)) {
  throw new Error(
    "TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate one with:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

const KEY = Buffer.from(env.security.tokenEncryptionKey, "hex");
const IV_BYTES = 12;

/**
 * AES-256-GCM. Google refresh tokens are long-lived credentials for a user's
 * Drive, so they are encrypted before they reach Postgres — a database leak
 * alone must not hand over Drive access.
 */
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decrypt(payload) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const authTag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const ciphertext = raw.subarray(IV_BYTES + 16);

  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/**
 * Signed, expiring state for the Google OAuth redirect. Carries the user id
 * across the consent hop without a session cookie, and proves on callback that
 * we issued the request (CSRF protection).
 */
export function signState(payload, ttlSeconds = 600) {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.security.oauthStateSecret)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifyState(state) {
  const [body, signature] = String(state).split(".");
  if (!body || !signature) throw new Error("Malformed OAuth state");

  const expected = crypto
    .createHmac("sha256", env.security.oauthStateSecret)
    .update(body)
    .digest("base64url");

  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (Date.now() > payload.exp) throw new Error("Expired OAuth state");
  return payload;
}
