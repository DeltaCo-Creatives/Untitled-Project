import { env } from "../config/env.js";

const LOCAL_DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Frontend origins we answer CORS for and are willing to redirect back to.
 * Any local port is allowed outside production: Vite hopping from 5173 to 5174
 * otherwise surfaces as a bare "Failed to fetch". Production stays on the allowlist.
 */
export function isAllowedFrontendOrigin(origin) {
  if (!origin) return false;
  if (env.frontend.corsOrigins.includes(origin)) return true;
  return env.nodeEnv !== "production" && LOCAL_DEV_ORIGIN.test(origin);
}
