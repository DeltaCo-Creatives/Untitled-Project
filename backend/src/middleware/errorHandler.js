import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export function notFound(req, res) {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}

// Express 5 forwards rejected async handlers here automatically.
export function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  // Only errors marked safe (HttpError, body-parser's malformed JSON) keep their
  // message in production. Google API errors also carry a status but aren't.
  const expose = status < 500 && err.expose === true;

  (status < 500 ? logger.warn : logger.error)("Request error", {
    method: req.method,
    path: req.path,
    status,
    reason: err.message,
  });

  const body = {
    error: expose || env.nodeEnv !== "production" ? err.message : "Internal server error",
  };
  if (expose && err.code) body.code = err.code;
  if (expose && err.details) body.details = err.details;

  res.status(status).json(body);
}
