// Run from backend/: node --test test/rate-limit.test.js
//
// Unit tests for middleware/rateLimit.js's sliding-window limiter, exercised directly against
// the (req, res, next) middleware it returns rather than through an Express app — it has no
// external dependencies to mock. beta.test.js separately covers it wired into the real beta
// route (validate-before-limit ordering, the exact 5/hour budget).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../src/middleware/rateLimit.js";

// Calls the middleware once and returns whatever it passed to next() (undefined on success,
// an HttpError on rejection) — the middleware is synchronous, so this needs no promisifying.
function call(middleware, ip) {
  let result;
  middleware({ ip }, {}, (err) => {
    result = err;
  });
  return result;
}

test("allows up to max requests for a key, then 429s with rate_limited", () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 3 });
  assert.equal(call(middleware, "1.1.1.1"), undefined);
  assert.equal(call(middleware, "1.1.1.1"), undefined);
  assert.equal(call(middleware, "1.1.1.1"), undefined);

  const err = call(middleware, "1.1.1.1");
  assert.equal(err.status, 429);
  assert.equal(err.code, "rate_limited");
});

test("two different keys never share a budget", () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 1 });
  assert.equal(call(middleware, "1.1.1.1"), undefined);
  assert.equal(call(middleware, "2.2.2.2"), undefined, "a different key gets its own fresh budget");
  assert.ok(call(middleware, "1.1.1.1"), "the first key's budget was already spent");
});

test("a custom key() is used instead of req.ip", () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 1, key: (req) => req.userId });
  let err1, err2;
  middleware({ ip: "same-ip", userId: "a" }, {}, (e) => (err1 = e));
  middleware({ ip: "same-ip", userId: "b" }, {}, (e) => (err2 = e));
  assert.equal(err1, undefined);
  assert.equal(err2, undefined, "different userId keys despite sharing an IP");
});

test("the window expiring lets a caller back in", async () => {
  const middleware = rateLimit({ windowMs: 30, max: 1 });
  assert.equal(call(middleware, "3.3.3.3"), undefined);
  assert.ok(call(middleware, "3.3.3.3"), "budget spent within the window");

  await new Promise((resolve) => setTimeout(resolve, 45));

  assert.equal(call(middleware, "3.3.3.3"), undefined, "window rolled over, budget refreshed");
});

test("a custom message is used on the thrown HttpError", () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 0, message: "custom message" });
  const err = call(middleware, "4.4.4.4");
  assert.equal(err.message, "custom message");
});

test("the message defaults to a generic one when not given", () => {
  const middleware = rateLimit({ windowMs: 60_000, max: 0 });
  const err = call(middleware, "5.5.5.5");
  assert.match(err.message, /too many requests/i);
});
