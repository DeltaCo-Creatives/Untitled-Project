import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import driveWebhookRouter from "./routes/driveWebhook.routes.js";
import authRouter from "./routes/auth.routes.js";
import driveRouter from "./routes/drive.routes.js";
import accountRouter from "./routes/account.routes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // behind DigitalOcean App Platform's load balancer
  app.use(cors({ origin: env.frontend.corsOrigins }));
  app.use(express.json());

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // Public, authenticated by the X-Goog-Channel-Token shared secret.
  app.use("/webhook/drive", driveWebhookRouter);

  app.use("/api/auth", authRouter);
  app.use("/api/drive", driveRouter);
  app.use("/api", accountRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
