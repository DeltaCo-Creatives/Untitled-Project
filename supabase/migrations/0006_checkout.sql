-- DriveTag AI — 0006: checkout support (idempotent credit grants + subscription state)
-- Run in the Supabase SQL Editor AFTER 0001-0005 and BEFORE deploying the backend
-- that uses it (see backend/README.md). Safe to re-run.
--
-- Two independent changes, both for the Lemon Squeezy checkout/webhook work:
--   1. grant_credits (replaced again, from 0005) now refuses to grant the same
--      p_reference twice. image_credit_grants.provider_reference is already
--      `text unique` (0002), so a redelivered webhook event used to raise a raw
--      unique-violation, which would make Lemon Squeezy retry forever. Now a
--      repeat reference is a no-op that returns the current balance. A null
--      reference (manual grants) is never deduped — same repeatable behaviour
--      as before. Every other behaviour (kind check, the row lock, the
--      insufficient_credits guard and its raise-before-insert ordering, the
--      return value) is unchanged from 0005.
--   2. apply_subscription_state: the new function the Lemon Squeezy webhook
--      calls to upsert a user's subscription row. It mirrors admin_set_plan's
--      period_anchor rule exactly (restart requested, or the plan actually
--      changed) and validates p_status/p_plan against the live table
--      constraints instead of a second hard-coded list, so it can't drift from
--      subscriptions_status_check / subscriptions_plan_check.
--
-- Zero-Retention: unaffected — no file bytes or extracted text involved here.

begin;

-- ------------------------------------------------------------------ grant_credits
-- Adds provider_reference idempotency on top of 0005's readable insufficient_credits
-- error. CREATE OR REPLACE keeps the execute grants 0004 already set (service_role
-- only) because the signature is unchanged — do not re-grant it here.
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

  -- Idempotency: a payment-provider webhook may redeliver the same event. When a
  -- reference is given and a grant already exists under it, this exact purchase
  -- was already applied — return the current balance untouched instead of granting
  -- again. Only when p_reference is not null: manual grants always pass null and
  -- must stay repeatable.
  --
  -- This check sits AFTER the lock on purpose. Checked before it, two overlapping
  -- redeliveries of the same event would both find no existing grant, both proceed,
  -- and the loser would hit provider_reference's unique constraint and raise — a
  -- spurious 500 that makes the provider retry. Under the lock they serialise on
  -- this user's subscription row, so the second one sees the first one's grant.
  if p_reference is not null and exists (
    select 1 from public.image_credit_grants g where g.provider_reference = p_reference
  ) then
    return v_current;
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

-- ------------------------------------------------------------ apply_subscription_state
-- Upserts a user's subscription row from a payment-provider event. Validation is
-- delegated to the table's own subscriptions_status_check / subscriptions_plan_check
-- constraints (caught below) rather than a second copy of either list, so this can
-- never drift from them the way a hard-coded `in (...)` here could.
create or replace function public.apply_subscription_state(
  p_user_id uuid,
  p_plan text,
  p_status text,
  p_provider text,
  p_customer_id text,
  p_subscription_id text,
  p_period_end timestamptz,
  p_restart_period boolean
)
returns public.subscriptions
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_row public.subscriptions;
  v_constraint text;
begin
  begin
    insert into public.subscriptions as s (
      user_id, plan, status, provider, provider_customer_id, provider_subscription_id,
      current_period_end, period_anchor
    )
    values (
      p_user_id, p_plan, p_status, p_provider, p_customer_id, p_subscription_id,
      p_period_end, now()
    )
    on conflict (user_id) do update
       set plan = excluded.plan,
           status = excluded.status,
           -- coalesce, not assignment: not every webhook event carries the provider ids or a
           -- period end, and a null there means "no new information", never "forget what you
           -- knew". Assigning excluded directly would let subscription_payment_success wipe the
           -- customer id that subscription_created stored. plan and status are always supplied.
           provider = coalesce(excluded.provider, s.provider),
           provider_customer_id = coalesce(excluded.provider_customer_id, s.provider_customer_id),
           provider_subscription_id = coalesce(excluded.provider_subscription_id, s.provider_subscription_id),
           current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
           -- Mirrors admin_set_plan's rule exactly: restart it, or the plan actually changed.
           period_anchor = case when s.plan is distinct from excluded.plan or p_restart_period
                                then now() else s.period_anchor end
    returning * into v_row;
  exception
    when check_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'subscriptions_status_check' then
        raise exception 'invalid_status: %', p_status;
      elsif v_constraint = 'subscriptions_plan_check' then
        raise exception 'invalid_plan: %', p_plan;
      else
        raise;
      end if;
  end;

  return v_row;
end;
$$;

revoke all on function public.apply_subscription_state(uuid, text, text, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_subscription_state(uuid, text, text, text, text, text, timestamptz, boolean) to service_role;

-- ----------------------------------------------------------------- schema_migrations
insert into public.schema_migrations (version) values ('0006_checkout') on conflict do nothing;

commit;
