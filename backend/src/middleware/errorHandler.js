import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// Express 5 forwards rejected async handlers here automatically.
export function errorHandler(err, req, res, next) {
  logger.error("Unhandled request error", {
    method: req.method,
    path: req.path,
    reason: err.message,
  });

  res.status(err.status || 500).json({
    error: env.nodeEnv === "production" ? "Internal server error" : err.message,
  });
}
