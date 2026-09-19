# DriveTag AI — Backend

Node.js + Express 5 (ESM) API that runs DriveTag AI's two loops:

- **Loop A (onboarding):** a Google Drive OAuth grant separate from Supabase login, folder browsing, work-process CRUD, and Drive watch-channel lifecycle.
- **Loop B (pipeline):** Drive webhook (or polling) → changes-feed sweep → per-process AI worker pool → Gemini classification → naming template → rename/move in Drive → atomic credit charge.

**Zero-Retention:** an incoming image is downloaded into memory, sent to Gemini as inline base64 data (never the Files API, which would retain the upload), and discarded the moment the Drive rename/move completes. No code path writes an image to disk, a database column, or a storage bucket — only filenames, tags and destination names are ever stored (`processed_files`).

**State:** live and production-ready. The full Drive loop (connect → watch → classify → rename/move → meter) runs end to end on `https://drivetag-ai.com` / `https://api.drivetag-ai.com`.

For architecture, the full non-obvious-design-decisions list, and conventions, see **[../CLAUDE.md](../CLAUDE.md)** — this document doesn't repeat that reasoning, only the concrete setup/operations facts. For the web app, see **[../frontend/README.md](../frontend/README.md)**.

---

## 1. Quickstart (local)

**Prerequisites:** Node.js >= 18 (`package.json` `engines`). No database or queue to install locally — the backend talks to Supabase's REST API and Google's APIs directly.

```bash
cd backend && npm install
```

Create `backend/.env` by hand (no `.env.example` ships in this repo — every variable is in [§2](#2-environment-variables) below).

```bash
npm run dev
```

Starts on `http://localhost:3001` with nodemon. If a required variable is missing, it refuses to start and names exactly which ones.

```bash
curl -s http://localhost:3001/health
```

Expect `{"status":"ok"}`.

### Local dev shares the production database

`backend/.env` in the working copies used to build this app point at the **production** Supabase project (`ckskwjtjydaqewwojsfj`) — there's no separate dev database. That means:

- Keep **`AUTO_SYNC_INTERVAL_SECONDS=0`** locally. A nonzero value makes your laptop poll and sort real users' Drive folders.
- In-process channel renewal and polling-channel conversion only run when `NODE_ENV=production` ([server.js](server.js)), so a local server can't renew or "upgrade" production users' watch channels even by accident.
- **`TOKEN_ENCRYPTION_KEY` must match production's** if you intend to decrypt or write real users' stored refresh tokens (`google_credentials.refresh_token_encrypted` is AES-256-GCM under this key — see [src/utils/crypto.js](src/utils/crypto.js)). A different key can't read them, and connecting Drive locally under a mismatched key stores a token production can't use either.
- Don't connect your own Drive locally with an account you also use in production unless you're deliberately testing against prod.

---

## 2. Environment variables

Every variable [src/config/env.js](src/config/env.js) reads. "Required" means `npm start`/`npm run dev` refuse to boot without it (`assertRequiredEnv()`); `npm run test:gemini` and `npm run token` only need their own subset (see [§4](#4-commands)).

| Variable | Required | Secret | Default | Purpose |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Yes | Yes | — | Gemini Flash API key for image classification |
| `GEMINI_MODEL` | No | No | `gemini-3.6-flash` | Model id. Google retired `gemini-2.5-flash` for new users; a stale `.env` value silently overrides the default and 404s |
| `MAX_IMAGE_BYTES` | No | No | `18874368` (18 MB) | Ceiling on one image sent inline to Gemini; larger files are skipped with a readable error rather than failing the whole sweep |
| `MAX_CONCURRENT_AI_JOBS` | No | No | `20` | Server-wide FIFO cap on simultaneous download+classify jobs, across every user's sweep and "Organize now" ([src/services/pipeline.service.js](src/services/pipeline.service.js)). Each in-flight job can hold up to `MAX_IMAGE_BYTES` of image data in memory — size this against the instance's RAM (e.g. 20 × 18 MB ≈ 360 MB worst case), not just Gemini's rate limit |
| `GOOGLE_CLIENT_ID` | Yes | Semi-public | — | OAuth client, from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | Yes | — | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | No | — | Must exactly match a redirect URI registered on the OAuth client |
| `DRIVE_WEBHOOK_URL` | Yes | No | — | Public HTTPS address Drive posts change notifications to (`.../webhook/drive`). Just a string check at boot, not a live check |
| `GOOGLE_DRIVE_WEBHOOK_TOKEN` | Yes | Yes | — | Shared secret Drive echoes back as `X-Goog-Channel-Token`; compared with `crypto.timingSafeEqual` |
| `SUPABASE_URL` | Yes | No | — | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes (very) | — | Bypasses RLS entirely. Backend only, never in a browser-shipped var |
| `SUPABASE_ANON_KEY` | No | No | — | Only used by `scripts/get-token.js`; the running server never needs it |
| `TOKEN_ENCRYPTION_KEY` | Yes | Yes | — | Must be exactly 64 hex characters (32 bytes) — [src/utils/crypto.js](src/utils/crypto.js) throws at import time otherwise. Encrypts stored Drive refresh tokens (AES-256-GCM). Rotating it makes every stored token undecryptable; every user must reconnect Drive |
| `OAUTH_STATE_SECRET` | Yes | Yes | — | HMAC key signing the OAuth `state` param (CSRF protection, carries the return origin) |
| `FRONTEND_URL` | No | No | `http://localhost:5173` | Where a finished/failed Drive-connect redirects if the request's `Origin` isn't allowed |
| `CORS_ORIGINS` | No | No | `http://localhost:5173` | Comma-separated allowlist. In production this is the *only* thing that grants CORS — outside production any `http://localhost:<port>` is also allowed |
| `AUTO_SYNC_INTERVAL_SECONDS` | No | No | `0` | `0` disables polling (webhook only). `> 0` makes a refused webhook fall back to polling the changes feed this often, and reused by the auto-sync poller |
| `NODE_ENV` | No | No | `development` | `production` locks CORS to `CORS_ORIGINS`, enables in-process channel renewal, and turns on the boot-time `"Production config problem"` checks |
| `PORT` | No | No | `3001` | HTTP port |

### Getting each credential

- **Gemini key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey). **Enable billing on the Cloud project** before onboarding real users: the free tier's low rate limits will throttle a real workload, and Google's data-usage terms for billed API traffic differ from the free tier (it isn't used to improve Google's own products), which matters for a product whose whole pitch is "we don't retain your images."
- **Google OAuth client** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) — Google Cloud Console → enable the Drive API → OAuth consent screen (External, scope `https://www.googleapis.com/auth/drive`, your account as a test user while unverified) → Credentials → OAuth client ID (Web application). One client can carry every redirect URI this app needs:
  - `http://localhost:3001/api/auth/google/callback` — this backend's Drive flow, local dev
  - `https://api.drivetag-ai.com/api/auth/google/callback` — this backend's Drive flow, production
  - `https://ckskwjtjydaqewwojsfj.supabase.co/auth/v1/callback` — Supabase's own Google-login flow (a different flow from Drive authorization; see [../CLAUDE.md](../CLAUDE.md))
- **Supabase URL/keys** — dashboard → Project Settings → API. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are not secret; `SUPABASE_SERVICE_ROLE_KEY` is.
- **App secrets** (`TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`, `GOOGLE_DRIVE_WEBHOOK_TOKEN`) — random values you invent, not fetched from anywhere:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Run it once per secret. The output is 64 hex characters, which is exactly what `TOKEN_ENCRYPTION_KEY` requires; the other two accept any string but should be generated the same way.

### Rotating a leaked credential

| Credential | Where to rotate | Side effect |
|---|---|---|
| `GEMINI_API_KEY` | AI Studio → delete key, create new | None |
| `GOOGLE_CLIENT_SECRET` | Cloud Console → Credentials → client → Reset secret | Users re-consent; update it in Supabase's Google provider too |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → rotate | Backend must restart with the new value |
| `TOKEN_ENCRYPTION_KEY` | Generate a new 64-hex-char value | Every stored Drive refresh token becomes undecryptable; every user must reconnect Drive |
| `OAUTH_STATE_SECRET` | Generate a new value | Any OAuth redirect in flight at the moment of rotation fails (harmless — user just retries) |
| `GOOGLE_DRIVE_WEBHOOK_TOKEN` | Generate a new value | Re-register every watch channel afterwards; Drive echoes back the token it was given at registration, so old channels start getting 403'd |

Update the value in `backend/.env` locally and in DigitalOcean's encrypted app-level env vars for production — they're separate; nothing here travels through git.

---

## 3. Database

Schema source of truth: [`../supabase/migrations/`](../supabase/migrations/). Run in the Supabase SQL Editor, top to bottom.

| Migration | Run when | Contains |
|---|---|---|
| `0001_init.sql` | Fresh database, first | `google_credentials`, `folder_configs`, `drive_channels`, `processed_files`, `subscriptions` — all with RLS |
| `0002_work_processes.sql` | Before deploying a backend that uses work processes | `work_processes`, `process_destinations`, usage columns on `subscriptions`, `image_credit_grants`, `schema_migrations`, and the SQL functions below. Wrapped in a transaction; safe to re-run; the one-time backfill at the bottom only runs once (tracked in `schema_migrations`) |
| `0003_cleanup.sql` | Only after deploying a backend build with the legacy single-folder endpoints removed | Drops `folder_configs` and its sync trigger, retires the `trialing` subscription status |

**Production status:** all three have been applied. `folder_configs` and `subscriptions.trial_ends_at` no longer exist there. The backend code still contains the legacy `/api/drive/config`, `/raw-status`, `/organize` endpoints and `/api/me`'s legacy fields — removing them is the only piece of the cleanup release left (code only; see [§9](#9-state-limits-and-next-steps)). For a brand-new database, run `0001` → `0002` → `0003` in that order.

### What each table holds

| Table | Holds | Notes |
|---|---|---|
| `google_credentials` | Encrypted Drive refresh token per user | No RLS policy at all — unreachable from the browser; also encrypted at the app layer |
| `folder_configs` | Legacy single Raw + Destination config | Removed by `0003`; only relevant on a database that hasn't run it yet |
| `work_processes` | A user's AI work processes: Raw + Master folder, naming template, tag fields, instructions, time zone, on/off | Many per user; `unique (user_id, raw_folder_id)` — one process per Raw folder |
| `process_destinations` | Each process's destination folders and their AI-facing descriptions | Exactly one `is_fallback` (Unsorted) row per process, enforced by a unique partial index and by `save_work_process` |
| `drive_channels` | The active watch channel + changes-feed page token | One row per user, covering every process; `resource_id = 'polling'` marks a polling-mode row |
| `processed_files` | Filenames, tags, destination, credit bucket, status per processed file | `unique (user_id, file_id)` is what makes redelivered webhook notifications safe, and what makes a file sort automatically at most once. No image bytes |
| `subscriptions` | Plan, status, and image usage counters | A row is created on first Drive connect (`ensureSubscription`); no row means no processing (fail closed) |
| `image_credit_grants` | Audit log of every top-up credit change | `provider_reference` is unique, so a future payment webhook can't grant the same purchase twice |
| `schema_migrations` | Which one-time data backfills have already run | Bookkeeping only |

### SQL functions (0002)

| Function | Called from | Purpose |
|---|---|---|
| `image_usage(p_user_id)` | `repositories/usage.repo.js` | Read-only usage snapshot with the monthly counter rolled to the current billing period |
| `complete_processed_file(...)` | `repositories/processedFile.repo.js` | Charges one credit (free → monthly → top-up → overage) and marks a file completed, atomically, fenced by the claim token |
| `save_work_process(...)` | `repositories/workProcess.repo.js` | Creates/updates a process and replaces its destination list in one transaction, under a per-user advisory lock, enforcing the plan's process limit |
| `grant_image_credits(...)` | `admin_grant_credits`, a future payment webhook | Adds or removes top-up credits and logs why |
| `admin_set_plan` / `admin_grant_credits` | SQL editor only | Owner helpers — not exposed to any API role (see grants below) |

`billing_period`, `image_usage`, `complete_processed_file`, `grant_image_credits` and `save_work_process` are granted to `service_role` only. `admin_set_plan` and `admin_grant_credits` are revoked from every role including `service_role` — they only run as the database owner, from the SQL editor.

### Managing plans and credits by hand

No payment provider is integrated yet. Run these in the Supabase SQL Editor (verified against the function signatures in `0002_work_processes.sql`):

```sql
-- Upgrade (a plan change restarts the monthly period)
select public.admin_set_plan('client@example.com', 'creator');      -- creator | studio | enterprise | free
```

```sql
-- Same plan, but restart the monthly allowance now
select public.admin_set_plan('client@example.com', 'studio', 'active', true);
```

```sql
-- Lapse a paid plan (Free limits apply until it's active again)
select public.admin_set_plan('client@example.com', 'studio', 'cancelled');
```

```sql
-- Sell an image pack (never expires; used after the plan's monthly allowance)
select public.admin_grant_credits('client@example.com', 1000, 'Pack 1000, invoice #12');
```

```sql
-- Take credits back (fails, changing nothing, if the balance would go negative)
select public.admin_grant_credits('client@example.com', -250, 'Refund, invoice #12');
```

```sql
-- Where someone stands
select * from public.image_usage((select id from auth.users where email = 'client@example.com'));
```

Plan limits (process count, free/monthly images, packs) live only in `backend/src/config/plans.js`, never in SQL — change them there and redeploy.

---

## 4. Commands

All run from `backend/`.

| Command | Does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start without auto-reload |
| `npm test` | `node --test --experimental-test-module-mocks "test/**/*.test.js"` — 15 tests (pipeline worker pools + account deletion), every collaborator mocked, no `.env` or network needed. Needs **Node 22.3+** for `--experimental-test-module-mocks` (the server itself runs on 18+) |
| `npm run test:gemini [image] [--process spec.json]` | Classifies one image with Gemini and prints the tags + the filename the pipeline would rename to. Needs only `GEMINI_API_KEY`. **The default path (`test-assets/sample.jpg`) doesn't exist in this repo** — pass a real image path, e.g. `npm run test:gemini test-assets/Test1.jpg`. `--process spec.json` tries a specific work process's destinations/tags/instructions (the API's camelCase shape) instead of the built-in legacy single-Unsorted process |
| `npm run renew:channels` | Renews any Drive watch channel expiring within 24h, right now. Optional in production — the running server already does this hourly in-process (`NODE_ENV=production`); this is only useful as an out-of-band safety net or for a one-off manual renewal |
| `npm run token -- <email> <password>` | Mints a Supabase access token for a test user, for curling authenticated routes. Needs only `SUPABASE_URL`/`SUPABASE_ANON_KEY` |

---

## 5. How sorting works

1. Drive posts a webhook, or the auto-sync poller ticks (`AUTO_SYNC_INTERVAL_SECONDS > 0`).
2. The user's changes feed is swept from the stored page token; each changed file's direct parent is matched against an active process's Raw folder.
3. Matched files are grouped by process and run through that process's own worker pool, sized to `plan.aiPerProcess`. Different processes' pools run concurrently with each other; a server-wide semaphore (`MAX_CONCURRENT_AI_JOBS`) caps total download+classify concurrency across every user.
4. Each worker: reserves one image credit synchronously, claims the file (idempotency), downloads it into memory, sends it to Gemini with the process's destinations/tag fields/instructions, renders the naming template, and renames+moves the file in Drive (never into any Raw folder — the loop guard). The credit is only actually charged, atomically, on success (`complete_processed_file`); every other outcome releases the reservation.
5. **"Organize now"** (`POST /api/processes/:id/organize`, or the legacy `/api/drive/organize`) runs the same per-process worker pools directly against a Raw folder's current contents, for images the changes feed never reported because they arrived before the watch existed.
6. When nothing can run — no credits left, or no active processes — the page token is fast-forwarded instead of listing changes, so a later Drive change doesn't have to re-read an ever-growing backlog. Images that arrived meanwhile just wait in Raw for "Organize now".

### Plans (`backend/src/config/plans.js`)

| Plan | Processes | AI workers / process | Free images (lifetime) | Monthly images | Price / month |
|---|---|---|---|---|---|
| Free | 1 | 1 | 100 | 0 | $0 |
| Creator | 5 | 3 | 0 | 1,000 | $9.99 |
| Studio | 15 | 5 | 0 | 5,000 | $29.99 |
| Enterprise | 50 | 15 | 0 | 25,000 | $99.99 (monthly billing only) |

Top-up image packs (never expire, used after the plan's allowance): 250 images for $4.99, 1,000 for $14.99, 5,000 for $49.99. All prices are USD placeholders rendered on the pricing pages — no payment provider is wired up yet, so purchase buttons show "Coming soon." A `DOCUMENTS` block in the same file previews document-sorting pricing but is display-only (`available: false`) — the document pipeline isn't built; see [../README.md](../README.md) for the pricing strategy behind it.

### Gemini cost configuration

Classification requests use `MediaResolution.MEDIA_RESOLUTION_MEDIUM` and `ThinkingLevel.LOW` instead of the SDK defaults ([src/services/gemini.service.js](src/services/gemini.service.js), `COST_CONFIG`). Measured on `gemini-3.6-flash` against six sample images: the defaults cost about 1,460 input + 420 thinking/output tokens per image, versus about 900 + 50 with this configuration — roughly 2x faster, and it picked the same destination and genre on all six samples. At today's per-token pricing that's on the order of $0.0009 per image; Google's published price for this model steps up from $0.75/$3.75 to $1.50/$7.50 per 1M input/output tokens on 2027-01-01, which would roughly double that to about $0.0018 per image.

---

## 6. Deploying to DigitalOcean

**App Platform settings:** connect the GitHub repo, **Source Directory** `/backend`, build command `npm ci`, run command `npm start`. Both the frontend (Vercel) and this backend deploy from the same repo/branch (`production`) — don't split them.

**Production env values** (on top of [§2](#2-environment-variables)'s table, set as encrypted app-level variables):

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.drivetag-ai.com/api/auth/google/callback` |
| `DRIVE_WEBHOOK_URL` | `https://api.drivetag-ai.com/webhook/drive` |
| `FRONTEND_URL` | `https://drivetag-ai.com` |
| `CORS_ORIGINS` | `https://drivetag-ai.com` (comma-separate to also allow `www`) |
| `AUTO_SYNC_INTERVAL_SECONDS` | `> 0` until the domain is Google-verified and the webhook is confirmed reachable (see below); `0` once it is, to run webhook-only |

`api.drivetag-ai.com` reaches DigitalOcean via a CNAME record added in Namecheap pointing at the app's `*.ondigitalocean.app` address (App Platform → Settings → Domains shows the exact target).

**Boot-time log checks.** After every deploy, search the runtime logs for these — both are silent (the server still starts and serves `/health`) if they'd otherwise go unnoticed:
- `"Production config problem"` — logged once per offending variable if `FRONTEND_URL`, `CORS_ORIGINS`, `GOOGLE_OAUTH_REDIRECT_URI` or `DRIVE_WEBHOOK_URL` still points at `localhost`/`127.0.0.1` or an `ngrok`/placeholder URL ([src/config/env.js](src/config/env.js) `productionConfigProblems()`).
- `"Schema problem"` — logged if migration `0002_work_processes.sql` hasn't been run against this database yet ([src/repositories/usage.repo.js](src/repositories/usage.repo.js) `schemaProblem()`).

**Channel renewal runs in-process.** When `NODE_ENV=production`, `server.js` calls `startChannelRenewal()` at boot, which renews any watch channel expiring within 24h, once an hour, for as long as the instance is up. `npm run renew:channels` (or `scripts/renew-channels.js` on an external schedule) is an optional extra safety net for instance downtime — not required for normal operation.

**Webhook vs. polling.** Google will only deliver Drive push notifications to a domain verified in this app's Cloud project; `*.ondigitalocean.app` can never be verified. Until `drivetag-ai.com` is verified (Search Console → DNS TXT record → Cloud Console → Domain verification) and confirmed reachable, keep `AUTO_SYNC_INTERVAL_SECONDS` set to a positive value so the polling fallback sweeps changes instead. Once the domain is verified:
- Set `AUTO_SYNC_INTERVAL_SECONDS=0` (or leave it as a safety net) and redeploy.
- At boot with `AUTO_SYNC_INTERVAL_SECONDS <= 0`, the server calls `convertPollingChannels()`, which tries to upgrade every existing polling-mode channel to a live webhook automatically. Users don't need to manually restart their watch.
- If a user's `POST /api/drive/watch` still fails with `Unauthorized WebHook callback channel`, the domain isn't actually verified in Cloud Console yet (Search Console verification alone isn't enough).

**Single-instance requirement.** This backend assumes exactly one running instance. The following state lives only in process memory, with no database-backed fallback yet — scaling past one instance needs these rebuilt first:

| State | Where | Risk if scaled to N instances |
|---|---|---|
| Per-user watch lock | `src/services/driveWatch.service.js` (`userLocks`) | Concurrent start/stop/renew/disconnect across instances could leak or double-stop a channel |
| Sweep slot + rerun queue + live worker counts | `src/services/pipeline.service.js` (`inFlight`, `rerunRequested`, `workerCounts`) | Two instances could sweep or organize the same user at once (the database claim still prevents double-charging, but wastes Gemini calls) |
| Per-process status cache | `src/services/pipeline.service.js` (`statusCache`, `statusGeneration`) | Harmless if stale across instances (short TTL), but not shared |
| Pending Drive-connect grants | `src/services/driveConnect.service.js` (`pending`) | A grant parked by one instance can't be claimed if the request lands on another; a restart mid-connect just means "try again" |

---

## 7. Operations

**Google "Access blocked" when a user connects Drive.** The app requests the restricted `https://www.googleapis.com/auth/drive` scope (`drive.file` can't see files other people drop into the watched folder — see [../CLAUDE.md](../CLAUDE.md)). While the OAuth consent screen is in **Testing** mode, only accounts added as test users in Cloud Console → OAuth consent screen can connect. Testing-mode refresh tokens also expire after 7 days regardless of use, and there's no "reconnect Drive" prompt in the product yet when that happens — the pipeline gate just fails closed for that user until they reconnect.

**Going beyond a test-user allowlist** needs Google's restricted-scope app verification, and likely a third-party security assessment (CASA), reviewed annually — both have real lead time and can carry a cost. Budget for this before committing to a public (non-invite) launch date.

**Reading logs.** [src/utils/logger.js](src/utils/logger.js) emits structured JSON lines to stdout/stderr. Any field whose key matches `token|secret|key|authorization|refresh|password` (case-insensitive) is replaced with `[redacted]` before logging, recursively through nested objects — image bytes are never logged at all, by construction (nothing in the pipeline passes a buffer to the logger).

**Account deletion.** `DELETE /api/me` with body `{ "confirm": "DELETE" }`:
1. 409 `sorting_in_progress` if a sweep is currently running for that user (refuses rather than race a worker that might still move a file after credentials are gone).
2. Stops the Drive watch, revokes the refresh token at Google, deletes the stored credential — failures here are logged but don't block deletion (once the DriveTag rows are gone the token is unusable anyway).
3. Drops any Drive-connect grant parked but never claimed for that user.
4. Deletes the Supabase auth user. Every app table cascades from `auth.users(id)`, directly or (for `process_destinations`, via `work_processes`) transitively, so this removes the rest of the account's data.

---

## 8. API reference

All `/api/*` routes except `GET /api/plans` require `Authorization: Bearer <supabase-access-token>`. Legacy routes are removed in the cleanup release (code change only — the database side, `0003_cleanup.sql`, is already applied in production).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | |
| POST | `/webhook/drive` | `X-Goog-Channel-Token` shared secret | Acks immediately, sweeps in the background |
| POST | `/api/auth/google/start` | Bearer | Returns a Google consent URL |
| GET | `/api/auth/google/callback` | signed `state` param | Hit by Google's redirect; parks the grant, redirects to `/connect?pending=` |
| POST | `/api/auth/google/complete` | Bearer, must be the user who started the flow | Claims the parked grant |
| DELETE | `/api/auth/google` | Bearer | Disconnects Drive |
| GET | `/api/plans` | none | Public plan/pricing data for the frontend |
| GET | `/api/drive/folders` | Bearer | Folder browser: children of `?parentId` (default `root`), or `?q=` search |
| POST | `/api/drive/folders` | Bearer | Create a folder |
| GET | `/api/drive/folders/:id/path` | Bearer | Breadcrumb path |
| GET | `/api/drive/watch` | Bearer | Current watch state |
| POST | `/api/drive/watch` | Bearer | Start watching (live or polling fallback) |
| DELETE | `/api/drive/watch` | Bearer | Stop watching |
| GET | `/api/drive/config` | Bearer | **Legacy** — remove in the cleanup release |
| POST | `/api/drive/config` | Bearer | **Legacy** — remove in the cleanup release |
| GET | `/api/drive/raw-status` | Bearer | **Legacy** — remove in the cleanup release |
| POST | `/api/drive/organize` | Bearer | **Legacy** — remove in the cleanup release |
| GET | `/api/processes` | Bearer | List work processes |
| POST | `/api/processes` | Bearer | Create a work process |
| GET | `/api/processes/status` | Bearer | Per-process Raw folder counts + live worker counts |
| GET | `/api/processes/:id` | Bearer | |
| PUT | `/api/processes/:id` | Bearer | |
| PATCH | `/api/processes/:id` | Bearer | Body `{ enabled: boolean }` |
| DELETE | `/api/processes/:id` | Bearer | Deleting the last process also stops the watch |
| POST | `/api/processes/:id/organize` | Bearer | "Organize now" for one process |
| GET | `/api/me` | Bearer | Dashboard summary: plan, usage, process counts, watch state (plus **legacy** `config`/`subscription`/`entitled` fields, removed in the cleanup release) |
| DELETE | `/api/me` | Bearer | Body `{ "confirm": "DELETE" }`. See [§7](#7-operations) |
| GET | `/api/activity` | Bearer | `?processId=`, `?limit=` (max 200). Tag/rename history, metadata only |

---

## 9. State, limits and next steps

**Live:** Drive OAuth (with the account-linking hole closed — the callback parks the grant and only the flow's starter can claim it), the watch-channel lifecycle with in-process hourly renewal, the polling fallback, work processes with per-process AI worker pools, Gemini classification with a per-process schema, rename/move with the loop guard, plan/credit metering with atomic charging, "Organize now", and account deletion. 15 automated tests cover the worker pools and account deletion (`npm test`); everything else has been verified by manual probes, curl and browser checks (no broader automated suite exists yet).

**Not built yet:**
- **Checkout and the payment-provider webhook** — Lemon Squeezy vs. Paddle undecided. Plans and limits, usage metering, and the top-up credit ledger all exist; until checkout exists, plans and credits are set by hand ([§3](#3-database)). See [../README.md](../README.md) for the wider pricing strategy, including the previewed document-sorting tier.
- **Document sorting** (PDF/Word/Docs/text) — priced for display in `plans.js`'s `DOCUMENTS` block (`available: false`), not implemented.
- **The cleanup release** — remove `/api/drive/config`, `/raw-status`, `/organize` and `/api/me`'s legacy fields now that the database side (`0003_cleanup.sql`) is already applied in production and no old frontend build is being served.
- **Re-sorting an already-sorted image** — `processed_files` is unique on `(user_id, file_id)`, so a file is sorted automatically at most once; there's no "run it again" action.

**Known limits:**
- Single backend instance only ([§6](#6-deploying-to-digitalocean)).
- Shared Drives aren't supported — Drive queries use `restrictToMyDrive: true`, and shared-drive folders are rejected when saving a process. A Raw folder from "Shared with me" isn't swept automatically by the changes feed; "Organize now" still sorts it.
- SVG and AVIF aren't sortable — `SUPPORTED_MIME_TYPES` ([src/utils/filename.js](src/utils/filename.js)) covers JPEG, PNG, WebP, GIF, HEIC, HEIF and TIFF only.
- Any image over `MAX_IMAGE_BYTES` (default 18 MB) is skipped with a readable per-file error rather than sent to Gemini.
- Duplicate output filenames are allowed within a folder — Drive keeps files distinct by ID; add a `{date}` or `{original}` token to a naming template if that's undesirable.
