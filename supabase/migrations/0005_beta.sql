-- DriveTag AI — 0005: readable credit-grant errors + closed-beta signups
-- Run in the Supabase SQL Editor AFTER 0001-0004 and BEFORE deploying the backend
-- that uses it (see backend/README.md). Safe to re-run.
--
-- Two independent changes:
--   1. grant_credits raises a readable insufficient_credits error instead of a raw
--      check-constraint violation when a removal would take a balance below zero,
--      and does so BEFORE writing the audit-log row, so a refused grant leaves no
--      row in image_credit_grants. Same signature and same rollback-on-negative
--      behaviour; grant_image_credits and admin_grant_document_credits (which both
--      delegate to it) inherit the fix for free. No new owner helper is added here:
--      0002's admin_grant_credits (image) and 0004's admin_grant_document_credits
--      (document) already are the per-kind owner helpers this phase asked for.
--   2. beta_signups: the closed-beta interest list. Backend-only table, no
--      auth.users foreign key — see the comment on the table below for why.
--
-- Zero-Retention: unaffected — no file bytes or extracted text involved here.

begin;

-- ------------------------------------------------------------------ grant_credits
-- Fixes the reported bug: removing more credits than the balance holds used to
-- surface as a raw "violates check constraint ... subscriptions_document_topup_
-- balance_check" — technically correct (the call rolled back, nothing changed)
-- but unreadable: it names an internal constraint, not the actual balance.
-- Now the row is locked and the resulting balance computed up front, so a bad
-- removal is refused with a message naming the kind, the current balance and
-- the requested amount, before anything is written. CREATE OR REPLACE keeps the
-- execute grants 0004 already set (service_role only) because the signature is
-- unchanged.
create or replace function public.grant_credits(
  p_user_id uuid,
  p_kind text,
  p_amount integer,
  p_reason text,
  p_source text default 'manual',
  p_reference text default null
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_current integer;
  v_new integer;
begin
  if p_kind not in ('image', 'document') then
    raise exception 'invalid_kind: %', p_kind;
  end if;

  insert into public.subscriptions (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  -- Lock the row before reading the balance, so a concurrent charge or grant
  -- can't race the below-zero check below.
  if p_kind = 'image' then
    select s.topup_balance into v_current from public.subscriptions s where s.user_id = p_user_id for update;
  else
    select s.document_topup_balance into v_current from public.subscriptions s where s.user_id = p_user_id for update;
  end if;

  v_new := v_current + p_amount;
  if v_new < 0 then
    raise exception 'insufficient_credits: % top-up balance is %, cannot remove %', p_kind, v_current, abs(p_amount);
  end if;

  insert into public.image_credit_grants (user_id, kind, amount, reason, source, provider_reference)
  values (p_user_id, p_kind, p_amount, p_reason, p_source, p_reference);

  if p_kind = 'image' then
    update public.subscriptions s set topup_balance = v_new where s.user_id = p_user_id;
  else
    update public.subscriptions s set document_topup_balance = v_new where s.user_id = p_user_id;
  end if;

  return v_new;
end;
$$;

-- ------------------------------------------------------------------ beta_signups
-- Closed-beta interest list, collected while Google reviews the app.
create table if not exists public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 320),
  name text not null check (char_length(name) between 1 and 120),
  work_type text check (work_type is null or char_length(work_type) <= 60),
  weekly_volume text check (weekly_volume is null or char_length(weekly_volume) <= 40),
  consent_at timestamptz not null,
  added_to_google boolean not null default false,
  added_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The upsert target. PostgREST's .upsert(..., { onConflict: "email" }) can only
  -- target a plain unique constraint/index, never the functional lower(email) one
  -- below — so this constraint exists for it to target. The backend
  -- (betaSignup.repo.js) always stores the email already trimmed and lower-cased
  -- before writing, so every backend-written row already satisfies this uniquely.
  constraint beta_signups_email_unique unique (email)
);

-- Safety net, not the upsert target: catches a different-cased duplicate from a
-- row written outside that normalization (a direct SQL-editor insert, or a future
-- admin tool) that the plain constraint above wouldn't itself prevent.
create unique index if not exists beta_signups_email_key on public.beta_signups (lower(email));

-- No foreign key to auth.users: a signup happens before the person has a DriveTag
-- account — sometimes they never create one — so it must not depend on one, and
-- must survive account deletion, which is irrelevant to it.
alter table public.beta_signups enable row level security;
-- Intentionally no policies: backend-only table, like google_credentials.

-- No DELETE: nothing in the backend deletes a sign-up, so granting it would be an unused
-- write privilege on a table of personal data. The Privacy Policy's "we'll remove it on
-- request" is served by the owner running a DELETE in the SQL editor, where table ownership
-- bypasses these grants anyway (the statement is in DeveloperToDo.md §5). Add the grant in a
-- later migration if an admin delete button is ever built.
grant select, insert, update on public.beta_signups to service_role;

drop trigger if exists set_updated_at on public.beta_signups;
create trigger set_updated_at
  before update on public.beta_signups
  for each row execute function public.set_updated_at();

-- Owner helper for the SQL editor, mirroring admin_grant_document_credits:
--   select public.admin_mark_beta_added('client@example.com');
create or replace function public.admin_mark_beta_added(p_email text)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_found boolean;
begin
  update public.beta_signups
     set added_to_google = true,
         added_at = now()
   where lower(email) = lower(p_email)
  returning true into v_found;

  return coalesce(v_found, false);
end;
$$;

-- SQL editor only (owner), not callable through the API at all — same as admin_set_plan / admin_grant_document_credits.
revoke all on function public.admin_mark_beta_added(text) from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------- schema_migrations
insert into public.schema_migrations (version) values ('0005_beta') on conflict do nothing;

commit;
