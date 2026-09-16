# ForDev.md — Setup Runbook

Everything you need to do by hand to get the backend running. Work top to bottom; each section ends with something you can verify.

The backend code is fully built — nothing here asks you to write code. This is account setup, database creation, and secrets.

For step-by-step help getting any single credential (and what to do if one leaks), see [tutorial.md](tutorial.md).

---

## 0. Prerequisites

- [x] Node.js 18+ (`node -v`) — v22.18.0
- [ ] A Google account
- [ ] A Supabase account (free tier is fine)
- [x] ngrok CLI installed globally (`npm install -g ngrok`) — **not yet authenticated**, see §7

```bash
cd backend
npm install   # done — 154 packages
```

```bash
cd frontend
npm install   # done — 69 packages
```

---

## 1. Supabase — create the project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Name it (e.g. `drivetag-ai`), set a strong database password, pick a region near your DigitalOcean region.
3. Wait for provisioning (~2 min).
4. Go to **Project Settings → API** and copy all three while you're there:
   - **Project URL** → backend's `SUPABASE_URL` and frontend's `VITE_SUPABASE_URL`
   - **service_role** secret key → backend's `SUPABASE_SERVICE_ROLE_KEY` only
   - **anon** public key → backend's `SUPABASE_ANON_KEY` (used by `scripts/get-token.js`) and frontend's `VITE_SUPABASE_ANON_KEY`

> The `service_role` key bypasses all row-level security. It belongs only in the backend's environment — never in the frontend, never in git. The `anon` key is not secret and is safe in the frontend bundle.

---

## 2. Supabase — create the database

Open **SQL Editor → New query** in the Supabase dashboard, paste the whole block below, and click **Run**.

This is the same content as [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), which is the source of truth if the two ever drift. It is safe to re-run.

```sql
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
```

**Verify:** open **Table Editor** — you should see `google_credentials`, `folder_configs`, `drive_channels`, `processed_files`, `subscriptions`, each showing RLS enabled.

### What each table is for

| Table | Holds | Notes |
|---|---|---|
| `google_credentials` | Encrypted Google refresh token per user | No RLS policy at all — unreachable from the browser. Also encrypted at the app layer. |
| `folder_configs` | The user's Raw + Destination folder IDs | One row per user. |
| `drive_channels` | Active watch channel + changes-feed page token | One per user; `expires_at` drives renewal. |
| `processed_files` | Filenames, tags, status per processed file | The `unique (user_id, file_id)` constraint is what makes redelivered webhooks safe. **No image bytes** — Zero-Retention holds. |
| `subscriptions` | Billing status | Gates the AI pipeline. A trial row is created on first Drive connect. |

---

## 3. Google Cloud — enable Drive API and create an OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. `drivetag-ai`).
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Fill in app name, support email, developer email
   - **Scopes**: add `https://www.googleapis.com/auth/drive`
   - **Test users**: add your own Google account (required while the app is unverified)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized redirect URIs** — add exactly:
     ```
     http://localhost:3001/api/auth/google/callback
     ```
   - Create, then copy the **Client ID** and **Client secret**.

> **Read this before planning a launch date.** This app needs the full `https://www.googleapis.com/auth/drive` scope, because it must read images that *other people* drop into the watched folder — the narrower `drive.file` scope only covers files the user personally picked. Full `drive` is a **restricted scope**, so serving users outside your test list requires Google's OAuth verification and possibly a third-party security assessment (CASA), which takes weeks and can cost money. While unverified you're limited to your listed test users, which is fine for development and early design partners. Confirm Google's current requirements before committing to a public launch timeline.

---

## 3b. Supabase — enable Google login

**Done, and live-verified** — not just checked in the dashboard:
- `curl` against `https://ckskwjtjydaqewwojsfj.supabase.co/auth/v1/authorize?provider=google` returns a real `302` to `accounts.google.com` carrying your exact `client_id` and the Supabase callback as `redirect_uri`.
- That exact URL was then sent straight to Google's own authorize endpoint. An unregistered redirect URI gets bounced immediately with a `400 redirect_uri_mismatch` page — instead it proceeded into Google's normal sign-in flow, which only happens when the URI is actually registered on the OAuth client.
- Supabase's Site URL save was confirmed via the dashboard's own success toast.

"Sign in with Google" through Supabase now works end-to-end at the protocol level. (It still can't be exercised from the app itself until the frontend is wired to call it — §13 items 17–18.)

§3 authorized the *backend* to touch Drive. Logging **into the app** is a separate flow that Supabase runs, and it needs its own Google config.

1. In Google Cloud → **Credentials**, open the OAuth client from §3 and add a second **Authorized redirect URI**:
   ```
   https://ckskwjtjydaqewwojsfj.supabase.co/auth/v1/callback
   ```
   One client can serve both flows — you don't need two.
2. Supabase dashboard → **Authentication → Providers → Google** → enable it, paste the same **Client ID** and **Client secret**, save.
3. Supabase dashboard → **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:5173`
   - **Redirect URLs**: add `http://localhost:5173/**` (add your Vercel URL here later)

Skip step 3 and Google login will bounce to an error page instead of back into your app.

---

## 4. Gemini API key

**Done** — `GEMINI_API_KEY` is in `backend/.env` and live-verified: `npm run test:gemini` returned a real classification.

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API key**.
2. Copy it — this is `GEMINI_API_KEY`.

> **Model name changed underneath us.** `gemini-2.5-flash` (this doc's old default) now 404s with "no longer available to new users... use models/gemini-3.6-flash". Updated `GEMINI_MODEL` everywhere — `.env`, `.env.example`, and the fallback in `src/config/env.js` — to `gemini-3.6-flash`. If Google moves the goalposts again, the error message from Gemini itself names the current model to switch to.

---

## 5. Generate the app secrets

**Done** — `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`, and `GOOGLE_DRIVE_WEBHOOK_TOKEN` are already generated and sitting in `backend/.env` (gitignored, never committed — their values aren't repeated here for that reason). To rotate any of them later, run the matching command below and paste the new value into `backend/.env` yourself.

Run these three and keep the output:

```bash
node -e "console.log('TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

```bash
node -e "console.log('OAUTH_STATE_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

```bash
node -e "console.log('GOOGLE_DRIVE_WEBHOOK_TOKEN=' + require('crypto').randomBytes(32).toString('hex'))"
```

- `TOKEN_ENCRYPTION_KEY` — must be exactly 64 hex chars; encrypts refresh tokens at rest. **If you rotate this, every stored refresh token becomes undecryptable and all users must reconnect Drive.**
- `OAUTH_STATE_SECRET` — signs the OAuth `state` parameter (CSRF protection).
- `GOOGLE_DRIVE_WEBHOOK_TOKEN` — shared secret Drive echoes back so the webhook can reject forged posts.

---

## 6. Fill in backend/.env

```bash
cd backend
cp .env.example .env   # done — backend/.env exists
```

Every required var is now filled in: `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` (§1), `TOKEN_ENCRYPTION_KEY`/`OAUTH_STATE_SECRET`/`GOOGLE_DRIVE_WEBHOOK_TOKEN` (§5), `GEMINI_API_KEY` (§4), and `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (§3, matches the downloaded OAuth client JSON exactly).

Only `DRIVE_WEBHOOK_URL` is still the `.env.example` placeholder — it doesn't block booting (it's just a string check, not a live check), but Drive push notifications won't reach you until it's a real tunnel/domain URL (§7, §7b).

**Verify:** confirmed — the backend now **fully boots**. `npm start` logs `{"level":"info","message":"DriveTag AI backend started",...}` and `GET /health` returns `{"status":"ok"}`. This is the first time every required var has been present.

---

## 6b. Fill in frontend/.env

```bash
cd frontend
cp .env.example .env   # done — frontend/.env exists
```

All three are filled in: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same values as backend's `SUPABASE_URL`/`SUPABASE_ANON_KEY`, §1), and `VITE_GOOGLE_CLIENT_ID` (same value as backend's `GOOGLE_CLIENT_ID`, §3 — never the client *secret*).

All `VITE_*` values ship to the browser and are meant to be public — never put `SUPABASE_SERVICE_ROLE_KEY` or `GOOGLE_CLIENT_SECRET` here.

> Note: `frontend/src/lib/supabase.ts` reads `VITE_SUPABASE_ANON_KEY` specifically. Supabase's dashboard now also offers a newer `sb_publishable_...` / `sb_secret_...` key format under a different variable name — the legacy `anon`/`service_role` JWT keys used throughout this repo still work identically and are what's wired in, so the client code wasn't changed.

**Verify:** `cd frontend && npm run build` already confirmed working (fixed a `verbatimModuleSyntax` import error in `src/contexts/AuthContext.tsx` along the way — `ReactNode` needed `import type`). The build succeeds with `.env` empty; these vars only matter once the frontend is wired to call the backend (§13 items 17–18).

---

## 7. Run locally with ngrok

Google only delivers push notifications to a public HTTPS URL, so local development needs a tunnel.

The `ngrok` CLI is already installed globally. Still needed from you:

1. Get a token from [dashboard.ngrok.com](https://dashboard.ngrok.com) → **Your Authtoken**, then authenticate once:
   ```bash
   ngrok config add-authtoken <your-token>
   ```
2. Terminal A:
   ```bash
   cd backend && npm run dev
   ```
3. Terminal B:
   ```bash
   ngrok http 3001
   ```
4. Copy the `https://....ngrok-free.app` URL ngrok prints, and set in `backend/.env`:
   ```
   DRIVE_WEBHOOK_URL=https://....ngrok-free.app/webhook/drive
   ```
5. Restart `npm run dev` so it picks up the change.

> On ngrok's free tier the subdomain changes every restart. Each time it changes you must update `DRIVE_WEBHOOK_URL`, restart, and re-register the watch (`POST /api/drive/watch`) — the old channel points at a dead URL.

**Verify** the webhook's shared-secret check without involving Google:

```bash
curl -i -X POST http://localhost:3001/webhook/drive -H "X-Goog-Channel-Token: PASTE_YOUR_TOKEN" -H "X-Goog-Resource-State: sync" -H "X-Goog-Channel-ID: manual-test"
```

Expect `200`. Send a wrong token and expect `403`.

---

## 7b. Webhook domain verification — expect this blocker

**Domain purchased:** `drivetag-ai.com` (Namecheap). See [domainguide.md](domainguide.md) for the full DNS/verification/env-var walkthrough for this specific domain — the steps below are the general version.

Google requires the domain receiving Drive push notifications to be **verified and registered in your Cloud project**. When it isn't, `changes.watch` is rejected with something like `Unauthorized WebHook callback channel` — that failure is Google refusing the address, not a bug in the backend.

The catch: you can only verify a domain you control, which rules out `*.ngrok-free.app` and DigitalOcean's default `*.ondigitalocean.app`.

**So you need a domain you own — for local development as well as production.** Once you have one:

1. Verify it in [Google Search Console](https://search.google.com/search-console) via a DNS TXT record.
2. Add it under Google Cloud Console → **APIs & Services → Domain verification**.
3. Point a subdomain at your local tunnel:
   - **ngrok paid** — reserve a custom domain, e.g. `dev.yourdomain.com`
   - **Cloudflare Tunnel** — free if your DNS is on Cloudflare, gives a stable named subdomain
4. Use that HTTPS URL as `DRIVE_WEBHOOK_URL`.

Accounts differ on whether a plain free ngrok URL is ever accepted, so if one works for you treat it as luck, not the plan. Budget a domain (~$10–15/yr) — §3's consent screen and §11's privacy policy need one regardless.

---

## 8. Prove the pipeline end to end

The Gemini leg alone, no Google account needed:

```bash
cd backend && npm run test:gemini
```

It prints the tags and the filename the pipeline would rename to. Drop a real photo at `backend/test-assets/sample.jpg` first for a meaningful result, or pass a path: `npm run test:gemini /path/to/photo.jpg`.

The full loop needs an authenticated user. Create a test user under **Authentication → Users** in Supabase (set a password), then mint a token:

```bash
cd backend && npm run token -- you@example.com yourpassword
```

That prints an access token (needs `SUPABASE_ANON_KEY` in `.env`). Use it as `$TOKEN` below:

```bash
TOKEN="paste-supabase-access-token"
```

```bash
# 1. Start Drive authorization — open the returned authUrl in a browser and consent
curl -s -X POST http://localhost:3001/api/auth/google/start -H "Authorization: Bearer $TOKEN"
```

```bash
# 2. List your Drive folders and pick two IDs
curl -s http://localhost:3001/api/drive/folders -H "Authorization: Bearer $TOKEN"
```

```bash
# 3. Save the Raw + Destination folders
curl -s -X POST http://localhost:3001/api/drive/config -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"rawFolderId":"RAW_ID","destinationFolderId":"DEST_ID"}'
```

```bash
# 4. Start watching
curl -s -X POST http://localhost:3001/api/drive/watch -H "Authorization: Bearer $TOKEN"
```

```bash
# 5. Drop an image into the Raw folder in Google Drive, then check what happened
curl -s http://localhost:3001/api/activity -H "Authorization: Bearer $TOKEN"
```

Within a few seconds the file should be renamed `genre_subject.ext` and moved to the Destination folder.

---

## 9. Keep watch channels alive

Drive channels expire (the API tells us when, and we store it). When one lapses, notifications stop **silently** — no error, just no more tagging. A scheduled job must renew them:

```bash
cd backend && npm run renew:channels
```

Run it **hourly** in production. DigitalOcean App Platform has no built-in recurring cron, so pick one:

- A GitHub Actions scheduled workflow that runs the script (needs the env vars as repo secrets), or
- An external cron service hitting a small protected endpoint you add, or
- A separate always-on worker component running the script on an interval.

Set this up before you have real users — it is the most likely cause of "it just stopped working".

---

## 10. Secret handling rules

- `.env` is gitignored, along with `*.pem`, `*.key`, `client_secret*.json`, and service-account JSON. Verified: no `.env` has ever been committed to this repo.
- Never put the `service_role` key, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, or `OAUTH_STATE_SECRET` anywhere a browser can reach. The frontend gets only the Supabase **anon** key and the backend URL.
- In production set env vars through the platform's encrypted variables (DigitalOcean App Platform → Settings → App-Level Environment Variables, marked **Encrypted**; Vercel → Project → Environment Variables). Don't bake them into an image or commit them.
- Before committing, check `git status` and `git diff --cached` to confirm no `.env` or key file is staged.
- **If a key leaks:** rotate it at the source (Google Cloud → reset client secret; Supabase → rotate service key; AI Studio → delete and recreate). Rotating `TOKEN_ENCRYPTION_KEY` also forces every user to reconnect Drive, so treat that one as the most disruptive.
- Logs redact any field matching `token|secret|key|authorization|refresh|password`, and image bytes are never logged.

---

## 11. Deployment

**Backend → DigitalOcean App Platform**
- Connect the GitHub repo, set **Source Directory** to `/backend`
- Build command `npm ci`, run command `npm start`
- Set every var from `.env.example` as encrypted app-level env vars
- Update `GOOGLE_OAUTH_REDIRECT_URI` and `DRIVE_WEBHOOK_URL` to the production domain, and add the new redirect URI to the Google OAuth client
- Existing watch channels still point at the old (ngrok) URL — re-register them after cutover

**Frontend → Vercel**
- Connect the same repo, **Root Directory** `frontend`
- Framework preset Vite; build `npm run build`; output `dist`
- Environment variables (all `VITE_*` values are public — they ship to the browser, so never put the service_role key here):
  ```
  VITE_SUPABASE_URL=https://ckskwjtjydaqewwojsfj.supabase.co
  VITE_SUPABASE_ANON_KEY=<anon key>
  VITE_GOOGLE_CLIENT_ID=<same client id>
  ```
- Enable **Analytics** in the Vercel project (Analytics tab → Enable), then redeploy. The package is already installed and wired; data only appears on Vercel deployments, never on localhost, where it just logs to the console.
- Then, back on the backend: set `CORS_ORIGINS` and `FRONTEND_URL` to the Vercel domain
- And in Supabase → **Authentication → URL Configuration**: add the Vercel URL to Site URL / Redirect URLs

---

## 12. Decisions baked into the backend

Things that were open questions and are now settled in code — change them deliberately, not by accident.

- **Drive authorization is a separate grant from login.** Supabase handles identity (Google login); the backend runs its own Drive OAuth flow to get an *offline* refresh token, because the pipeline runs when the user isn't present. Both can live in the same Google Cloud project.
- **We watch the changes feed, not the folder.** Drive's per-file watch on a folder doesn't reliably fire for files added inside it, so the backend watches the user's changes feed and filters to the Raw folder. That's why `drive_channels.page_token` exists.
- **A trial row is created on first Drive connect** (`TRIAL_DAYS`, default 14), so onboarding works before billing exists. The pipeline gate fails closed: no active subscription or trial means no processing and no Gemini spend.
- **Activity history is kept, metadata only.** It's needed for idempotency anyway; it stores filenames and tags, never pixels.
- **Duplicate filenames are allowed.** Two similar images can both become `portrait_woman-smiling.jpg`; Drive keeps them distinct by ID. Add a collision suffix later if it bothers users.
- **Not handled yet:** Shared Drives (My Drive only, via `restrictToMyDrive`), and the payment provider webhook — that waits on the Lemon Squeezy vs Paddle decision. The subscription gate itself is provider-agnostic and already in place.

---

## 13. Remaining setup checklist

Ordered by dependency — each step unblocks the next. Nothing here needs code written.

**Already done in this environment**
- [x] `backend/` and `frontend/` dependencies installed (§0)
- [x] `ngrok` CLI installed globally — not yet authenticated (§7)
- [x] Every var `backend/.env` requires to boot is filled in: local secrets (§5), Supabase (§1), Gemini (§4), Google OAuth client (§3) — **the backend now fully boots**, `npm start` logs "DriveTag AI backend started" and `GET /health` returns `{"status":"ok"}`
- [x] `frontend/.env` fully filled in too: Supabase URL/anon key + Google client ID (§6b)
- [x] Supabase connectivity live-checked with a read-only query against all 5 tables — all reachable
- [x] Gemini connectivity live-checked via `npm run test:gemini` — real classification returned. Along the way found `gemini-2.5-flash` is dead (404, Google says use `gemini-3.6-flash`) and fixed the default in `.env`, `.env.example`, and `src/config/env.js`
- [x] Frontend `npm run lint` and `npm run build` verified passing (one real bug found and fixed: `AuthContext.tsx` needed `import type { ReactNode }`)
- [x] Supabase Google-login wiring (§3b) — second redirect URI on the Google OAuth client, Supabase's Google provider, and the Site URL — all live-verified by hitting Supabase's and Google's real authorize endpoints, not just checked in the dashboards

**Where this leaves you:** all setup that only needed pasting a key into `.env` or a config screen is done and verified. What's left needs either a real login (the consent-screen/test-user check, §13 item 8) or things only you can do: the Postgres password reset (below), and the ngrok/domain chain for live webhooks (§7, §7b). None of the code needs touching.

**Do first (5 min, security)**
1. [ ] **Reset the Postgres database password** — Supabase → Project Settings → Database → Reset database password. You've now pasted it into chat twice; the app never uses the raw Postgres connection string (it talks to Supabase over the REST API with the service_role key), so this doesn't block anything below, but treat the password as burned and rotate it anyway.

**Get the backend booting (~30 min) — done**
2. [x] Run the §2 migration in the Supabase SQL Editor — tables exist and are reachable
3. [x] Copy `service_role` + `anon` keys into `backend/.env` (§1)
4. [x] Create a Gemini key (§4) → `GEMINI_API_KEY` — live-verified
5. [x] `cd backend && npm run dev` → confirmed: "DriveTag AI backend started", `/health` returns 200
6. [ ] `npm run test:gemini` with a **real photo** in `backend/test-assets/sample.jpg` — only tested so far with the placeholder pixel; drop a real image in for a meaningful tag result

**Google OAuth (~45 min) — done except the one thing that needs a real login**
7. [x] Cloud project + enable Drive API (§3) — client exists and works for the backend callback
8. [ ] Consent screen: External, scope `.../auth/drive`, add yourself as a test user — the only unverified item in this section; can't be checked without actually completing a consent screen, which needs a live login (§8)
9. [x] OAuth client (Web) with **both** redirect URIs — confirmed live, Google's own authorize endpoint accepts the Supabase callback URI
10. [x] Client ID/secret into `backend/.env` **and** Supabase → Auth → Providers → Google — confirmed live via `/auth/v1/authorize?provider=google`
11. [x] Supabase → Auth → URL Configuration: Site URL + redirect allowlist (§3b) — confirmed via dashboard save toast

**Make webhooks actually reachable (the slow one)**
12. [ ] Buy a domain if you don't have one — needed for webhook verification, the consent screen, and the privacy policy
13. [ ] Verify it in Search Console + Cloud Console → Domain verification (§7b)
14. [ ] Authenticate ngrok (`ngrok config add-authtoken <token>` — CLI already installed) and tunnel a subdomain to localhost:3001 (ngrok paid or Cloudflare Tunnel) → `DRIVE_WEBHOOK_URL`
15. [ ] Full loop test per §8: connect Drive, set folders, start watch, drop an image, check `/api/activity`

**Frontend wiring (code, not setup)**
16. [x] `frontend/.env` created and fully filled in (§6b)
17. [ ] The frontend has no backend calls yet — no `VITE_API_URL`, no `fetch` to `/api/*`. Onboarding and dashboard screens render but do nothing. This is the largest remaining build task.
18. [ ] Add `VITE_API_URL`, send the Supabase access token as `Authorization: Bearer`, and wire: connect-Drive, folder pickers, watch toggle, `/api/me`, `/api/activity`

**Production**
19. [ ] Backend → DigitalOcean App Platform, Source Directory `/backend` (§11)
20. [ ] Frontend → Vercel, Root Directory `frontend` (§11)
21. [ ] Production redirect URI + webhook URL; re-register every watch channel after the domain changes
22. [ ] Schedule `npm run renew:channels` hourly (§9) — without this, tagging silently dies within days
23. [ ] Privacy policy + terms on your domain
24. [ ] Pick Lemon Squeezy or Paddle, then build the billing webhook

**Costs to expect:** domain ~$10–15/yr · ngrok paid ~$8/mo (or Cloudflare Tunnel free) · Supabase free tier fine to start · DigitalOcean App Platform ~$5/mo · Gemini Flash pay-per-use (the free tier's rate limits will throttle a real workload, so plan on enabling billing).
