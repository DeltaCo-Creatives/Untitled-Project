// Shared PGlite bootstrap for tests that exercise the real SQL migrations end to
// end (in-memory Postgres, no .env, no network). Stubs only what Supabase itself
// provides on every project — the `auth` schema, `auth.uid()`, and the anon /
// authenticated / service_role roles with Supabase's default table privileges —
// so the migration files under supabase/migrations/ run completely unmodified.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations");

const MIGRATION_FILES = [
  "0001_init.sql",
  "0002_work_processes.sql",
  "0003_cleanup.sql",
  "0004_documents.sql",
  "0005_beta.sql",
  "0006_checkout.sql",
  "0007_admin.sql",
];

// Mirrors Supabase's own project setup, not anything our migrations create:
// - anon/authenticated/service_role exist on every Supabase project already.
// - service_role has BYPASSRLS (that's the whole reason the backend "bypasses RLS").
// - All three roles get ALL privileges on every table by default (Supabase's own
//   default-privilege grants); RLS policies are what actually restrict anon/authenticated.
// - Postgres itself grants EXECUTE on every new function to PUBLIC by default, which
//   is exactly what each migration's own `revoke all ... from public, anon, authenticated`
//   statements undo — so nothing extra is needed here for functions.
// - service_role can also read auth.* directly on a real Supabase project (that's how
//   admin_user_lookup, 0007, is able to query auth.users under service_role — none of
//   0001-0006's functions needed this, since the ones that touch auth.users are all
//   SQL-editor-only, run as the table owner, never as service_role).
const BOOTSTRAP_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    -- Real Supabase's auth.users has this; admin_user_lookup (0007) reads it.
    created_at timestamptz not null default now()
  );
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  -- Deliberately NOT granting service_role access to auth.* here: real Supabase's defaults are
  -- not ours to assume, and admin_user_lookup is SECURITY DEFINER precisely so it never needs them.
  -- If a future function only passes because of a grant invented in this mock, it will fail in production.
`;

function readMigration(file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

/**
 * A fresh in-memory Postgres with 0001 -> 0002 -> 0003 -> 0004 -> 0005 -> 0006 ->
 * 0007 -> 0004 -> 0005 -> 0006 -> 0007 applied (the repeated 0004/0005/0006/0007
 * runs are the idempotency check: they must not error or change behaviour).
 */
export async function createTestDb() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP_SQL);
  for (const file of MIGRATION_FILES) {
    await db.exec(readMigration(file));
  }
  // Re-run the last four once more: must be a no-op, not an error.
  await db.exec(readMigration("0004_documents.sql"));
  await db.exec(readMigration("0005_beta.sql"));
  await db.exec(readMigration("0006_checkout.sql"));
  await db.exec(readMigration("0007_admin.sql"));
  return db;
}

let userCounter = 0;

/** Inserts a fresh auth.users row and returns its id. */
export async function createUser(db, email) {
  userCounter += 1;
  const { rows } = await db.query("insert into auth.users (email) values ($1) returning id;", [
    email ?? `user${userCounter}@example.com`,
  ]);
  return rows[0].id;
}

/**
 * Runs `fn` with the session's role switched to `role` (one of the Supabase roles),
 * then always resets back — even if `fn` throws, so a permission-denied test doesn't
 * leak role state into the next assertion.
 */
export async function withRole(db, role, fn) {
  await db.exec(`set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}

/** True when calling `fn` (typically a db.query(...) for a single RPC) throws a Postgres permission error. */
export async function isPermissionDenied(fn) {
  try {
    await fn();
    return false;
  } catch (err) {
    return err?.code === "42501";
  }
}
