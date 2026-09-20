// Run from backend/: node --test --experimental-test-module-mocks test/schema-problem.test.js
//
// Unit tests for usage.repo.js's schemaProblem(): it must tell a genuinely missing migration
// apart from an auth/permission-shaped Supabase error (wrong, rotated or disabled
// SUPABASE_SERVICE_ROLE_KEY) instead of blaming every RPC failure on a missing migration.
// Mocks ../src/lib/supabase.js the way beta.test.js mocks it, so this never touches a real
// database. The mock's rpc()/from() read mutable `state` so each test can shape a different
// error without re-mocking the module (ESM caches the import).
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

const state = { rpcErrors: {}, fromError: null };

const supabase = {
  rpc: async (name) => ({ data: null, error: state.rpcErrors[name] ?? null }),
  from: () => ({
    select: () => ({
      limit: async () => ({ data: null, error: state.fromError }),
    }),
  }),
};

mock.module("../src/lib/supabase.js", { namedExports: { supabase } });

const { schemaProblem } = await import("../src/repositories/usage.repo.js");

beforeEach(() => {
  state.rpcErrors = {};
  state.fromError = null;
});

test("returns null when every check succeeds", async () => {
  assert.equal(await schemaProblem(), null);
});

test("a genuine missing-function error on image_usage names 0002", async () => {
  state.rpcErrors.image_usage = { message: "Could not find the function public.image_usage(uuid) in the schema cache", code: "PGRST202" };
  const message = await schemaProblem();
  assert.match(message, /0002_work_processes\.sql/);
  assert.match(message, /Could not find the function/);
});

test("a genuine missing-function error on usage_snapshot names 0004", async () => {
  state.rpcErrors.usage_snapshot = { message: "Could not find the function public.usage_snapshot(uuid) in the schema cache", code: "PGRST202" };
  const message = await schemaProblem();
  assert.match(message, /0004_documents\.sql/);
});

test("a missing beta_signups table names 0005", async () => {
  state.fromError = { message: 'relation "public.beta_signups" does not exist', code: "42P01" };
  const message = await schemaProblem();
  assert.match(message, /0005_beta\.sql/);
});

test("a genuine missing-function error on apply_subscription_state names 0006", async () => {
  state.rpcErrors.apply_subscription_state = {
    message: "Could not find the function public.apply_subscription_state(uuid, text, text, text, text, text, timestamptz, boolean) in the schema cache",
    code: "PGRST202",
  };
  const message = await schemaProblem();
  assert.match(message, /0006_checkout\.sql/);
});

test("apply_subscription_state existing but rejecting the probe's invalid plan is not a schema problem", async () => {
  // The probe deliberately passes an invalid plan id, so a function that exists always raises
  // invalid_plan and can never write a row. That error means the migration is present.
  state.rpcErrors.apply_subscription_state = { message: "invalid_plan: __schema_probe__", code: "P0001" };
  assert.equal(await schemaProblem(), null);
});

test("a foreign-key error from apply_subscription_state is also not a schema problem", async () => {
  // Belt and braces: any error other than "no such function" means the function exists.
  state.rpcErrors.apply_subscription_state = {
    message: 'insert or update on table "subscriptions" violates foreign key constraint "subscriptions_user_id_fkey"',
    code: "23503",
  };
  assert.equal(await schemaProblem(), null);
});

test("an 'Invalid API key' error is reported as an auth problem, not a missing migration", async () => {
  state.rpcErrors.image_usage = { message: "Invalid API key", code: "401" };
  const message = await schemaProblem();
  assert.match(message, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(message, /is missing supabase\/migrations/);
});

test("auth-pattern matching is case-insensitive and covers JWT / legacy-keys / permission-denied wording", async () => {
  for (const msg of ["invalid api key", "JWT expired", "Legacy API keys are disabled", "permission denied for schema public", "Unauthorized"]) {
    state.rpcErrors = { image_usage: { message: msg, code: "401" } };
    const message = await schemaProblem();
    assert.match(message, /SUPABASE_SERVICE_ROLE_KEY/, `expected an auth message for: ${msg}`);
  }
});

test("an ordinary Postgres error that happens to occur later than image_usage still names its own migration", async () => {
  state.rpcErrors.usage_snapshot = { message: "function public.usage_snapshot(uuid) does not exist", code: "42883" };
  const message = await schemaProblem();
  assert.match(message, /0004_documents\.sql/);
  assert.doesNotMatch(message, /SUPABASE_SERVICE_ROLE_KEY/);
});
