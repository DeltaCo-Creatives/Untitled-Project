-- DriveTag AI — 0003: remove the legacy single-folder config and the trial
-- Run in the Supabase SQL Editor ONLY after the cleanup deploy is live (the
-- backend that no longer serves /api/drive/config). See backend/README.md. Safe to re-run.

begin;

drop trigger if exists sync_legacy_folder_config on public.folder_configs;
drop function if exists public.sync_legacy_folder_config();
drop table if exists public.folder_configs;

update public.subscriptions set status = 'active' where status = 'trialing';

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'past_due', 'cancelled', 'expired'));

alter table public.subscriptions drop column if exists trial_ends_at;

commit;
