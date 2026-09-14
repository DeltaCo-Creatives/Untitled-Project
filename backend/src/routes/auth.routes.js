import { Router } from "express";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { signState, verifyState } from "../utils/crypto.js";
import {
  buildConsentUrl,
  exchangeCode,
  DRIVE_SCOPES,
  revokeAccess,
} from "../services/googleAuth.service.js";
import { saveRefreshToken, deleteCredentials } from "../repositories/credentials.repo.js";
import { startTrialIfNew } from "../repositories/subscription.repo.js";
import { stopWatch } from "../services/driveWatch.service.js";
import { logger } from "../utils/logger.js";

const router = Router();

/**
 * Drive authorization is a separate grant from Supabase login: the pipeline
 * runs while the user is away, so it needs its own offline refresh token.
 */
router.post("/google/start", requireAuth, (req, res) => {
  const state = signState({ userId: req.user.id });
  res.json({ authUrl: buildConsentUrl(state) });
});

// Hit by Google's redirect, so it cannot carry a bearer token — the signed
// state parameter carries the user id and proves we issued the request.
router.get("/google/callback", async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`${env.frontend.url}/connect?error=${encodeURIComponent(oauthError)}`);
  }

  let userId;
  try {
    ({ userId } = verifyState(state));
  } catch (err) {
    logger.warn("Rejected OAuth callback", { reason: err.message });
    return res.redirect(`${env.frontend.url}/connect?error=invalid_state`);
  }

  try {
    const tokens = await exchangeCode(code);
    await saveRefreshToken(userId, tokens.refresh_token, DRIVE_SCOPES);
    await startTrialIfNew(userId);

    logger.info("Drive connected", { userId });
    res.redirect(`${env.frontend.url}/connect?connected=1`);
  } catch (err) {
    logger.error("OAuth code exchange failed", { userId, reason: err.message });
    res.redirect(`${env.frontend.url}/connect?error=exchange_failed`);
  }
});

router.delete("/google", requireAuth, async (req, res) => {
  await stopWatch(req.user.id);
  try {
    await revokeAccess(req.user.id);
  } catch (err) {
    logger.warn("Token revocation failed, deleting locally anyway", {
      userId: req.user.id,
      reason: err.message,
    });
  }
  await deleteCredentials(req.user.id);
  res.json({ disconnected: true });
});

export default router;
