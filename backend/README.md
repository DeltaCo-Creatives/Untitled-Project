# DriveTag AI — Backend

Node.js + Express 5 (ESM) API that runs DriveTag AI's two loops:

- **Loop A (onboarding):** a Google Drive OAuth grant separate from Supabase login, folder browsing, work-process CRUD, and Drive watch-channel lifecycle.
- **Loop B (pipeline):** Drive webhook (or polling) → changes-feed sweep → per-process AI worker pool → Gemini classification → naming template → rename/move in Drive → atomic credit charge.

Work processes come in two **kinds**, fixed at creation and never changed afterwards: `image` (photos, logos, graphics — the original release) and `document` (PDF, Word, Google Docs/Sheets/Slides, plain text/Markdown/CSV — added in this release). A Raw folder belongs to exactly one process, and a process only ever claims files of its own kind.

**Zero-Retention:** an incoming image or document is read into memory, sent to Gemini as inline data (never the Files API, which would retain the upload), and discarded the moment the Drive rename/move completes. No code path writes a file to disk, a database column, or a storage bucket — only filenames, tags and destination names are ever stored (`processed_files`).

**State (2026-09-20):** the app is live at `https://drivetag-ai.com` / `https://api.drivetag-ai.com`, and the full Drive loop (connect → watch → classify → rename/move → meter) runs end to end there, including the document pipeline.

**What's deployed is not what's in this branch.** The closed-beta release — the public `/beta` sign-up routes, `ADMIN_EMAILS`, `GOOGLE_APP_TESTING`, the beta-discount variables, tax-exclusive pricing (`pricesIncludeTax`) and migration `0005_beta.sql` — is committed on **`staging`** (`c3d6635`) and has **not** been merged into `production`, which is the branch DigitalOcean builds. So on the live API today:

- `GET /api/plans` answers without a `pricesIncludeTax` field.
- `POST /api/beta/signups` answers `401 {"error":"Missing bearer token"}`. That route doesn't exist on the deployed build, so the request falls past the routers in [src/app.js](src/app.js) to `app.use("/api", accountRouter)`, whose `requireAuth` rejects it. That 401 means "old backend", not "broken auth".

To ship it: run **`0005_beta.sql`** by hand in the Supabase SQL editor, set the new environment variables on DigitalOcean ([§2](#2-environment-variables)), then merge `staging` into `production` — in that order. [DeveloperToDo.md §1](../DeveloperToDo.md) has the owner's exact steps, [§3](#3-database) below says what the migration does, and [§9](#9-state-limits-and-next-steps) lists everything still open, split into what Claude builds and what only the owner can do.

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
| `MAX_IMAGE_BYTES` | No | No | `18874368` (18 MB) | Ceiling on one image sent inline to Gemini; larger files are skipped with a readable error rather than failing the whole sweep. Also caps a PDF's first-5-pages data after trimming (`document.service.js`'s `preparePdf`) — a document's own 20 MB pre-download limit is separate, in `FILE_LIMITS.documentMaxMb` ([§5](#5-how-sorting-works)) |
| `MAX_CONCURRENT_AI_JOBS` | No | No | `20` | Server-wide FIFO cap on simultaneous download+classify jobs, across every user's sweep and "Organize now" ([src/services/pipeline.service.js](src/services/pipeline.service.js)). Each in-flight job can hold up to `MAX_IMAGE_BYTES` of image data in memory — size this against the instance's RAM (e.g. 20 × 18 MB ≈ 360 MB worst case), not just Gemini's rate limit |
| `ADMIN_EMAILS` | No | No | *(empty)* | Comma-separated emails allowed to see the beta sign-up list and call `/api/beta/signups*`. Compared lower-cased and trimmed against Supabase's verified `req.user.email`. **Empty means nobody is an admin** — fails closed |
| `GOOGLE_APP_TESTING` | No | No | `false` | `true` while the Google OAuth app is in Testing status, which expires Drive refresh tokens after 7 days. Surfaces `googleAppTesting` on `/api/me` so the dashboard can warn testers to reconnect. **Set to `false` once Google grants verification** |
| `BETA_DISCOUNT_PERCENT` | No | No | `0` | 1–90. With `BETA_DISCOUNT_CODE`, lets approved beta testers see a discounted price on `/plans`. `0` or unset ⇒ the discount does not exist anywhere in the UI |
| `BETA_DISCOUNT_CODE` | No | No | *(empty)* | The Lemon Squeezy discount code shown to approved testers. Both this and the percent are required; neither value ever reaches a non-tester's `/api/me` |
| `GOOGLE_CLIENT_ID` | Yes | Semi-public | — | OAuth client, from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | Yes | — | OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | No | — | Must exactly match a redirect URI registered on the OAuth client |
| `DRIVE_WEBHOOK_URL` | Yes | No | — | Public HTTPS address Drive posts change notifications to (`.../webhook/drive`). Just a string check at boot, not a live check |
| `GOOGLE_DRIVE_WEBHOOK_TOKEN` | Yes | Yes | — | Shared secret Drive echoes back as `X-Goog-Channel-Token`; compared with `crypto.timingSafeEqual` |
| `SUPABASE_URL` | Yes | No | — | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes (very) | — | Bypasses RLS entirely. Backend only, never in a browser-shipped var. This project has migrated to Supabase's new API keys, so the value must start **`sb_secret_`** — judge it by that prefix, never by length. A legacy `eyJ…` JWT still works until legacy keys are disabled, then every `/api/*` call fails ([§7](#7-operations)) |
| `SUPABASE_ANON_KEY` | No | No | — | Only used by `scripts/get-token.js`; the running server never needs it. New-key value starts **`sb_publishable_`** — the same key the frontend ships |
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
- **Supabase URL/keys** — dashboard → Project Settings → API keys. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are not secret; `SUPABASE_SERVICE_ROLE_KEY` is. The project has moved off the legacy JWT keys (`eyJ…`) to Supabase's new ones: `sb_publishable_…` for the browser and `sb_secret_…` for the backend. Local `backend/.env` and `frontend/.env` are both on the new keys, and the live frontend bundle ships the `sb_publishable_` key with no legacy JWT in it.
  **Don't disable legacy keys in Supabase until DigitalOcean's `SUPABASE_SERVICE_ROLE_KEY` is confirmed to start `sb_secret_`.** As of 2026-09-20 nobody has checked what that variable holds on the deployed app. If it's still a legacy key when legacy keys are switched off, every `/api/*` request fails with "Invalid or expired token", all sorting stops, and `/health` stays green — nothing alerts. Check by prefix, not by length; the two key formats are different lengths but both are long.
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
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API keys → create a new secret key, then revoke the old one | Backend must restart with the new value. The replacement starts `sb_secret_`; revoke the old key only after the deployed app is confirmed running on the new one |
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
| `0004_documents.sql` | **Already applied in production** (document work processes, per-kind credits, plan families) | Adds `kind` to `work_processes` and `processed_files`; document usage columns on `subscriptions`; `kind` on `image_credit_grants`; widens `subscriptions_plan_check` to the 10 plan ids; adds `usage_snapshot`, `complete_processed_file_v2`, `grant_credits`, `admin_grant_document_credits`; updates `complete_processed_file`, `admin_set_plan`, `grant_image_credits` and `save_work_process` in place. Wrapped in one transaction, safe to re-run, purely additive |
| `0005_beta.sql` | **Before deploying this release** (readable credit-grant errors, closed-beta signups) | Replaces `grant_credits` so a removal below zero raises `insufficient_credits` — naming the kind, the balance and the amount — before writing the audit row, instead of surfacing a raw check-constraint violation; `grant_image_credits` and `admin_grant_document_credits` inherit it. Adds the `beta_signups` table (RLS on, no policies, backend-only; no FK to `auth.users`) and the owner helper `admin_mark_beta_added`. One transaction, safe to re-run, additive |

**Production status:** `0001`–`0004` are applied — `0004` is proved by the deployed backend calling `usage_snapshot` without a `"Schema problem"` line. **`0005_beta.sql` has not been run.** It must be run by hand in the Supabase SQL editor **before** the `staging` build is deployed; without it every beta route 500s. `0005` is deliberately additive — every new column has a default, and `complete_processed_file`, `admin_set_plan`, `grant_image_credits` and `save_work_process` keep their old signature and behaviour for callers that don't pass a `kind` — so the *currently deployed* backend keeps working unchanged after `0005` runs. Run it minutes or days before merging `staging`; either is safe. The *new* backend logs `"Schema problem"` at boot against a database missing `0002`, `0004` or `0005` (`schemaProblem()` below probes `image_usage`, then `usage_snapshot`, then `beta_signups`). See [DeveloperToDo.md §1.2](../DeveloperToDo.md) for the exact steps and how to check it worked. The backend code still contains the legacy `/api/drive/config`, `/raw-status`, `/organize` endpoints and `/api/me`'s legacy fields — removing them is the only piece of the `0003` cleanup release left (code only; see [§9](#9-state-limits-and-next-steps)). For a brand-new database, run `0001` → `0002` → `0003` → `0004` → `0005` in that order.

### What each table holds

| Table | Holds | Notes |
|---|---|---|
| `google_credentials` | Encrypted Drive refresh token per user | No RLS policy at all — unreachable from the browser; also encrypted at the app layer |
| `folder_configs` | Legacy single Raw + Destination config | Removed by `0003`; only relevant on a database that hasn't run it yet |
| `work_processes` | A user's AI work processes: `kind` (`image`\|`document`, fixed at creation, added by `0004`), Raw + Master folder, naming template, tag fields, instructions, time zone, on/off | Many per user; `unique (user_id, raw_folder_id)` — one process per Raw folder |
| `process_destinations` | Each process's destination folders and their AI-facing descriptions | Exactly one `is_fallback` (Unsorted) row per process, enforced by a unique partial index and by `save_work_process` |
| `drive_channels` | The active watch channel + changes-feed page token | One row per user, covering every process; `resource_id = 'polling'` marks a polling-mode row |
| `processed_files` | Filenames, tags, destination, credit bucket, `kind` (added by `0004`), status per processed file | `unique (user_id, file_id)` is what makes redelivered webhook notifications safe, and what makes a file sort automatically at most once. No image or document bytes |
| `subscriptions` | Plan, status; image usage counters (`free_images_used`, `period_images_used`, `topup_balance`); document usage counters added by `0004` (`free_documents_used`, `period_documents_used`, `document_topup_balance`) | A row is created on first Drive connect (`ensureSubscription`); no row means no processing (fail closed) |
| `image_credit_grants` | Audit log of every top-up credit change, of either kind (`kind` column added by `0004`) | `provider_reference` is unique, so a future payment webhook can't grant the same purchase twice. Table name predates documents — kept as-is; renaming would break the deployed backend's function bodies |
| `schema_migrations` | Which one-time data backfills (and, since `0004`, which migrations) have already run | Bookkeeping only |

### SQL functions

| Function | Added / changed by | Called from | Purpose |
|---|---|---|---|
| `image_usage(p_user_id)` | 0002 | kept for the currently-deployed backend | Read-only **image-only** usage snapshot, monthly counter rolled to the current billing period |
| `usage_snapshot(p_user_id)` | 0004 | `repositories/usage.repo.js` `getUsage()` | Read-only usage snapshot covering **both** kinds, same period-rollover rule as `image_usage` |
| `complete_processed_file(...)` (9-arg, v1) | 0002; updated by 0004 | kept for the currently-deployed backend | Charges one **image** credit and marks a file completed, atomically, fenced by the claim token. `0004`'s only change: rolling the period also resets `period_documents_used`, so a stale document count can't carry across a period boundary during the deploy window |
| `complete_processed_file_v2(...)` (10-arg, adds `p_kind`) | 0004 | `repositories/processedFile.repo.js` `completeFile()` | Same claim fence and `FOR UPDATE` locking as v1, generalized to charge either kind's three buckets (free → monthly → top-up → overage) and to stamp `processed_files.kind` |
| `save_work_process(...)` | 0002; updated by 0004 | `repositories/workProcess.repo.js` | Creates/updates a process and replaces its destination list in one transaction, under a per-user advisory lock, enforcing the plan's process limit. `0004` adds kind handling: stores `kind` (defaulting to `image`) on insert; on update, raises `process_kind_immutable` if the caller sends a `kind` that disagrees with the stored one |
| `grant_image_credits(...)` | 0002; delegates as of 0004 | `admin_grant_credits`, a future payment webhook | Adds or removes **image** top-up credits and logs why. Since `0004` it's a thin wrapper around `grant_credits(..., 'image', ...)` — one code path, same signature |
| `grant_credits(p_user_id, p_kind, p_amount, p_reason, p_source, p_reference)` | 0004, fixed in 0005 | `admin_grant_credits`, `admin_grant_document_credits`, `grant_image_credits`, a future Lemon Squeezy webhook | Adds or removes top-up credits of either kind and logs the grant. Locks the subscription row, then refuses a removal that would go below zero with `insufficient_credits: <kind> top-up balance is N, cannot remove M` — raised before the log row is written, so a refused grant leaves no trace |
| `admin_mark_beta_added(p_email)` | 0005 | the owner, in the SQL editor | Marks a beta sign-up as added to Google's test-user list. Returns false when there's no sign-up for that email. Revoked from every API role |
| `admin_set_plan` / `admin_grant_credits` / `admin_grant_document_credits` | 0002 / 0002 / 0004 | SQL editor only | Owner helpers — not exposed to any API role (see grants below). `admin_set_plan`'s plan-change/restart branch also resets `period_documents_used` as of `0004` |

`billing_period`, `image_usage`, `complete_processed_file`, `complete_processed_file_v2`, `usage_snapshot`, `grant_image_credits`, `grant_credits` and `save_work_process` are granted to `service_role` only. `admin_set_plan`, `admin_grant_credits` and `admin_grant_document_credits` are revoked from every role including `service_role` — they only run as the database owner, from the SQL editor.

### Managing plans and credits by hand

Checkout isn't built yet (Lemon Squeezy is chosen as Merchant of Record but nothing charges anyone). Run these in the Supabase SQL Editor (verified against the function signatures in `0002_work_processes.sql`, `0004_documents.sql` and `0005_beta.sql`).

Since `0005`, a removal that would take a balance below zero is refused with `insufficient_credits: document top-up balance is 0, cannot remove 250` instead of a raw check-constraint violation, and nothing is written to the grants log when it is refused.

Plan ids — one free plan, plus three families × three tiers ([§5](#5-how-sorting-works) has the allowances and prices):

| Family | Plan ids |
|---|---|
| — | `free` |
| Images | `creator`, `studio`, `enterprise` |
| Documents | `docs-creator`, `docs-studio`, `docs-enterprise` |
| Images + Documents | `complete-creator`, `complete-studio`, `complete-enterprise` |

```sql
-- Upgrade (a plan change restarts the monthly period, both kinds)
select public.admin_set_plan('client@example.com', 'complete-studio');   -- any of the 10 ids above
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
-- Sell an image pack (never expires; used after the plan's monthly image allowance)
select public.admin_grant_credits('client@example.com', 1000, 'Image pack 1000, invoice #12');
```

```sql
-- Sell a document pack (same rules, its own balance)
select public.admin_grant_document_credits('client@example.com', 250, 'Document pack 250, invoice #13');
```

```sql
-- Take credits back (fails, changing nothing, if the balance would go negative)
select public.admin_grant_document_credits('client@example.com', -250, 'Refund, invoice #13');
```

```sql
-- Where someone stands, both kinds
select * from public.usage_snapshot((select id from auth.users where email = 'client@example.com'));
```

Plan limits (process count, image/document allowances, packs) live only in `backend/src/config/plans.js`, never in SQL — change them there and redeploy. **Adding or renaming a plan id also needs `subscriptions_plan_check` updated in a new migration** — the 10 ids above are the ones `0004` allows.

---

## 4. Commands

All run from `backend/`.

| Command | Does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start without auto-reload |
| `npm test` | `node --test --experimental-test-module-mocks "test/**/*.test.js"` — **152 tests across 10 test files, all passing as of 2026-09-20**: pipeline worker pools, account deletion, entitlement math, per-kind organize-now (402 gating), process/template validation, document reading (`document.service.js`), Gemini request/response shapes, naming-template vectors, the beta routes (validation, the 5-per-hour-per-IP limiter, the `ADMIN_EMAILS` gate, CSV formula escaping), and — via `@electric-sql/pglite`, an in-memory Postgres — the real SQL from every migration file applied in order, exercised through the actual `complete_processed_file[_v2]` / `grant_credits` / `save_work_process` functions. Every collaborator is mocked or in-memory; no `.env`, network, or real Supabase project needed. Needs **Node 22.3+** for `--experimental-test-module-mocks` (the server itself runs on 18+) |
| `npm run test:gemini [image or document path] [--process spec.json]` | Classifies one local file with Gemini and prints the tags + the filename the pipeline would rename to. The kind is inferred from the file's extension (`.pdf`, `.docx`, `.txt`, `.md`, `.csv` → document; anything else → image); a document is read with `document.service.js`'s `prepareDocumentBuffer` (PDF/docx/text only — no Drive, so no Google-native export). Needs only `GEMINI_API_KEY`. **The default path (`test-assets/sample.jpg`) doesn't exist in this repo** — pass a real file, e.g. `npm run test:gemini test-assets/Test1.jpg` or `npm run test:gemini test-assets/invoice.pdf`. `--process spec.json` tries a specific work process's destinations/tags/instructions (the API's camelCase shape) instead of the built-in legacy single-Unsorted process for that kind |
| `npm run renew:channels` | Renews any Drive watch channel expiring within 24h, right now. Optional in production — the running server already does this hourly in-process (`NODE_ENV=production`); this is only useful as an out-of-band safety net or for a one-off manual renewal |
| `npm run token -- <email> <password>` | Mints a Supabase access token for a test user, for curling authenticated routes. Needs only `SUPABASE_URL`/`SUPABASE_ANON_KEY` |

---

## 5. How sorting works

1. Drive posts a webhook, or the auto-sync poller ticks (`AUTO_SYNC_INTERVAL_SECONDS > 0`).
2. The user's changes feed is swept from the stored page token; each changed file's direct parent and MIME type are matched against an active process's Raw folder and kind (`MIME_TYPES_BY_KIND[process.kind]`) — a file of the wrong kind for its Raw folder's process is left alone entirely, never claimed. A Google-native file (Doc/Sheet/Slide) still inside its 10-minute editing grace is skipped the same way, so it stays "waiting" until a later sweep or "Organize now" finds it past the grace window ([§9](#9-state-limits-and-next-steps)).
3. Matched files are grouped by process and run through that process's own worker pool, sized to `plan.aiPerProcess`. Different processes' pools run concurrently with each other — an image process and a document process both sort at once — and a server-wide semaphore (`MAX_CONCURRENT_AI_JOBS`) caps total download+classify concurrency across every user and every kind.
4. Each worker: reserves one credit of the file's kind synchronously, claims the file (idempotency), reads it into memory (image: downloaded whole; document: [below](#documents)), sends it to Gemini with the process's destinations/tag fields/instructions, renders the naming template, and renames+moves the file in Drive (never into any Raw folder — the loop guard). The credit is only actually charged, atomically, on success (`complete_processed_file_v2`); every other outcome releases the reservation.
5. **"Organize now"** (`POST /api/processes/:id/organize`, or the legacy `/api/drive/organize`) runs the same per-process worker pools directly against a Raw folder's current contents, for files the changes feed never reported because they arrived before the watch existed.
6. When nothing can run — no active processes, or every kind that has a runnable process is out of credits — the page token is fast-forwarded instead of listing changes, so a later Drive change doesn't have to re-read an ever-growing backlog. An account with, say, an image process out of credits and a document process that still has some keeps sorting documents; the exhausted kind's files just wait in Raw for "Organize now".

### Documents

Supported types (`MIME_TYPES_BY_KIND.document` in [src/utils/filename.js](src/utils/filename.js)), all read **in memory only**, never to disk:

| MIME | How it's read | Cap |
|---|---|---|
| `application/pdf` | `pdf-lib` loads it; pages beyond the limit are copied into a fresh, smaller PDF; sent to Gemini inline as `application/pdf` | First `FILE_LIMITS.pagesRead` (5) pages |
| `.docx` (`application/vnd...wordprocessingml.document`) | `mammoth.extractRawText({ buffer })` | First `FILE_LIMITS.textChars` (12,000) characters |
| `text/plain`, `text/markdown`, `text/x-markdown`, `text/csv` | UTF-8 decode (leading BOM stripped, invalid bytes replaced, never throws) | First 12,000 characters |
| `application/vnd.google-apps.document` | Drive `files.export` → `text/plain` | First 12,000 characters |
| `application/vnd.google-apps.presentation` | Drive `files.export` → `text/plain` | First 12,000 characters |
| `application/vnd.google-apps.spreadsheet` | Drive `files.export` → `text/csv` (first sheet) | First 12,000 characters |

All of this is `services/document.service.js`'s `prepareDocument(userId, file)`, returning `{ mode: 'pdf', data, pages, pagesRead }` or `{ mode: 'text', text, truncated }`. Other behaviour worth knowing:

- **20 MB size limit before download** (`FILE_LIMITS.documentMaxMb`), checked from Drive's reported `file.size` so an oversized file is never even fetched, let alone charged. Google-native files report no `size`; Drive's own ~10 MB export limit is the backstop, surfaced as a readable message (`exportSizeLimitExceeded`).
- **docx zip-bomb guard.** A `.docx` is a zip; `declaredUnzippedBytes()` sums the central directory's declared uncompressed sizes *without inflating anything*, and a file that would unpack past `DOCX_MAX_UNPACKED_BYTES` (100 MB) is rejected before `mammoth` ever touches it.
- **Encrypted/corrupt files fail readably**, never with a stack trace: "This PDF is password protected. Remove the password and try again.", "DriveTag couldn't open this PDF. It may be corrupted.", "DriveTag couldn't open this Word file safely. It may be corrupted, or it unpacks to far more than a normal document.", "DriveTag couldn't open this Word file. It may be corrupted or not really a .docx." A non-PDF document whose extracted text is empty fails with "This document has no readable text."
- **Google-native files (Docs/Sheets/Slides) get a 10-minute editing grace** (`FILE_LIMITS.editingGraceMinutes`, `isStillBeingEdited(file, now)` in `document.service.js`): a file whose `modifiedTime` is inside that window is left alone entirely — not claimed, not charged, not counted as failed — because someone may still be writing it. It shows as "waiting" and is queued in memory for an automatic re-check once the window has passed (grace + 30 s), so it's sorted without anyone clicking anything. The re-check drops files that were moved, trashed or deleted meanwhile, re-defers files edited again, and keeps the entry through a Drive error. The queue is per instance and in memory (capped at 500 files per user): after a backend restart, such files wait for "Organize now".

**AI document classification** (`gemini.service.js` `classifyDocument(content, process)` → `{ topic, type, organization, documentDate, fields, destination, matched }`):

- Response fields, in schema order: `topic` (what it's about, a few words), `type` (invoice, receipt, contract, proposal, brief, report, letter, form, presentation, spreadsheet, …), `organization` (who it's from/for, `""` if unclear), `documentDate` (`YYYY-MM-DD` the document itself shows, `""` if unclear and validated round-trip through `Date` so e.g. Feb 30 can't survive), then the process's custom tag fields, then `destination` last.
- **The system instruction is injection-hardened**, unlike the image one: it tells the model explicitly that everything inside the document is content, never an instruction — including text that looks like a system prompt or an "ignore previous instructions" attempt — because documents (unlike photos) are realistic prompt-injection vectors. A PDF is sent as `inlineData` (never the Files API — Zero-Retention). Extracted text is wrapped in a fence the document's own text can't spoof: `fenceSafe()` neutralizes any literal `<<<START DOCUMENT>>>`/`<<<END DOCUMENT>>>` markers already in the text before it's embedded.
- **`DOCUMENT_COST_CONFIG`** uses `MediaResolution.MEDIA_RESOLUTION_LOW` (lower than images' `MEDIUM` — documents are text-dominated pages, not photos) with the same `ThinkingLevel.LOW`. Measured on `gemini-3.6-flash` (2026-09-19, code comment in `gemini.service.js`): a 1-page invoice PDF cost 828 total tokens at LOW vs. 1,228 at MEDIUM; a 5-page text-heavy report PDF cost 1,969 at LOW vs. 3,150 at MEDIUM — LOW ran 33–38% cheaper both times and picked the same type/destination/organization both times. A ~12,000-character text document (no PDF, so `mediaResolution` doesn't apply) cost 2,868 prompt tokens.

### Credits, per kind

Every user has two independent balances — image and document — each drawn in the same order: free (lifetime, Free plan only) → this billing period's monthly allowance → top-up packs (never expire) → `overage` (only reachable when two backend instances overlap mid-deploy). Failed files are never charged. A run reads both kinds' remaining credits once at the start (`loadEntitlement` → `{ image, document }`); each file reserves one credit of its own process's kind before its first `await`, synchronously, so concurrent workers can't over-dispatch. See "Loop guard" and "Several AI workers per process" in [../CLAUDE.md](../CLAUDE.md) for the full concurrency story — it's unchanged, just now keyed per kind.

### Naming

Rename templates use tokens per process kind, plus `{tag:<key>}` for the process's own custom fields (`TEMPLATE_TOKENS_BY_KIND`, [src/utils/filename.js](src/utils/filename.js)):

| Kind | Tokens | Default template |
|---|---|---|
| `image` | `destination`, `subject`, `style`, `genre`, `date`, `original`, `process` | `{destination}_{subject}` |
| `document` | `destination`, `type`, `topic`, `organization`, `docdate`, `date`, `original`, `process` | `{type}_{organization}_{topic}` |

A token from the *other* kind is rejected with a hint naming that kind's own tokens (`validateTemplate(template, tagKeys, kind)`), e.g. "`{genre}` is an image token; document processes use `{type}`, `{topic}` or `{organization}`." Reserved tag-field keys are the process's **own** kind's tokens plus the built-in words (`tag`, `tags`, `ext`, `unsorted`, `fields`) — not the union of both kinds', because existing image processes may already have a tag keyed `type` or `topic`, which only mean something to document processes. `docdate` falls back to `""` unless the AI's `documentDate` is a real calendar date; Google-native files keep no file extension (Drive itself has none for them). Both renderers — `backend/src/utils/filename.js` (real files) and `frontend/src/lib/filename.ts` (the editor's live preview) — are checked line-for-line against `tests/filename-vectors.json` by the committed `test/filename-vectors.test.js` ([§4](#4-commands)).

### Plans & pricing (`backend/src/config/plans.js`)

Free, plus three **families** that share the same three **tiers** (processes and AI workers per process are the same across a family; the family only decides which monthly allowances come included). Any plan can run either kind of work process and buy either kind of top-up pack.

| Tier | Processes | AI / process | Images family | Documents family | Images + Documents family |
|---|---|---|---|---|---|
| **Free** | 1 | 1 | 100 images, lifetime | 25 documents, lifetime | (same row — Free isn't per-family) |
| **Creator** | 5 | 3 | `creator` — 1,000 img/mo, $9.99 ($99.90/yr) | `docs-creator` — 500 docs/mo, $7.99 ($79.90/yr) | `complete-creator` — 1,000 img + 500 docs/mo, $14.99 ($149.90/yr) |
| **Studio** | 15 | 5 | `studio` — 5,000 img/mo, $29.99 ($299.90/yr) | `docs-studio` — 2,000 docs/mo, $24.99 ($249.90/yr) | `complete-studio` — 5,000 img + 2,000 docs/mo, $44.99 ($449.90/yr) |
| **Enterprise** | 50 | 15 | `enterprise` — 25,000 img/mo, $99.99 (monthly only) | `docs-enterprise` — 7,500 docs/mo, $79.99 (monthly only) | `complete-enterprise` — 25,000 img + 7,500 docs/mo, $149.99 (monthly only) |

The Studio tier of each family is `popular: true` ("Recommended" badge). Enterprise tiers are billed monthly only, by decision; the others also offer yearly at 2 months free.

**Top-up packs** (never expire, used after the plan's allowance for that kind): images 250/$4.99, 1,000/$14.99, 5,000/$49.99 (`TOPUP_PACKS`); documents 250/$5.99, 1,000/$19.99, 5,000/$79.99 (`DOCUMENT_PACKS`). All prices are USD placeholders rendered on the pricing pages — no payment provider is wired up yet, so purchase buttons show "Coming soon."

**`FILE_LIMITS`** (also in `plans.js`, since it's what keeps document pricing safe — a 500-page PDF costs the same as a 5-page one): `documentMaxMb: 20`, `pagesRead: 5`, `textChars: 12000`, `editingGraceMinutes: 10`. **`PROCESS_LIMITS`** caps destinations (20, not counting Unsorted), tag fields (10), and various field lengths — unchanged by this release, enforced by both `processValidation.js` and the frontend editor.

---

## 6. Deploying to DigitalOcean

**App Platform settings:** connect the GitHub repo, **Source Directory** `/backend`, build command `npm ci`, run command `npm start`. Both the frontend (Vercel) and this backend deploy from the same repo/branch (`production`) — don't split them. `staging` is currently ahead of `production` by the whole closed-beta release; deploying means merging it (in the order in [§9](#9-state-limits-and-next-steps)), not changing either host's branch.

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
- `"Schema problem"` — logged if migration `0002_work_processes.sql`, `0004_documents.sql` or `0005_beta.sql` hasn't been run against this database yet ([src/repositories/usage.repo.js](src/repositories/usage.repo.js) `schemaProblem()`, which checks `image_usage`, then `usage_snapshot`, then `beta_signups`).

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

**Every `/api/*` request answers "Invalid or expired token" while `/health` is fine.** That pairing means the backend's Supabase key is dead or wrong, not that a user's session expired — `/health` never touches Supabase, so it stays green and nothing alerts. Check `SUPABASE_SERVICE_ROLE_KEY` on DigitalOcean **by prefix**: it must start `sb_secret_` now that the project has moved to Supabase's new API keys. The most likely causes are a legacy `eyJ…` key left in place after legacy keys were disabled, or a publishable key pasted into the service-role slot.

**A `"Schema problem"` line that names a migration you know you've already run.** Known defect, not yet fixed: `schemaProblem()` ([src/repositories/usage.repo.js](src/repositories/usage.repo.js)) treats *any* error from its probe as a missing migration, so a bad key reads as

```
The database is missing supabase/migrations/0002_work_processes.sql (Invalid API key). Run it in the Supabase SQL editor.
```

Read the text in brackets before acting: `Invalid API key`, `JWT`, or any permission wording means the credential, not the schema — re-running the migration will change nothing. Only a `function ... does not exist` / `relation ... does not exist` message actually means the migration is missing. Making that message distinguish the two cases is on Claude's list ([§9](#9-state-limits-and-next-steps)).

**Account deletion.** `DELETE /api/me` with body `{ "confirm": "DELETE" }`:
1. 409 `sorting_in_progress` if a sweep is currently running for that user (refuses rather than race a worker that might still move a file after credentials are gone).
2. Stops the Drive watch, revokes the refresh token at Google, deletes the stored credential — failures here are logged but don't block deletion (once the DriveTag rows are gone the token is unusable anyway).
3. Drops any Drive-connect grant parked but never claimed for that user.
4. Deletes the Supabase auth user. Every app table cascades from `auth.users(id)`, directly or (for `process_destinations`, via `work_processes`) transitively, so this removes the rest of the account's data.

---

## 8. API reference

All `/api/*` routes except `GET /api/plans` and `POST /api/beta/signups` require `Authorization: Bearer <supabase-access-token>`. Legacy routes are removed in the cleanup release (code change only — the database side, `0003_cleanup.sql`, is already applied in production). The four `/api/beta/*` routes exist on `staging` only; on the live backend they 401 with "Missing bearer token" because the router isn't there (see **State**, top of this file).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | |
| POST | `/webhook/drive` | `X-Goog-Channel-Token` shared secret | Acks immediately, sweeps in the background |
| POST | `/api/auth/google/start` | Bearer | Returns a Google consent URL |
| GET | `/api/auth/google/callback` | signed `state` param | Hit by Google's redirect; parks the grant, redirects to `/connect?pending=` |
| POST | `/api/auth/google/complete` | Bearer, must be the user who started the flow | Claims the parked grant |
| DELETE | `/api/auth/google` | Bearer | Disconnects Drive |
| GET | `/api/plans` | none | Public plan/pricing data for the frontend |
| POST | `/api/beta/signups` | none | Public closed-beta signup form. 5 per hour per IP; validated first, so a rejected body never spends that budget. Always answers `201 {received:true}`, whether the email was new or already listed |
| GET | `/api/beta/signups` | Bearer + `ADMIN_EMAILS` | The sign-up list plus `{total, added, pending}` counts |
| PATCH | `/api/beta/signups/:id` | Bearer + `ADMIN_EMAILS` | `{addedToGoogle?, notes?}` |
| GET | `/api/beta/signups.csv` | Bearer + `ADMIN_EMAILS` | CSV export for mail-merge. Cells starting with `=`, `+`, `-` or `@` are apostrophe-prefixed so a spreadsheet can't execute a name from the public form |
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
| POST | `/api/processes` | Bearer | Create a work process. Body requires `kind` (`"image"` \| `"document"`) — a missing/invalid value is a 400 field error on `kind` |
| GET | `/api/processes/status` | Bearer | Per-process Raw folder counts + live worker counts |
| GET | `/api/processes/:id` | Bearer | |
| PUT | `/api/processes/:id` | Bearer | Omit `kind`, or send the process's existing one — a `kind` that disagrees with the stored value is a 400 field error on `kind` (a process's kind never changes) |
| PATCH | `/api/processes/:id` | Bearer | Body `{ enabled: boolean }` |
| DELETE | `/api/processes/:id` | Bearer | Deleting the last process also stops the watch |
| POST | `/api/processes/:id/organize` | Bearer | "Organize now" for one process. 402 with code `out_of_images` or `out_of_documents` (naming that process's own kind) when its kind has no credits left; response includes `willProcess = min(waiting, credits[kind])` |
| GET | `/api/me` | Bearer | Dashboard summary: `plan` (`freeImages`/`freeDocuments`/`monthlyImages`/`monthlyDocuments`), `usage` (`images`/`documents`, each `{ freeUsed, freeLimit, periodUsed, periodLimit, topupBalance, remaining, exhausted }`, plus legacy flat fields that mirror `images`), process counts, watch state (plus **legacy** `config`/`subscription`/`entitled` fields, removed in the cleanup release) |
| DELETE | `/api/me` | Bearer | Body `{ "confirm": "DELETE" }`. See [§7](#7-operations) |
| GET | `/api/activity` | Bearer | `?processId=`, `?limit=` (max 200). Tag/rename history, metadata only; each row's `kind` says which fields its `tags` holds (`genre`/`subject`/`style` for images, `type`/`topic`/`organization`/`document_date` for documents) — rows written before `0004` have no `kind` and are treated as images |

---

## 9. State, limits and next steps

**Done — written, tested, and committed on `staging`:** Drive OAuth (with the account-linking hole closed — the callback parks the grant and only the flow's starter can claim it), the watch-channel lifecycle with in-process hourly renewal, the polling fallback, work processes of both kinds (`image` and `document`) with per-process AI worker pools, Gemini classification with a per-process schema for each kind, the document pipeline (PDF/Word/Google Docs·Sheets·Slides/text, in memory only), rename/move with the loop guard, per-kind plan/credit metering with atomic charging, "Organize now", account deletion, the closed-beta sign-up list with its admin-only endpoints, the `insufficient_credits` fix in `grant_credits` (`0005`), and tax-exclusive pricing (`pricesIncludeTax: false` on `GET /api/plans`). 152 automated tests (`npm test`, [§4](#4-commands)) cover the worker pools, account deletion, entitlement math, per-kind organize-now gating, process/template validation, document reading, Gemini request/response shapes, naming-template vectors, the beta routes (validation, rate limiting, the admin gate, CSV escaping), and — via an in-memory Postgres — every SQL migration and function; everything else has been verified by manual probes, curl and browser checks.

**Done but not live:** everything in the closed-beta release is on `staging` only. The deployed backend predates it — see **State** at the top of this file.

### Claude builds this next (code work — ask for it)

- **Lemon Squeezy checkout and its webhook.** The provider is chosen (Merchant of Record: it collects and remits VAT/sales tax, which is why prices are quoted tax-exclusive) and named across the legal pages, but nothing charges anyone — the plan cards say "Coming soon". What gets built:
  - Hosted-checkout links from the plan cards and top-up packs, one variant per purchasable thing.
  - `POST /webhook/lemonsqueezy`, mounted beside `/webhook/drive` in [src/app.js](src/app.js) and public. It verifies the HMAC-SHA256 signature of the **raw** body against the store's signing secret with `crypto.timingSafeEqual` (so it needs the raw body, not the parsed one) and rejects anything that doesn't match.
  - Handlers for `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled` and `subscription_expired`. A pack order calls `grant_credits(user, kind, amount, reason, source, reference)` with the Lemon Squeezy order id as `provider_reference` — that column is unique, so a redelivered webhook can't grant the same purchase twice. A subscription event sets `subscriptions.plan`, `status` and (on a plan change) `period_anchor`, the same fields `admin_set_plan` writes today.
  - Mapping a Lemon Squeezy variant to a plan id is unambiguous only if each variant is *named after* its plan id from [src/config/plans.js](src/config/plans.js) — see the owner list below.
  - **Blocked on the owner** supplying store id, variant ids, API key and webhook signing secret ([../DeveloperToDo.md §2](../DeveloperToDo.md)). See [../README.md](../README.md) for the wider pricing strategy.
- **Fix `schemaProblem()`'s misleading message** ([src/repositories/usage.repo.js](src/repositories/usage.repo.js)): it blames a missing migration for *any* probe error, so a dead or wrong Supabase key reads as "The database is missing supabase/migrations/0002_work_processes.sql (Invalid API key)" and sends the owner to re-run an applied migration ([§7](#7-operations)).
- **Delete the stray debug JSON committed on `production`** — `backend/h.json`, `backend/m.json`, `backend/p.json` plus `frontend/r2.json` and `frontend/r3.json` are saved curl output (a `/health` response, an auth error, an `/api/plans` dump, two Supabase auth dumps). Nothing reads them; they aren't fixtures — or do it yourself with the `git rm` in [../DeveloperToDo.md §1.1](../DeveloperToDo.md).
- **The cleanup release** — remove `/api/drive/config`, `/raw-status`, `/organize` and `/api/me`'s legacy fields now that the database side (`0003_cleanup.sql`) is already applied in production and no old frontend build is being served.
- **Re-sorting an already-sorted file** — `processed_files` is unique on `(user_id, file_id)`, so a file is sorted automatically at most once; there's no "run it again" action.
- **`helmet` and app-wide rate limiting.** Only `POST /api/beta/signups` has a limiter today (5 per IP per hour, in-process).

### The owner does this first (no code can do it)

1. **Run `0005_beta.sql`** in the Supabase SQL editor ([§3](#3-database), [../DeveloperToDo.md §1.2](../DeveloperToDo.md)). Before the merge, not after.
2. **Set the new DigitalOcean variables**: `ADMIN_EMAILS` (empty = nobody is an admin), `GOOGLE_APP_TESTING`, and `BETA_DISCOUNT_PERCENT` + `BETA_DISCOUNT_CODE` if the beta discount is being offered ([§2](#2-environment-variables)).
3. **Confirm `SUPABASE_SERVICE_ROLE_KEY` on DigitalOcean starts `sb_secret_`** — and do not disable legacy keys in Supabase until it does ([§2](#2-environment-variables), [§7](#7-operations)). This is unverified as of 2026-09-20.
4. **Merge `staging` into `production`** and watch the deploy's boot logs for `"Production config problem"` and `"Schema problem"` ([§6](#6-deploying-to-digitalocean)).
5. **Lemon Squeezy**: create the store, create one variant per paid plan and per top-up pack, **name each variant after its plan id** (`creator`, `docs-studio`, `complete-enterprise`, …), then hand Claude the store id, the variant ids, an API key and the webhook signing secret. Keep `drivetag-ai.com`'s apex A record pointed at Vercel — a checkout subdomain with a CNAME is the correct way to attach Lemon Squeezy ([../DeveloperToDo.md §2.1](../DeveloperToDo.md)).
6. **Confirm Drive watches now register.** Domain verification (Search Console + Cloud) is recorded done and the Namecheap DNS is settled ([../DeveloperToDo.md §4](../DeveloperToDo.md)); check whether webhooks work and, if so, move `AUTO_SYNC_INTERVAL_SECONDS` to `0` ([§6](#6-deploying-to-digitalocean)). Restricted-scope verification and the CASA track are still open ([../DeveloperToDo.md §4](../DeveloperToDo.md)).
7. **Plans and credits stay manual** until checkout exists — the SQL in [§3](#3-database).

### Known limits

- Single backend instance only ([§6](#6-deploying-to-digitalocean)).
- Shared Drives aren't supported — Drive queries use `restrictToMyDrive: true`, and shared-drive folders are rejected when saving a process. A Raw folder from "Shared with me" isn't swept automatically by the changes feed; "Organize now" still sorts it.
- SVG and AVIF aren't sortable as images — `MIME_TYPES_BY_KIND.image` ([src/utils/filename.js](src/utils/filename.js)) covers JPEG, PNG, WebP, GIF, HEIC, HEIF and TIFF only.
- `.xlsx`, `.pptx` and legacy `.doc` aren't sortable as documents — only PDF, `.docx`, plain text/Markdown/CSV, and Google Docs/Sheets/Slides (`MIME_TYPES_BY_KIND.document`, [§5](#5-how-sorting-works)).
- Any image over `MAX_IMAGE_BYTES` (default 18 MB), or any document over `FILE_LIMITS.documentMaxMb` (20 MB), is skipped with a readable per-file error rather than sent to Gemini — and never charged.
- A Google Doc/Sheet/Slide edited within the last `FILE_LIMITS.editingGraceMinutes` (10) minutes is left alone entirely: not claimed, not charged, not counted as failed. It shows as "waiting" (there's no separate "still editing" status) and is sorted automatically about 10½ minutes after its last edit via the in-memory re-check queue — unless the backend restarts in between, in which case "Organize now" picks it up.
- Duplicate output filenames are allowed within a folder — Drive keeps files distinct by ID; add a `{date}` or `{original}` token to a naming template if that's undesirable.
