import { Router } from "express";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { signState, verifyState } from "../utils/crypto.js";
import { isAllowedFrontendOrigin } from "../utils/origins.js";
import { buildConsentUrl, exchangeCode } from "../services/googleAuth.service.js";
import { claimGrant, parkGrant } from "../services/driveConnect.service.js";
import { disconnectDrive } from "../services/driveWatch.service.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * Drive authorization is a separate grant from Supabase login: the pipeline
 * runs while the user is away, so it needs its own offline refresh token.
 */
router.post("/google/start", requireAuth, (req, res) => {
  // The browser session lives on whichever frontend origin started this, so
  // return there. Signed into the state, so the callback can trust it.
  const origin = req.header("Origin");
  const returnTo = isAllowedFrontendOrigin(origin) ? origin : env.frontend.url;
  const state = signState({ userId: req.user.id, returnTo });
  res.json({ authUrl: buildConsentUrl(state) });
});

// Hit by Google's redirect, so it cannot carry a bearer token. The signed state
// proves we issued the request, but not who finished the consent screen, so the
// grant is only parked here and claimed by the signed-in user (POST /google/complete).
router.get("/google/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  let payload;
  try {
    payload = verifyState(state);
  } catch (err) {
    logger.warn("Rejected OAuth callback", { reason: err.message });
    const reason = oauthError ? String(oauthError) : "invalid_state";
    return res.redirect(`${env.frontend.url}/connect?error=${encodeURIComponent(reason)}`);
  }

  const { userId } = payload;
  const frontend = isAllowedFrontendOrigin(payload.returnTo) ? payload.returnTo : env.frontend.url;

  if (oauthError) {
    return res.redirect(`${frontend}/connect?error=${encodeURIComponent(oauthError)}`);
  }

  try {
    const tokens = await exchangeCode(code);
    const pendingId = parkGrant(userId, tokens.refresh_token);
    res.redirect(`${frontend}/connect?pending=${encodeURIComponent(pendingId)}`);
  } catch (err) {
    logger.error("OAuth code exchange failed", { userId, reason: err.message });
    res.redirect(`${frontend}/connect?error=exchange_failed`);
  }
});

/** Stores the parked Drive grant, only for the signed-in user who started the flow. */
router.post("/google/complete", requireAuth, async (req, res) => {
  const pendingId = req.body?.pending;
  if (typeof pendingId !== "string" || !pendingId) {
    throw new HttpError(400, "Missing the connection id.", { code: "invalid_request" });
  }
  await claimGrant(pendingId, req.user.id);
  res.json({ connected: true });
});

router.delete("/google", requireAuth, async (req, res) => {
  await disconnectDrive(req.user.id);
  res.json({ disconnected: true });
});

export default router;
