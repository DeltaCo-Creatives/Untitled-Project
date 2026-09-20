import express from "express";
import cors from "cors";
import helmet from "helmet";
import { isAllowedFrontendOrigin } from "./utils/origins.js";
import driveWebhookRouter from "./routes/driveWebhook.routes.js";
import lemonSqueezyWebhookRouter from "./routes/lemonSqueezyWebhook.routes.js";
import authRouter from "./routes/auth.routes.js";
import driveRouter from "./routes/drive.routes.js";
import accountRouter from "./routes/account.routes.js";
import plansRouter from "./routes/plans.routes.js";
import processesRouter from "./routes/processes.routes.js";
import betaRouter from "./routes/beta.routes.js";
import checkoutRouter from "./routes/checkout.routes.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

// Requests without an Origin header (curl, Google's webhook) aren't browser CORS requests.
function corsOrigin(origin, callback) {
  callback(null, !origin || isAllowedFrontendOrigin(origin));
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // behind DigitalOcean App Platform's load balancer

  // First, so its security headers wrap every response, including CORS refusals and
  // errors. contentSecurityPolicy is switched off explicitly: this is a JSON-only API on
  // its own subdomain with no HTML of its own to protect, so a CSP here would just be
  // dead weight, not a real defense — everything else in helmet's defaults still applies.
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(cors({ origin: corsOrigin }));
  // cors() answers preflights from allowed origins. A refused origin would otherwise fall
  // through to requireAuth and get a misleading 401 "Missing bearer token".
  app.use((req, res, next) => (req.method === "OPTIONS" ? res.sendStatus(204) : next()));

  // Mounted BEFORE express.json() and reads the raw body itself (routes/lemonSqueezyWebhook.
  // routes.js): the webhook's HMAC signature is computed over the exact request bytes, and
  // the global JSON parser below would consume and re-serialize them, silently breaking
  // every signature check. See the router for the rest of the verify-then-ack flow.
  app.use("/webhook/lemonsqueezy", lemonSqueezyWebhookRouter);

  app.use(express.json());

  // Loose app-wide budget so no single IP can hammer the API; scoped to /api so it never
  // touches either webhook path — Google and Lemon Squeezy legitimately burst, and
  // rate-limiting a payment webhook loses money.
  app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300 }));

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // Public, authenticated by the X-Goog-Channel-Token shared secret.
  app.use("/webhook/drive", driveWebhookRouter);

  app.use("/api/auth", authRouter);
  app.use("/api/drive", driveRouter);
  // Before accountRouter: its requireAuth runs for every /api/* request that reaches it,
  // which would put the public /api/plans behind a login.
  app.use("/api/plans", plansRouter);
  app.use("/api/processes", processesRouter);
  // Before accountRouter for the same reason: POST /api/beta/signups is public.
  app.use("/api/beta", betaRouter);
  app.use("/api/checkout", checkoutRouter);
  app.use("/api", accountRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
