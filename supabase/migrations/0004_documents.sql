-- DriveTag AI — 0004: document work processes, per-kind credits, plan families
-- Run in the Supabase SQL Editor AFTER 0001-0003 and BEFORE deploying the backend
-- that uses it (see backend/README.md). Safe to re-run.
--
-- Additive on purpose: the currently deployed backend — which calls image_usage,
-- the 9-arg complete_processed_file, grant_image_credits and save_work_process
-- without a "kind" key — keeps working unchanged after this runs. It only ever
-- reads/writes the image_* and topup_balance columns, all of which are untouched
-- here; every new column has a default and every new/changed function preserves
-- the old signature and behaviour for callers that don't pass a kind.
--
-- Zero-Retention: still no file bytes anywhere; only names, tags and counts.

begin;

-- --------------------------------------------------------------- work_processes
-- A process's kind is fixed at creation (see save_work_process below) and decides
-- which files it will ever claim (image or document), never both.
alter table public.work_processes
  add column if not exists kind text not null default 'image' check (kind in ('image', 'document'));

-- ---------------------------------------------------------------- processed_files
alter table public.processed_files
  add column if not exists kind text not null default 'image' check (kind in ('image', 'document'));

-- ------------------------------------------------------------------ subscriptions
-- Documents get their own free/monthly/top-up buckets, mirroring the image ones.
alter table public.subscriptions
  add column if not exists free_documents_used integer not null default 0 check (free_documents_used >= 0),
  add column if not exists period_documents_used integer not null default 0 check (period_documents_used >= 0),
  add column if not exists document_topup_balance integer not null default 0 check (document_topup_balance >= 0);

-- Plan families: Free, plus Images / Documents / Images+Documents × Creator/Studio/Enterprise.
-- Ids and limits live only in backend/src/config/plans.js (PLAN_ORDER); this constraint just
-- has to keep matching that list.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in (
    'free', 'creator', 'studio', 'enterprise',
    'docs-creator', 'docs-studio', 'docs-enterprise',
    'complete-creator', 'complete-studio', 'complete-enterprise'
  ));

-- ------------------------------------------------------ image_credit_grants
-- Was image-only; now logs top-up grants of both kinds. Table name predates
-- documents — keep it, renaming would break the live backend's function bodies.
alter table public.image_credit_grants
  add column if not exists kind text not null default 'image' check (kind in ('image', 'document'));

comment on table public.image_credit_grants is
  'Audit trail for top-up credit grants of both kinds (image and document). '
  'The running balance lives on subscriptions.topup_balance / document_topup_balance; '
  'every change to either goes through grant_credits(). Table name predates documents '
  '— keep it, renaming would break the live backend''s function bodies.';

-- ---------------------------------------------------------------- usage_snapshot
-- Read-only usage snapshot covering both kinds, same period-rollover display rule
-- as image_usage (kept untouched below — the live backend still calls it).
create or replace function public.usage_snapshot(p_user_id uuid)
returns table (
  plan text,
  status text,
  period_start timestamptz,
  period_end timestamptz,
  free_images_used integer,
  period_images_used integer,
  topup_balance integer,
  free_documents_used integer,
  period_documents_used integer,
  document_topup_balance integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  select s.plan,
         s.status,
         bp.period_start,
         bp.period_end,
         s.free_images_used,
         case when s.period_start = bp.period_start then s.period_images_used else 0 end,
         s.topup_balance,
         s.free_documents_used,
         case when s.period_start = bp.period_start then s.period_documents_used else 0 end,
         s.document_topup_balance
    from public.subscriptions s
   cross join lateral public.billing_period(coalesce(s.period_anchor, s.created_at), now()) bp
   where s.user_id = p_user_id;
$$;

-- ------------------------------------------------------- complete_processed_file_v2
-- Same claim fence and locking as v1 (below), generalized to charge either kind's
-- buckets. Records processed_files.kind alongside the v1 columns.
create or replace function public.complete_processed_file_v2(
  p_user_id uuid,
  p_file_id text,
  p_claimed_at timestamptz,
  p_new_name text,
  p_tags jsonb,
  p_destination_id uuid,
  p_destination_name text,
  p_kind text,
  p_free_limit integer,
  p_monthly_limit integer
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_period record;
  v_bucket text;
  v_free_used integer;
  v_period_used integer;
  v_topup integer;
begin
  if p_kind not in ('image', 'document') then
    raise exception 'invalid_kind: %', p_kind;
  end if;

  perform 1
     from public.processed_files pf
    where pf.user_id = p_user_id
      and pf.file_id = p_file_id
      and pf.status = 'processing'
      and pf.claimed_at = p_claimed_at
      for update;
  if not found then
    return null;
  end if;

  select * into v_sub from public.subscriptions s where s.user_id = p_user_id for update;

  if not found then
    v_bucket := 'overage';
  else
    select * into v_period
      from public.billing_period(coalesce(v_sub.period_anchor, v_sub.created_at), now());
    if v_sub.period_start is distinct from v_period.period_start then
      v_sub.period_start := v_period.period_start;
      v_sub.period_images_used := 0;
      v_sub.period_documents_used := 0;
    end if;

    if p_kind = 'image' then
      v_free_used := v_sub.free_images_used;
      v_period_used := v_sub.period_images_used;
      v_topup := v_sub.topup_balance;
    else
      v_free_used := v_sub.free_documents_used;
      v_period_used := v_sub.period_documents_used;
      v_topup := v_sub.document_topup_balance;
    end if;

    if v_free_used < p_free_limit then
      v_bucket := 'free';
      v_free_used := v_free_used + 1;
    elsif v_period_used < p_monthly_limit then
      v_bucket := 'monthly';
      v_period_used := v_period_used + 1;
    elsif v_topup > 0 then
      v_bucket := 'topup';
      v_topup := v_topup - 1;
    else
      -- Only reachable when two backend instances overlap mid-deploy; never under-report usage.
      v_bucket := 'overage';
      if p_monthly_limit > 0 then
        v_period_used := v_period_used + 1;
      else
        v_free_used := v_free_used + 1;
      end if;
    end if;

    if p_kind = 'image' then
      v_sub.free_images_used := v_free_used;
      v_sub.period_images_used := v_period_used;
      v_sub.topup_balance := v_topup;
    else
      v_sub.free_documents_used := v_free_used;
      v_sub.period_documents_used := v_period_used;
      v_sub.document_topup_balance := v_topup;
    end if;

    update public.subscriptions s
       set free_images_used = v_sub.free_images_used,
           period_start = v_sub.period_start,
           period_images_used = v_sub.period_images_used,
           topup_balance = v_sub.topup_balance,
           free_documents_used = v_sub.free_documents_used,
           period_documents_used = v_sub.period_documents_used,
           document_topup_balance = v_sub.document_topup_balance
     where s.user_id = p_user_id;
  end if;

  update public.processed_files pf
     set new_name = p_new_name,
         tags = p_tags,
         destination_id = p_destination_id,
         destination_name = p_destination_name,
         credit_bucket = v_bucket,
         kind = p_kind,
         status = 'completed',
         processed_at = now()
   where pf.user_id = p_user_id
     and pf.file_id = p_file_id;

  return v_bucket;
end;
$$;

-- --------------------------------------------------------- complete_processed_file (v1)
-- Unchanged signature and behaviour for the currently deployed backend, with one
-- addition: when the period rolls it also resets period_documents_used, so a stale
-- document count can't carry across a period boundary during the deploy window.
create or replace function public.complete_processed_file(
  p_user_id uuid,
  p_file_id text,
  p_claimed_at timestamptz,
  p_new_name text,
  p_tags jsonb,
  p_destination_id uuid,
  p_destination_name text,
  p_free_limit integer,
  p_monthly_limit integer
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_period record;
  v_bucket text;
begin
  perform 1
     from public.processed_files pf
    where pf.user_id = p_user_id
      and pf.file_id = p_file_id
      and pf.status = 'processing'
      and pf.claimed_at = p_claimed_at
      for update;
  if not found then
    return null;
  end if;

  select * into v_sub from public.subscriptions s where s.user_id = p_user_id for update;

  if not found then
    v_bucket := 'overage';
  else
    select * into v_period
      from public.billing_period(coalesce(v_sub.period_anchor, v_sub.created_at), now());
    if v_sub.period_start is distinct from v_period.period_start then
      v_sub.period_start := v_period.period_start;
      v_sub.period_images_used := 0;
      v_sub.period_documents_used := 0; -- new: keep the document counter in step with the same period roll
    end if;

    if v_sub.free_images_used < p_free_limit then
      v_bucket := 'free';
      v_sub.free_images_used := v_sub.free_images_used + 1;
    elsif v_sub.period_images_used < p_monthly_limit then
      v_bucket := 'monthly';
      v_sub.period_images_used := v_sub.period_images_used + 1;
    elsif v_sub.topup_balance > 0 then
      v_bucket := 'topup';
      v_sub.topup_balance := v_sub.topup_balance - 1;
    else
      -- Only reachable when two backend instances overlap mid-deploy; the
      -- pipeline checks credits before starting. Never under-report usage.
      v_bucket := 'overage';
      if p_monthly_limit > 0 then
        v_sub.period_images_used := v_sub.period_images_used + 1;
      else
        v_sub.free_images_used := v_sub.free_images_used + 1;
      end if;
    end if;

    update public.subscriptions s
       set free_images_used = v_sub.free_images_used,
           period_start = v_sub.period_start,
           period_images_used = v_sub.period_images_used,
           topup_balance = v_sub.topup_balance,
           period_documents_used = v_sub.period_documents_used
     where s.user_id = p_user_id;
  end if;

  update public.processed_files pf
     set new_name = p_new_name,
         tags = p_tags,
         destination_id = p_destination_id,
         destination_name = p_destination_name,
         credit_bucket = v_bucket,
         status = 'completed',
         processed_at = now()
   where pf.user_id = p_user_id
     and pf.file_id = p_file_id;

  return v_bucket;
end;
$$;

-- ------------------------------------------------------------------- admin_set_plan
-- Unchanged signature. On a plan change (or an explicit restart) also resets
-- period_documents_used, alongside the existing period_images_used reset.
create or replace function public.admin_set_plan(
  p_email text,
  p_plan text,
  p_status text default 'active',
  p_restart_period boolean default false
)
returns public.subscriptions
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_row public.subscriptions;
begin
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(p_email);
  if v_user_id is null then
    raise exception 'No DriveTag user with email %', p_email;
  end if;

  insert into public.subscriptions as s (user_id, plan, status, period_anchor)
  values (v_user_id, p_plan, p_status, now())
  on conflict (user_id) do update
     set plan = excluded.plan,
         status = excluded.status,
         period_anchor = case when s.plan is distinct from excluded.plan or p_restart_period
                              then now() else s.period_anchor end,
         period_start = case when s.plan is distinct from excluded.plan or p_restart_period
                             then null else s.period_start end,
         period_images_used = case when s.plan is distinct from excluded.plan or p_restart_period
                                   then 0 else s.period_images_used end,
         period_documents_used = case when s.plan is distinct from excluded.plan or p_restart_period
                                      then 0 else s.period_documents_used end
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------- grant_credits
-- Generalizes grant_image_credits to either kind. Same rollback-on-negative-balance
-- behaviour: a removal below zero violates the balance check and rolls back the
-- log row too, because both writes happen in the same function call.
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
  v_balance integer;
begin
  if p_kind not in ('image', 'document') then
    raise exception 'invalid_kind: %', p_kind;
  end if;

  insert into public.subscriptions (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  insert into public.image_credit_grants (user_id, kind, amount, reason, source, provider_reference)
  values (p_user_id, p_kind, p_amount, p_reason, p_source, p_reference);

  if p_kind = 'image' then
    update public.subscriptions s
       set topup_balance = s.topup_balance + p_amount
     where s.user_id = p_user_id
    returning s.topup_balance into v_balance;
  else
    update public.subscriptions s
       set document_topup_balance = s.document_topup_balance + p_amount
     where s.user_id = p_user_id
    returning s.document_topup_balance into v_balance;
  end if;

  return v_balance;
end;
$$;

-- Unchanged signature; now delegates to grant_credits so there is one code path.
create or replace function public.grant_image_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_source text default 'manual',
  p_reference text default null
)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return public.grant_credits(p_user_id, 'image', p_amount, p_reason, p_source, p_reference);
end;
$$;

-- Owner helper for the SQL editor, mirroring admin_grant_credits:
--   select public.admin_grant_document_credits('client@example.com', 500, 'Pack 500, invoice #12');
create or replace function public.admin_grant_document_credits(p_email text, p_amount integer, p_reason text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id from auth.users u where lower(u.email) = lower(p_email);
  if v_user_id is null then
    raise exception 'No DriveTag user with email %', p_email;
  end if;

  return public.grant_credits(v_user_id, 'document', p_amount, p_reason, 'manual', null);
end;
$$;

-- ------------------------------------------------------------------- save_work_process
-- Unchanged signature. On insert stores kind (default 'image' when the caller omits
-- it, so the live backend — which never sends kind — keeps creating image processes).
-- On update, a kind key that disagrees with the stored kind is rejected: a process's
-- kind never changes once created.
create or replace function public.save_work_process(
  p_user_id uuid,
  p_process_id uuid,
  p_process jsonb,
  p_destinations jsonb,
  p_max_processes integer
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_dest jsonb;
  v_dest_id uuid;
  v_position integer := 0;
  v_existing_kind text;
begin
  if jsonb_typeof(p_destinations) is distinct from 'array' then
    raise exception 'destinations_must_be_array';
  end if;
  if (select count(*) from jsonb_array_elements(p_destinations) e
       where coalesce((e ->> 'is_fallback')::boolean, false)) <> 1 then
    raise exception 'exactly_one_fallback';
  end if;
  -- A repeated id would update one row twice, and the later entry's is_fallback would win.
  if (select count(e ->> 'id') <> count(distinct e ->> 'id')
        from jsonb_array_elements(p_destinations) e
       where coalesce(e ->> 'id', '') <> '') then
    raise exception 'duplicate_destination_id';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('work_processes:' || p_user_id::text, 0));

  if p_process_id is null then
    if (select count(*) from public.work_processes wp where wp.user_id = p_user_id) >= p_max_processes then
      raise exception 'process_limit_reached';
    end if;

    insert into public.work_processes (
      user_id, name, raw_folder_id, raw_folder_name, master_folder_id, master_folder_name,
      rename_template, instructions, tag_fields, timezone, enabled, kind
    )
    values (
      p_user_id,
      p_process ->> 'name',
      p_process ->> 'raw_folder_id',
      p_process ->> 'raw_folder_name',
      p_process ->> 'master_folder_id',
      p_process ->> 'master_folder_name',
      p_process ->> 'rename_template',
      coalesce(p_process ->> 'instructions', ''),
      coalesce(p_process -> 'tag_fields', '[]'::jsonb),
      coalesce(p_process ->> 'timezone', 'UTC'),
      coalesce((p_process ->> 'enabled')::boolean, true),
      coalesce(p_process ->> 'kind', 'image')
    )
    returning id into v_id;
  else
    if p_process ? 'kind' then
      select wp.kind into v_existing_kind
        from public.work_processes wp
       where wp.id = p_process_id and wp.user_id = p_user_id;

      if v_existing_kind is null then
        raise exception 'process_not_found';
      end if;
      if (p_process ->> 'kind') is distinct from v_existing_kind then
        raise exception 'process_kind_immutable';
      end if;
    end if;

    update public.work_processes wp
       set name = p_process ->> 'name',
           raw_folder_id = p_process ->> 'raw_folder_id',
           raw_folder_name = p_process ->> 'raw_folder_name',
           master_folder_id = p_process ->> 'master_folder_id',
           master_folder_name = p_process ->> 'master_folder_name',
           rename_template = p_process ->> 'rename_template',
           instructions = coalesce(p_process ->> 'instructions', ''),
           tag_fields = coalesce(p_process -> 'tag_fields', '[]'::jsonb),
           timezone = coalesce(p_process ->> 'timezone', wp.timezone),
           enabled = coalesce((p_process ->> 'enabled')::boolean, wp.enabled)
     where wp.id = p_process_id
       and wp.user_id = p_user_id
    returning wp.id into v_id;

    if v_id is null then
      raise exception 'process_not_found';
    end if;
  end if;

  delete from public.process_destinations d
   where d.process_id = v_id
     and d.id not in (
       select (e ->> 'id')::uuid
         from jsonb_array_elements(p_destinations) e
        where coalesce(e ->> 'id', '') <> ''
     );

  -- Park survivors on unique placeholder names so renames and swaps between
  -- destinations can't trip the unique indexes halfway through the loop.
  update public.process_destinations d
     set name = d.id::text, is_fallback = false
   where d.process_id = v_id;

  for v_dest in select e.value from jsonb_array_elements(p_destinations) e loop
    v_dest_id := null;

    if coalesce(v_dest ->> 'id', '') <> '' then
      update public.process_destinations d
         set name = v_dest ->> 'name',
             description = coalesce(v_dest ->> 'description', ''),
             folder_id = v_dest ->> 'folder_id',
             folder_name = v_dest ->> 'folder_name',
             position = v_position,
             is_fallback = coalesce((v_dest ->> 'is_fallback')::boolean, false)
       where d.id = (v_dest ->> 'id')::uuid
         and d.process_id = v_id
      returning d.id into v_dest_id;
    end if;

    if v_dest_id is null then
      insert into public.process_destinations (
        process_id, user_id, name, description, folder_id, folder_name, position, is_fallback
      )
      values (
        v_id,
        p_user_id,
        v_dest ->> 'name',
        coalesce(v_dest ->> 'description', ''),
        v_dest ->> 'folder_id',
        v_dest ->> 'folder_name',
        v_position,
        coalesce((v_dest ->> 'is_fallback')::boolean, false)
      );
    end if;

    v_position := v_position + 1;
  end loop;

  -- Backstop for the invariant the pipeline relies on; raising rolls the whole save back.
  if (select count(*) from public.process_destinations d where d.process_id = v_id and d.is_fallback) <> 1 then
    raise exception 'exactly_one_fallback';
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------------------- grants
-- New functions default to EXECUTE granted to PUBLIC; lock that down the same way
-- 0002 does. complete_processed_file, grant_image_credits, save_work_process and
-- admin_set_plan keep the privileges 0002 already gave them — CREATE OR REPLACE
-- FUNCTION preserves existing grants for an unchanged signature.
revoke all on function public.usage_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.complete_processed_file_v2(uuid, text, timestamptz, text, jsonb, uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, text, integer, text, text, text) from public, anon, authenticated;

grant execute on function public.usage_snapshot(uuid) to service_role;
grant execute on function public.complete_processed_file_v2(uuid, text, timestamptz, text, jsonb, uuid, text, text, integer, integer) to service_role;
grant execute on function public.grant_credits(uuid, text, integer, text, text, text) to service_role;

-- SQL editor only (owner), not callable through the API at all — same as admin_set_plan / admin_grant_credits.
revoke all on function public.admin_grant_document_credits(text, integer, text) from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------- schema_migrations
insert into public.schema_migrations (version) values ('0004_documents') on conflict do nothing;

commit;
