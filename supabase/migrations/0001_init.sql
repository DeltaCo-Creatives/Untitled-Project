-- DriveTag AI — initial schema
-- Run in the Supabase SQL Editor (see backend/README.md). Safe to re-run.
--
-- Security model: the backend uses the service_role key and bypasses RLS.
-- The browser uses the anon key, so every table has RLS enabled and only
-- read-your-own-row policies. No table grants client writes — all writes go
-- through the backend. google_credentials has NO client policy at all, so
-- refresh tokens are unreachable from the browser even though they are
-- additionally encrypted at the application layer.
--
-- Zero-Retention: no table stores image bytes. processed_files keeps
-- filenames and tags only.

-- ---------------------------------------------------------------- helpers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------- google_credentials
create table if not exists public.google_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_encrypted text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_credentials enable row level security;
-- Intentionally no policies: backend-only table.

drop trigger if exists set_updated_at on public.google_credentials;
create trigger set_updated_at
  before update on public.google_credentials
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- folder_configs
create table if not exists public.folder_configs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  raw_folder_id text not null,
  raw_folder_name text,
  destination_folder_id text not null,
  destination_folder_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint folders_must_differ check (raw_folder_id <> destination_folder_id)
);

alter table public.folder_configs enable row level security;

drop policy if exists "read own folder config" on public.folder_configs;
create policy "read own folder config"
  on public.folder_configs for select
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.folder_configs;
create trigger set_updated_at
  before update on public.folder_configs
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- drive_channels
create table if not exists public.drive_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_id text not null unique,
  resource_id text not null,
  page_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- One active watch per user; startWatch() stops the old one first.
  constraint one_channel_per_user unique (user_id)
);

create index if not exists drive_channels_expires_at_idx
  on public.drive_channels (expires_at);

alter table public.drive_channels enable row level security;

drop policy if exists "read own channel" on public.drive_channels;
create policy "read own channel"
  on public.drive_channels for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------- processed_files
create table if not exists public.processed_files (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_id text not null,
  original_name text,
  new_name text,
  tags jsonb,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  error_message text,
  claimed_at timestamptz not null default now(),
  processed_at timestamptz,
  -- The idempotency guard: a redelivered Drive notification cannot
  -- reprocess a file, because claiming it twice violates this constraint.
  constraint processed_files_unique_per_user unique (user_id, file_id)
);

create index if not exists processed_files_user_recent_idx
  on public.processed_files (user_id, processed_at desc);

alter table public.processed_files enable row level security;

drop policy if exists "read own activity" on public.processed_files;
create policy "read own activity"
  on public.processed_files for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------ subscriptions
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  plan text,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.subscriptions;
create trigger set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();
