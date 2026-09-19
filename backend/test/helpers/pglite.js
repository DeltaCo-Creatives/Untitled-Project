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

const MIGRATION_FILES = ["0001_init.sql", "0002_work_processes.sql", "0003_cleanup.sql", "0004_documents.sql"];

// Mirrors Supabase's own project setup, not anything our migrations create:
// - anon/authenticated/service_role exist on every Supabase project already.
// - service_role has BYPASSRLS (that's the whole reason the backend "bypasses RLS").
// - All three roles get ALL privileges on every table by default (Supabase's own
//   default-privilege grants); RLS policies are what actually restrict anon/authenticated.
// - Postgres itself grants EXECUTE on every new function to PUBLIC by default, which
//   is exactly what each migration's own `revoke all ... from public, anon, authenticated`
//   statements undo — so nothing extra is needed here for functions.
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
    email text
  );
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
`;

function readMigration(file) {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

/**
 * A fresh in-memory Postgres with 0001 -> 0002 -> 0003 -> 0004 -> 0004 again applied
 * (the second 0004 run is the idempotency check: it must not error or change behaviour).
 */
export async function createTestDb() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP_SQL);
  for (const file of MIGRATION_FILES) {
    await db.exec(readMigration(file));
  }
  // Re-run 0004 once more: must be a no-op, not an error.
  await db.exec(readMigration("0004_documents.sql"));
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
