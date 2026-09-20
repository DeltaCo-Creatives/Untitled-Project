import { HttpError } from "../utils/httpError.js";

// ponytail: per-instance in-memory Map (no dependency) — bounded because every write sweeps
// out expired entries across all keys, not just the caller's. A multi-instance backend would
// need a shared store (Redis) instead; DigitalOcean App Platform runs this as one instance today.

/**
 * Sliding-window rate limiter middleware factory.
 *
 * `key(req)` picks the bucket (defaults to `req.ip`); `windowMs`/`max` set the budget. Once a
 * key's budget for the trailing window is spent, the next call throws HttpError(429, ...,
 * { code: "rate_limited" }) via `next(err)`, for `errorHandler` to turn into the response.
 *
 * Cross-agent contract: this signature (`{ windowMs, max, key? }`, returning a normal Express
 * (req, res, next) middleware) is depended on by app.js and by routes/beta.routes.js — keep it
 * stable.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = "Too many requests. Try again in a bit." } = {}) {
  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const cutoff = now - windowMs;

    for (const [k, timestamps] of hits) {
      const kept = timestamps.filter((t) => t > cutoff);
      if (kept.length === 0) hits.delete(k);
      else hits.set(k, kept);
    }

    const id = key(req);
    const timestamps = hits.get(id) ?? [];
    if (timestamps.length >= max) {
      return next(new HttpError(429, message, { code: "rate_limited" }));
    }
    timestamps.push(now);
    hits.set(id, timestamps);
    next();
  };
}
