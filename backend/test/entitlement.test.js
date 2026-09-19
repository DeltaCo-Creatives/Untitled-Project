// Run from backend/: node --test --experimental-test-module-mocks test/entitlement.test.js
//
// Unit tests for entitlement.service.js's plan/credit math: per-kind (image/document) limits and
// remaining-credit arithmetic, and which plan applies. usage.repo.js is mocked, so this never
// touches Supabase. pipeline-workers.test.js covers how pipeline.service.js *uses* this module
// (it mocks entitlement.service.js wholesale to isolate the pipeline's own logic); this file
// exercises the real implementation.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { PLANS } from "../src/config/plans.js";

let usageForUser = null;
const getUsage = mock.fn(async () => usageForUser);
mock.module("../src/repositories/usage.repo.js", { namedExports: { getUsage } });

const { effectivePlan, limitsFor, remainingCredits, loadEntitlement } = await import("../src/services/entitlement.service.js");

test("effectivePlan resolves every plan id in plans.js while active or past_due", () => {
  for (const id of Object.keys(PLANS)) {
    const status = id === "free" ? "active" : "past_due"; // paid ids need a paid status; free ignores status
    assert.equal(effectivePlan({ plan: id, status }).id, id);
  }
});

test("effectivePlan falls back to Free for an unknown plan id, a lapsed paid plan, or no usage row", () => {
  assert.equal(effectivePlan({ plan: "not-a-real-plan", status: "active" }).id, "free");
  assert.equal(effectivePlan({ plan: "creator", status: "canceled" }).id, "free");
  assert.equal(effectivePlan({ plan: "complete-studio", status: undefined }).id, "free");
  assert.equal(effectivePlan(null).id, "free");
  assert.equal(effectivePlan(undefined).id, "free");
});

test("effectivePlan keeps a paid plan while past_due (grace period)", () => {
  assert.equal(effectivePlan({ plan: "docs-studio", status: "past_due" }).id, "docs-studio");
});

test("limitsFor returns per-kind free/monthly limits", () => {
  assert.deepEqual(limitsFor(PLANS["complete-creator"]), {
    image: { freeLimit: 0, monthlyLimit: 1000 },
    document: { freeLimit: 0, monthlyLimit: 500 },
  });
  assert.deepEqual(limitsFor(PLANS.free), {
    image: { freeLimit: 100, monthlyLimit: 0 },
    document: { freeLimit: 25, monthlyLimit: 0 },
  });
});

test("remainingCredits sums free leftover + period leftover + top-up balance, per kind", () => {
  const plan = PLANS["complete-creator"]; // monthlyImages 1000, monthlyDocuments 500, no free allowance
  const usage = {
    free_images_used: 0,
    period_images_used: 400,
    topup_balance: 50,
    free_documents_used: 0,
    period_documents_used: 100,
    document_topup_balance: 10,
  };
  assert.deepEqual(remainingCredits(usage, plan), { image: 650, document: 410 });
});

test("remainingCredits never goes negative per bucket, and zeroes out with no usage row", () => {
  const plan = PLANS.free;
  const overUsed = {
    free_images_used: 500, // over the 100 lifetime limit
    period_images_used: 0,
    topup_balance: 0,
    free_documents_used: 500, // over the 25 lifetime limit
    period_documents_used: 0,
    document_topup_balance: 0,
  };
  assert.deepEqual(remainingCredits(overUsed, plan), { image: 0, document: 0 });
  assert.deepEqual(remainingCredits(null, plan), { image: 0, document: 0 });
});

test("loadEntitlement is exhausted only when both kinds are at zero", async () => {
  usageForUser = {
    plan: "creator", // images only: no document allowance at all
    status: "active",
    period_start: "2026-01-01",
    period_end: "2026-02-01",
    free_images_used: 0,
    period_images_used: 1000, // fully used
    topup_balance: 0,
    free_documents_used: 0,
    period_documents_used: 0,
    document_topup_balance: 0,
  };
  const entitlement = await loadEntitlement("user-1");
  assert.equal(entitlement.credits.image, 0);
  assert.equal(entitlement.credits.document, 0);
  assert.equal(entitlement.exhausted, true, "both kinds are at zero");

  usageForUser = { ...usageForUser, document_topup_balance: 5 };
  const withDocPack = await loadEntitlement("user-1");
  assert.equal(withDocPack.credits.document, 5);
  assert.equal(withDocPack.exhausted, false, "not exhausted while the other kind still has credits");
});

test("loadEntitlement returns null when there's no subscription row (fail closed)", async () => {
  usageForUser = null;
  assert.equal(await loadEntitlement("user-2"), null);
});
