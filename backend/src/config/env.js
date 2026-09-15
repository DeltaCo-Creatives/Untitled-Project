import dotenv from "dotenv";

// Loaded here, in a module every consumer imports, so env vars are populated
// before any service module body evaluates. ESM hoists imports, so calling
// dotenv.config() in an entrypoint's body would run *after* its imports.
dotenv.config({ quiet: true });

const missing = [];

function required(name) {
  const value = process.env[name];
  if (!value) {
    missing.push(name);
    return "";
  }
  return value;
}

function optional(name, fallback) {
  return process.env[name] || fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3001")),

  gemini: {
    apiKey: required("GEMINI_API_KEY"),
    model: optional("GEMINI_MODEL", "gemini-2.5-flash"),
    // Images are sent inline to Gemini (never uploaded to the Files API, which
    // would retain them). Inline requests are capped well under 20MB.
    maxImageBytes: Number(optional("MAX_IMAGE_BYTES", String(18 * 1024 * 1024))),
  },

  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    oauthRedirectUri: required("GOOGLE_OAUTH_REDIRECT_URI"),
    // Public HTTPS URL Drive posts notifications to (ngrok in dev).
    webhookUrl: required("DRIVE_WEBHOOK_URL"),
    // Shared secret echoed back by Drive as X-Goog-Channel-Token.
    webhookToken: required("GOOGLE_DRIVE_WEBHOOK_TOKEN"),
  },

  supabase: {
    url: required("SUPABASE_URL"),
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    // Only used by scripts/get-token.js; the server itself never needs it.
    anonKey: optional("SUPABASE_ANON_KEY", ""),
  },

  security: {
    tokenEncryptionKey: required("TOKEN_ENCRYPTION_KEY"),
    oauthStateSecret: required("OAUTH_STATE_SECRET"),
  },

  frontend: {
    url: optional("FRONTEND_URL", "http://localhost:5173"),
    corsOrigins: optional("CORS_ORIGINS", "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  // Days of access granted on first Drive connect, before a paid subscription
  // is required. Change this one value to alter trial policy.
  trialDays: Number(optional("TRIAL_DAYS", "14")),
};

/**
 * Called by entrypoints that need the whole config (the server, the renewal
 * job). Deliberately not run at import time so a focused script — say
 * scripts/test-gemini.js — does not demand unrelated Supabase or OAuth vars.
 */
export function assertRequiredEnv() {
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Copy backend/.env.example to backend/.env and fill them in (see ForDev.md).",
    );
  }
}
