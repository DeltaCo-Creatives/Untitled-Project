import { Router } from "express";

const router = Router();

/**
 * Google Drive push notifications arrive as a POST with an empty body and
 * all the useful information in X-Goog-* headers. Google requires a fast
 * 2xx ack, so this handler just validates + logs the notification; fetching
 * the changed file and running it through the Gemini pipeline is wired up
 * as a separate follow-up step once Loop A (Drive OAuth) exists.
 */
router.post("/", (req, res) => {
  const channelToken = req.header("X-Goog-Channel-Token");

  if (channelToken !== process.env.GOOGLE_DRIVE_WEBHOOK_TOKEN) {
    console.warn("Rejected Drive webhook: channel token mismatch");
    return res.sendStatus(403);
  }

  const notification = {
    channelId: req.header("X-Goog-Channel-ID"),
    resourceId: req.header("X-Goog-Resource-ID"),
    resourceState: req.header("X-Goog-Resource-State"), // "sync" | "add" | "update" | ...
    resourceUri: req.header("X-Goog-Resource-URI"),
  };

  console.log("Drive push notification received:", notification);

  res.sendStatus(200);
});

export default router;
