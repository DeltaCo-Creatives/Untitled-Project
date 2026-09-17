import { Router } from "express";
import { publicPlansPayload } from "../config/plans.js";

const router = Router();

/** Public: the pricing section and upgrade screens render from this, so limits live in one place. */
router.get("/", (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(publicPlansPayload());
});

export default router;
