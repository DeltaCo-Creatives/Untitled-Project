-- DriveTag AI — 0007: owner admin dashboard — settings table + admin-route helpers
-- Run in the Supabase SQL Editor AFTER 0001-0006 and BEFORE deploying the backend
-- that uses it (see backend/README.md). Safe to re-run.
--
-- Three independent pieces, all backing the owner-only admin API added this release:
--   1. app_settings: configuration only, never secrets (see the table comment for
--      why). Precedence for every setting is database -> environment variable ->
--      built-in default; deleting a key here just falls back to the environment
--      variable again.
--   2. admin_user_lookup: resolves an email to a user id/created_at without exposing
--      auth.users through PostgREST. An email-enumeration surface, so it is
--      service_role only, reached solely through admin-gated backend routes.
--   3. admin_set_plan_by_id: the backend-reachable sibling of admin_set_plan (0002),
--      which takes an email and stays SQL-editor-only (revoked from service_role).
--      This one takes a user id and delegates entirely to apply_subscription_state
--      (0006) instead of reimplementing its upsert: that function already validates
--      p_plan/p_status against the live table constraints (subscriptions_plan_check /
--      subscriptions_status_check) and applies the exact period_anchor rule (move it
--      on a restart, or when the plan actually changed). Duplicating either rule here
--      would only let the two paths drift apart, which would silently mis-bill
--      someone.
--
-- Zero-Retention: unaffected — no file bytes or extracted text involved here.

begin;

-- -------------------------------------------------------------------- app_settings
create table if not exists public.app_settings (
  key text primary key check (char_length(key) between 1 and 64),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.app_settings is
  'Configuration only, never secrets. The admin dashboard writes to this table from a '
  'browser session, so anything stored here is reachable by whoever holds an admin '
  'session — API keys, webhook secrets and encryption keys stay in environment '
  'variables (never as a row here). Precedence for a setting is: a row in this table '
  '(if present) -> the matching environment variable -> a built-in default. Deleting a '
  'key clears the override so the environment variable applies again.';

alter table public.app_settings enable row level security;
-- Intentionally no policies: backend-only table, like google_credentials.

-- delete is genuinely used, not dead privilege: clearing a key is how the owner
-- reverts a setting back to its environment-variable value.
grant select, insert, update, delete on public.app_settings to service_role;

drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------- admin_user_lookup
-- auth.users is not reachable through PostgREST; this resolves an email to a user id
-- for the admin "look up an account" screen. Case-insensitive; returns zero rows
-- (never an error) for an unknown address.
--
-- This is an email-enumeration surface: calling it lets the caller learn whether an
-- address has a DriveTag account. Grant to service_role only, and reach it solely
-- through admin-gated backend routes (requireAuth + requireAdmin) — never exposed as
-- a PostgREST RPC to anon/authenticated.
--
-- SECURITY DEFINER on purpose. Without it this runs as service_role, which would need its own
-- SELECT on auth.users — a Supabase platform default we cannot see from here and do not control.
-- Depending on it would be the worst kind of bug: the test suite grants it in the PGlite mock, so
-- everything passes locally and the lookup fails only in production. Running as the function owner
-- removes the dependency entirely. `set search_path` below is mandatory for a definer function —
-- without it a caller could shadow `auth` or `lower` and have this body run their code as the owner.
create or replace function public.admin_user_lookup(p_email text)
returns table (user_id uuid, email text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.email, u.created_at
    from auth.users u
   where lower(u.email) = lower(p_email);
$$;

revoke all on function public.admin_user_lookup(text) from public, anon, authenticated;
grant execute on function public.admin_user_lookup(text) to service_role;

-- ------------------------------------------------------------- admin_set_plan_by_id
create or replace function public.admin_set_plan_by_id(
  p_user_id uuid,
  p_plan text,
  p_status text default 'active',
  p_restart_period boolean default false
)
returns public.subscriptions
language sql
set search_path = public, pg_temp
as $$
  -- provider is passed NULL, not 'manual'. apply_subscription_state coalesces it, so null means
  -- "I have nothing new to say about who bills this account": a brand-new row is left with no
  -- provider (true — nobody is billing it), and an existing Lemon Squeezy subscriber keeps
  -- 'lemonsqueezy'. Writing 'manual' here would relabel a real paying subscriber as manual every
  -- time the owner nudged their plan, quietly corrupting the one column that says who to bill.
  select * from public.apply_subscription_state(
    p_user_id, p_plan, p_status, null, null, null, null, p_restart_period
  );
$$;

revoke all on function public.admin_set_plan_by_id(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_plan_by_id(uuid, text, text, boolean) to service_role;

-- ----------------------------------------------------------------- schema_migrations
insert into public.schema_migrations (version) values ('0007_admin') on conflict do nothing;

commit;
