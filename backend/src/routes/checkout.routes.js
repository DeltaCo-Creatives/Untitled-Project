import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { isConfigured, checkoutUrlFor } from "../services/lemonSqueezy.service.js";

const router = Router();

/** Signed-in user buys a plan or a top-up pack: returns a Lemon Squeezy checkout URL. */
router.post("/", requireAuth, async (req, res) => {
  if (!isConfigured()) {
    // Not thrown as an HttpError: errorHandler only exposes `code`/`details` for statuses
    // under 500 (5xx there means "unexpected"), but this 503 is deliberate and the frontend
    // needs `checkout_unconfigured` specifically to fall back to "Coming soon".
    return res.status(503).json({ error: "Checkout isn't set up yet.", code: "checkout_unconfigured" });
  }

  const { item, billing } = req.body ?? {};
  if (typeof item !== "string" || !item.trim()) {
    throw new HttpError(400, "item is required.", { code: "unknown_item" });
  }
  if (billing !== undefined && billing !== "monthly" && billing !== "yearly") {
    throw new HttpError(400, "billing must be 'monthly' or 'yearly'.", { code: "unknown_item" });
  }

  const url = checkoutUrlFor({ itemId: item, billing, userId: req.user.id, email: req.user.email });
  if (!url) {
    throw new HttpError(400, "That plan or pack isn't available to buy.", { code: "unknown_item" });
  }

  // Never the email or the URL: the URL itself carries both the user id and the email.
  logger.info("Checkout link created", { event: "checkout_link", item });
  res.json({ url });
});

export default router;
