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

/** Like optional(), but only for a positive integer — an unusable value (0, negative, non-numeric) falls back. */
function optionalPositiveInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3001")),

  gemini: {
    apiKey: required("GEMINI_API_KEY"),
    model: optional("GEMINI_MODEL", "gemini-3.6-flash"),
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

  // When > 0, a Drive watch that Google refuses (e.g. no public verified webhook
  // domain, as on localhost) falls back to polling the changes feed this often.
  // 0 disables it: webhooks only.
  autoSync: {
    intervalSeconds: Number(optional("AUTO_SYNC_INTERVAL_SECONDS", "0")),
  },

  pipeline: {
    // Caps how many downloads+classifications run at once across every user's sweep or
    // "Organize now" (pipeline.service.js's aiJobSlots semaphore), since each holds an
    // image buffer in memory and Gemini has per-project rate limits.
    maxConcurrentAiJobs: optionalPositiveInt("MAX_CONCURRENT_AI_JOBS", 20),
  },
};

const LOCAL_ADDRESS = /localhost|127\.0\.0\.1/;

/**
 * Values that work locally but break a deployed app. They don't stop the
 * server (it can still serve health checks); server.js logs each one at boot.
 */
export function productionConfigProblems() {
  if (env.nodeEnv !== "production") return [];

  const problems = [];
  if (LOCAL_ADDRESS.test(env.frontend.url)) {
    problems.push(`FRONTEND_URL is ${env.frontend.url}; failed Drive connections will send users there.`);
  }
  if (env.frontend.corsOrigins.every((origin) => LOCAL_ADDRESS.test(origin))) {
    problems.push(
      `CORS_ORIGINS (${env.frontend.corsOrigins.join(", ")}) has no public origin, so the live site's API calls are refused.`,
    );
  }
  if (LOCAL_ADDRESS.test(env.google.oauthRedirectUri)) {
    problems.push(`GOOGLE_OAUTH_REDIRECT_URI is ${env.google.oauthRedirectUri}; Drive consent will return to a local address.`);
  }
  if (LOCAL_ADDRESS.test(env.google.webhookUrl) || /ngrok|your-subdomain/.test(env.google.webhookUrl)) {
    problems.push(`DRIVE_WEBHOOK_URL is ${env.google.webhookUrl}; Google can't deliver Drive notifications there.`);
  }
  return problems;
}

/**
 * Called by entrypoints that need the whole config (the server, the renewal
 * job). Deliberately not run at import time so a focused script — say
 * scripts/test-gemini.js — does not demand unrelated Supabase or OAuth vars.
 */
export function assertRequiredEnv() {
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Add them to backend/.env (every variable is listed in backend/README.md).",
    );
  }
}
