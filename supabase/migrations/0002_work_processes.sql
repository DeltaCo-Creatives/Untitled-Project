-- DriveTag AI — 0002: AI work processes, plans and image usage
-- Run in the Supabase SQL Editor AFTER 0001 and BEFORE deploying the backend
-- that uses it (see backend/README.md). Safe to re-run: schema changes are idempotent,
-- and the one-time data backfill at the bottom only runs on first application.
--
-- Additive on purpose: the previously deployed backend keeps working against
-- this schema during the deploy window. It still inserts 'trialing'
-- subscriptions and writes folder_configs; the trigger at the bottom mirrors
-- those writes into work_processes. 0003_cleanup.sql removes the legacy parts
-- once the new backend and frontend are live.
--
-- Plan limits are NOT stored here. They live in backend/src/config/plans.js
-- and are passed into the functions below, so pricing stays in one file.
--
-- Zero-Retention: still no image bytes anywhere; only names, tags and counts.

begin;

-- ----------------------------------------------------------- work_processes
create table if not exists public.work_processes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  raw_folder_id text not null,
  raw_folder_name text,
  master_folder_id text not null,
  master_folder_name text,
  rename_template text not null default '{destination}_{subject}'
    check (char_length(rename_template) between 1 and 200),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  tag_fields jsonb not null default '[]'::jsonb
    check (case when jsonb_typeof(tag_fields) = 'array'
                then jsonb_array_length(tag_fields) <= 10 else false end),
  timezone text not null default 'UTC',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_processes_raw_not_master check (raw_folder_id <> master_folder_id),
  -- One process per Raw folder, so every new image has exactly one owner.
  constraint work_processes_unique_raw unique (user_id, raw_folder_id),
  -- Target of process_destinations' composite foreign key.
  constraint work_processes_id_user unique (id, user_id)
);

alter table public.work_processes enable row level security;

drop policy if exists "read own processes" on public.work_processes;
create policy "read own processes"
  on public.work_processes for select
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.work_processes;
create trigger set_updated_at
  before update on public.work_processes
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------- process_destinations
create table if not exists public.process_destinations (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null,
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  folder_id text not null,
  folder_name text,
  position integer not null default 0,
  -- The "Unsorted" destination for images that fit none of the others.
  is_fallback boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- user_id (used by RLS) can never disagree with the owning process.
  constraint process_destinations_process_fk foreign key (process_id, user_id)
    references public.work_processes (id, user_id) on delete cascade
);

create unique index if not exists process_destinations_one_fallback
  on public.process_destinations (process_id) where is_fallback;

create unique index if not exists process_destinations_unique_name
  on public.process_destinations (process_id, lower(name));

alter table public.process_destinations enable row level security;

drop policy if exists "read own destinations" on public.process_destinations;
create policy "read own destinations"
  on public.process_destinations for select
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.process_destinations;
create trigger set_updated_at
  before update on public.process_destinations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------- processed_files
alter table public.processed_files
  add column if not exists process_id uuid references public.work_processes (id) on delete set null,
  -- Deliberately no foreign key: nothing reads it back (destination_name is the snapshot users see), and a key
  -- would make completing a file race with deleting its destination and make every destination delete scan this table.
  add column if not exists destination_id uuid,
  add column if not exists destination_name text,
  add column if not exists credit_bucket text
    check (credit_bucket in ('free', 'monthly', 'topup', 'overage'));

create index if not exists processed_files_process_idx
  on public.processed_files (process_id);

-- unique (user_id, file_id) stays as it is: a file is sorted automatically at
-- most once, whichever process's Raw folder it later lands in.

-- ------------------------------------------------------------ subscriptions
alter table public.subscriptions
  add column if not exists free_images_used integer not null default 0 check (free_images_used >= 0),
  add column if not exists period_anchor timestamptz,
  add column if not exists period_start timestamptz,
  add column if not exists period_images_used integer not null default 0 check (period_images_used >= 0),
  add column if not exists topup_balance integer not null default 0 check (topup_balance >= 0);

-- The 14-day trial becomes the Free plan (100 lifetime images, no time limit).
update public.subscriptions set plan = 'free'
  where plan is null or plan not in ('free', 'creator', 'studio', 'enterprise');
update public.subscriptions set status = 'active' where status = 'trialing';

alter table public.subscriptions alter column plan set default 'free';
alter table public.subscriptions alter column plan set not null;
alter table public.subscriptions alter column status set default 'active';

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('free', 'creator', 'studio', 'enterprise'));
-- 'trialing' stays legal until 0003: the old backend still inserts it on first
-- Drive connect during the deploy window. The new backend treats it as Free.

-- ------------------------------------------------------ image_credit_grants
-- Audit trail for top-up credits. topup_balance on subscriptions is the
-- running balance; every change to it goes through grant_image_credits.
create table if not exists public.image_credit_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (char_length(reason) between 1 and 200),
  source text not null default 'manual' check (source in ('manual', 'purchase', 'adjustment')),
  -- Lets a future payment webhook grant each purchase exactly once.
  provider_reference text unique,
  created_at timestamptz not null default now()
);

create index if not exists image_credit_grants_user_idx
  on public.image_credit_grants (user_id, created_at desc);

alter table public.image_credit_grants enable row level security;

drop policy if exists "read own credit grants" on public.image_credit_grants;
create policy "read own credit grants"
  on public.image_credit_grants for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------- functions
-- The billing period containing p_at. Always anchor + n months (UTC), so a
-- Jan 31 anchor goes Feb 28 → Mar 31 instead of drifting to the 28th.
create or replace function public.billing_period(p_anchor timestamptz, p_at timestamptz default now())
returns table (period_start timestamptz, period_end timestamptz)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_anchor timestamp := p_anchor at time zone 'UTC';
  v_at timestamp := p_at at time zone 'UTC';
  v_months integer;
begin
  if p_anchor is null or p_at is null then
    return;
  end if;

  v_months := greatest(0,
      (extract(year from v_at)::int - extract(year from v_anchor)::int) * 12
    + (extract(month from v_at)::int - extract(month from v_anchor)::int));
  if v_months > 0 and v_anchor + make_interval(months => v_months) > v_at then
    v_months := v_months - 1;
  end if;

  period_start := (v_anchor + make_interval(months => v_months)) at time zone 'UTC';
  period_end := (v_anchor + make_interval(months => v_months + 1)) at time zone 'UTC';
  return next;
end;
$$;

-- Read-only usage snapshot, with the monthly counter shown as 0 once its period has passed.
create or replace function public.image_usage(p_user_id uuid)
returns table (
  plan text,
  status text,
  free_images_used integer,
  period_start timestamptz,
  period_end timestamptz,
  period_images_used integer,
  topup_balance integer
)
language sql
stable
set search_path = public, pg_temp
as $$
  select s.plan,
         s.status,
         s.free_images_used,
         bp.period_start,
         bp.period_end,
         case when s.period_start = bp.period_start then s.period_images_used else 0 end,
         s.topup_balance
    from public.subscriptions s
   cross join lateral public.billing_period(coalesce(s.period_anchor, s.created_at), now()) bp
   where s.user_id = p_user_id;
$$;

-- Records a completed file and charges exactly one image credit in the same
-- transaction, fenced by the claim token (processed_files.claimed_at).
-- Returns the bucket charged, or NULL when the claim was lost, in which case
-- nothing is recorded and nothing is charged. Failed files are never charged.
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
           topup_balance = v_sub.topup_balance
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

-- Adds (or, with a negative amount, removes) top-up credits and logs why.
-- A removal below zero violates the balance check and rolls back the log row too.
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
declare
  v_balance integer;
begin
  insert into public.subscriptions (user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  insert into public.image_credit_grants (user_id, amount, reason, source, provider_reference)
  values (p_user_id, p_amount, p_reason, p_source, p_reference);

  update public.subscriptions s
     set topup_balance = s.topup_balance + p_amount
   where s.user_id = p_user_id
  returning s.topup_balance into v_balance;

  return v_balance;
end;
$$;

-- Creates or updates a process together with its full destination list, in one
-- transaction. Destinations missing from p_destinations are deleted. The plan's
-- process limit is passed in and enforced under a per-user lock.
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
      rename_template, instructions, tag_fields, timezone, enabled
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
      coalesce((p_process ->> 'enabled')::boolean, true)
    )
    returning id into v_id;
  else
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

-- Transitional, removed by 0003: mirrors legacy folder_configs writes (from the
-- previously deployed backend, or the legacy /api/drive/config endpoint) into
-- the user's first process. Its Unsorted fallback is the old destination folder,
-- so a migrated user's images keep landing exactly where they did before.
create or replace function public.sync_legacy_folder_config()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_process_id uuid;
  v_previous_master text;
begin
  select wp.id, wp.master_folder_id into v_process_id, v_previous_master
    from public.work_processes wp
   where wp.user_id = new.user_id
   order by wp.created_at, wp.id
   limit 1;

  if v_process_id is null then
    insert into public.work_processes (
      user_id, name, raw_folder_id, raw_folder_name, master_folder_id, master_folder_name,
      rename_template, created_at
    )
    values (
      new.user_id, 'My first process', new.raw_folder_id, new.raw_folder_name,
      new.destination_folder_id, new.destination_folder_name, '{genre}_{subject}', new.created_at
    )
    returning id into v_process_id;
  else
    update public.work_processes wp
       set raw_folder_id = new.raw_folder_id,
           raw_folder_name = new.raw_folder_name,
           master_folder_id = new.destination_folder_id,
           master_folder_name = new.destination_folder_name
     where wp.id = v_process_id;

    -- An Unsorted that sorted into the old Master (or the old legacy destination) follows the new one, as the old app did.
    update public.process_destinations d
       set folder_id = new.destination_folder_id,
           folder_name = new.destination_folder_name
     where d.process_id = v_process_id
       and d.is_fallback
       and (d.folder_id = v_previous_master
            or (tg_op = 'UPDATE' and d.folder_id = old.destination_folder_id));
  end if;

  insert into public.process_destinations (
    process_id, user_id, name, description, folder_id, folder_name, position, is_fallback
  )
  select v_process_id, new.user_id, 'Unsorted', 'Images that don''t clearly fit another destination.',
         new.destination_folder_id, new.destination_folder_name, 0, true
   where not exists (
     select 1 from public.process_destinations d
      where d.process_id = v_process_id and d.is_fallback
   );

  return null;
end;
$$;

-- Guarded so a re-run after 0003 (which drops folder_configs) doesn't fail.
do $$
begin
  if to_regclass('public.folder_configs') is not null then
    drop trigger if exists sync_legacy_folder_config on public.folder_configs;
    create trigger sync_legacy_folder_config
      after insert or update on public.folder_configs
      for each row execute function public.sync_legacy_folder_config();
  end if;
end;
$$;

-- Owner helpers for the SQL editor, until a payment provider is wired in:
--   select public.admin_set_plan('client@example.com', 'creator');
--   select public.admin_grant_credits('client@example.com', 500, 'Pack 500, invoice #12');
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
                                   then 0 else s.period_images_used end
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.admin_grant_credits(p_email text, p_amount integer, p_reason text)
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

  return public.grant_image_credits(v_user_id, p_amount, p_reason, 'manual', null);
end;
$$;

-- ------------------------------------------------------------------- grants
-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default, which would expose them as RPCs to the browser. Backend only.
revoke all on function public.billing_period(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.image_usage(uuid) from public, anon, authenticated;
revoke all on function public.complete_processed_file(uuid, text, timestamptz, text, jsonb, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.grant_image_credits(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.save_work_process(uuid, uuid, jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function public.sync_legacy_folder_config() from public, anon, authenticated;

grant execute on function public.billing_period(timestamptz, timestamptz) to service_role;
grant execute on function public.image_usage(uuid) to service_role;
grant execute on function public.complete_processed_file(uuid, text, timestamptz, text, jsonb, uuid, text, integer, integer) to service_role;
grant execute on function public.grant_image_credits(uuid, integer, text, text, text) to service_role;
grant execute on function public.save_work_process(uuid, uuid, jsonb, jsonb, integer) to service_role;
grant execute on function public.sync_legacy_folder_config() to service_role;

-- SQL editor only (runs as the owner); not callable through the API at all.
revoke all on function public.admin_set_plan(text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.admin_grant_credits(text, integer, text) from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------- backfill
-- One-time data moves, run only on the first application of this file. Once the new backend is live, repeating
-- them would re-create processes users deleted, re-count images already charged, and relabel activity.
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
-- Intentionally no policies: bookkeeping only.

do $$
begin
  if exists (select 1 from public.schema_migrations where version = '0002_work_processes') then
    return;
  end if;

  -- Images organized before this migration (never charged to any bucket) count toward the Free 100.
  update public.subscriptions s set free_images_used = c.completed
    from (
      select user_id, count(*)::int as completed
        from public.processed_files
       where status = 'completed' and credit_bucket is null
       group by user_id
    ) c
   where c.user_id = s.user_id and s.plan = 'free';

  -- Touching each unmigrated folder config fires sync_legacy_folder_config, which
  -- creates the process and its Unsorted fallback (= the old destination folder).
  if to_regclass('public.folder_configs') is not null then
    update public.folder_configs fc
       set updated_at = fc.updated_at
     where not exists (select 1 from public.work_processes wp where wp.user_id = fc.user_id);
  end if;

  update public.processed_files pf
     set process_id = firsts.id
    from (
      select distinct on (wp.user_id) wp.user_id, wp.id
        from public.work_processes wp
       order by wp.user_id, wp.created_at, wp.id
    ) firsts
   where pf.user_id = firsts.user_id
     and pf.process_id is null
     and pf.credit_bucket is null;

  insert into public.schema_migrations (version) values ('0002_work_processes');
end;
$$;

commit;
