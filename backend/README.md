# DriveTag AI — Backend

Node.js + Express 5 (ESM) API that runs DriveTag AI's two loops:

- **Loop A (onboarding):** a Google Drive OAuth grant separate from Supabase login, folder browsing, work-process CRUD, and Drive watch-channel lifecycle.
- **Loop B (pipeline):** Drive webhook (or polling) → changes-feed sweep → per-process AI worker pool → Gemini classification → naming template → rename/move in Drive → atomic credit charge.

Work processes come in two **kinds**, fixed at creation and never changed afterwards: `image` (photos, logos, graphics — the original release) and `document` (PDF, Word, Google Docs/Sheets/Slides, plain text/Markdown/CSV — added in this release). A Raw folder belongs to exactly one process, and a process only ever claims files of its own kind.

**Zero-Retention:** an incoming image or document is read into memory, sent to Gemini as inline data (never the Files API, which would retain the upload), and discarded the moment the Drive rename/move completes. No code path writes a file to disk, a database column, or a storage bucket — only filenames, tags and destination names are ever stored (`processed_files`).

**State (2026-09-21):** the app is live at `https://drivetag-ai.com` / `https://api.drivetag-ai.com`, and the full Drive loop (connect → watch → classify → rename/move → meter) runs end to end there, including the document pipeline.

**The checkout release is deployed.** `staging` has been merged into `production` (`ad42d23` → `aa9f464`), DigitalOcean is serving that build, and migrations `0001`–`0006` have all been run. On the live API today:

- `GET /api/plans` answers with `pricesIncludeTax: false`, `merchantOfRecord: "Lemon Squeezy"` and `checkoutEnabled: false` — false only because no Lemon Squeezy variants are configured yet, so every plan and pack correctly still shows "Coming soon".
- `POST /api/checkout` and the signature-verified `POST /webhook/lemonsqueezy` are deployed, along with `helmet`, the app-wide `/api` rate limit and the `schemaProblem()` that tells a bad Supabase key apart from a missing migration ([§7](#7-operations)).
- `POST /api/beta/signups` answers `{"received":true}` — the public closed-beta form works end to end.
- Three of the four `/api/beta/*` routes are admin routes gated on `ADMIN_EMAILS`, which is set on DigitalOcean: `GET /signups`, `PATCH /signups/:id`, `GET /signups.csv`. The fourth, `POST /signups`, is the public visitor-facing signup form and carries no auth. The owner has confirmed the sign-ups card shows for them and for nobody else, and the leftover `t@example.com` test row is deleted.
- `SUPABASE_SERVICE_ROLE_KEY` on DigitalOcean is the new `sb_secret_` key, and the browser ships the matching `sb_publishable_` one.
- **No real payment has ever been put through checkout** — every part of it is unit-tested, but no card has ever been charged. That is still the most important owner task ([§9](#9-state-limits-and-next-steps)).

**Uncommitted in the working tree: the owner admin dashboard.** Written and tested (242 tests, [§4](#4-commands)), **not committed and not deployed**. It adds:

- `/admin` in the frontend — rendered only when `GET /api/me` says `admin` — backed by five owner-only endpoints under `/api/admin`: settings, account lookup by email, plan changes and credit grants ([§8](#8-api-reference)). Every one of them re-checks `ADMIN_EMAILS` server-side; the `admin` flag only decides whether the page renders.
- **Five runtime settings**, resolved `database → environment → default`, so the store slug, the 21 variant ids, the beta discount and the Google-testing flag can change without a redeploy ([§2](#settings-the-owner-can-change-at-runtime)). Secrets and `ADMIN_EMAILS` are excluded by construction.
- Migration `0007_admin.sql`, which **has not been run yet** ([§3](#3-database)). The release is safe to deploy before it: a settings-table outage logs once and falls back to environment values.
- **[../LemonSqueezySetup.md](../LemonSqueezySetup.md)** at the repo root — the field-by-field walkthrough of the Lemon Squeezy dashboard (all 21 products with their names, prices and intervals, what to leave empty on the Add Product form, the tax category, reading a variant id off a checkout link, and the webhook with its eight events). This README points there for Lemon Squeezy mechanics rather than repeating them.

**DNS incident, resolved same day:** on 2026-09-20 the apex `drivetag-ai.com` briefly resolved to Lemon Squeezy as well as Vercel, and the Lemon Squeezy address answered HTTP 403, so a share of visitors got an error page. `api.drivetag-ai.com` and `www` were unaffected. The owner deleted the extra record the same day it appeared; the apex now resolves to Vercel only. Full story and the standing rule against repeating it: [DeveloperToDo.md §2.1](../DeveloperToDo.md).

[§3](#3-database) below has the migration state, and [§9](#9-state-limits-and-next-steps) lists everything still open, split into what Claude builds and what only the owner can do.

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
| `MAX_CONCURRENT_AI_JOBS` | No | No | `20` | Server-wide FIFO cap on simultaneous download+classify jobs, across every user's sweep and "Organize now" ([src/services/pipeline.service.js](src/services/pipeline.service.js)). Each in-flight job can hold up to `MAX_IMAGE_BYTES` of image data in memory — size this against the instance's RAM (e.g. 20 × 18 MB ≈ 360 MB worst case), not just Gemini's rate limit. **Recommended at `10` on the current 1 GB instance** — nobody has confirmed the deployed value against the DigitalOcean dashboard, so check before relying on it; the default `20` suits 2 GB+. No plan's `aiPerProcess` should ever exceed this value ([§5](#5-how-sorting-works)) |
| `ADMIN_EMAILS` | No | No | *(empty)* | Comma-separated emails allowed to see the beta sign-up list, call `/api/beta/signups*` and use every `/api/admin/*` route. Compared lower-cased and trimmed against Supabase's verified `req.user.email`. **Empty means nobody is an admin** — fails closed. **Environment-only, by design**: it is the root of trust for the admin API, so it is not a setting and there is no write path to it ([below](#settings-the-owner-can-change-at-runtime)) |
| `GOOGLE_APP_TESTING` | No | No | `false` | `true` while the Google OAuth app is in Testing status, which expires Drive refresh tokens after 7 days. Surfaces `googleAppTesting` on `/api/me` so the dashboard can warn testers to reconnect. **Set to `false` once Google grants verification.** Overridable from `/admin` ([below](#settings-the-owner-can-change-at-runtime)) |
| `BETA_DISCOUNT_PERCENT` | No | No | `0` | 1–90. With `BETA_DISCOUNT_CODE`, lets approved beta testers see a discounted price on `/plans`. `0` or unset ⇒ the discount does not exist anywhere in the UI. Overridable from `/admin` |
| `BETA_DISCOUNT_CODE` | No | No | *(empty)* | The Lemon Squeezy discount code shown to approved testers. Both this and the percent are required; neither value ever reaches a non-tester's `/api/me`. Overridable from `/admin` |
| `LEMONSQUEEZY_STORE` | No | No | *(empty)* | Store subdomain slug — the `<store>` in `https://<store>.lemonsqueezy.com/checkout/buy/…`. Needed together with `LEMONSQUEEZY_VARIANTS` before anything is purchasable. Overridable from `/admin`, which is now the expected way to set it |
| `LEMONSQUEEZY_VARIANTS` | No | No | *(empty)* | JSON map of our plan/pack id → Lemon Squeezy variant id, e.g. `{"creator":"111","creator-yearly":"112","pack-250":"210"}`. A plan's yearly price is keyed `<planId>-yearly`. Unparseable input is treated as "no variants" and logged once at boot, never a crash. Built with a **null prototype**, because ids arrive in request bodies and a plain object would resolve `__proto__`/`constructor` to inherited members. Overridable from `/admin`, which is now the expected way to set it |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | No | Yes | *(empty)* | Signing secret for `POST /webhook/lemonsqueezy`, from the webhook's own settings in Lemon Squeezy. Empty ⇒ the webhook answers `503` to every request rather than trusting an unverifiable body. **Environment-only** — a secret never goes in the settings table or on the admin page |
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

### Settings the owner can change at runtime

[src/services/settings.service.js](src/services/settings.service.js) is the one place that resolves configuration the owner can override from `/admin` without a redeploy. Precedence is **database → environment → default**: a row in `app_settings` wins; with no row, the environment variable applies; with neither, the built-in default. `GET /api/admin/settings` reports which of the three each value came from, and `DELETE /api/admin/settings/:key` clears a database override so the environment value applies again.

Exactly five keys, and the registry is an **allow-list** — a key that isn't in it is a `400 unknown_setting` on write and never appears in a response. There is no free-form key/value store underneath:

| Setting | Environment fallback | Default | Validated as |
|---|---|---|---|
| `betaDiscountPercent` | `BETA_DISCOUNT_PERCENT` | `0` | whole number 0–90 |
| `betaDiscountCode` | `BETA_DISCOUNT_CODE` | `""` | text, ≤ 60 chars, trimmed |
| `googleAppTesting` | `GOOGLE_APP_TESTING` | `false` | boolean |
| `lemonSqueezyStore` | `LEMONSQUEEZY_STORE` | `""` | store-subdomain shape, ≤ 80 chars |
| `lemonSqueezyVariants` | `LEMONSQUEEZY_VARIANTS` | `{}` | object of plan/pack id → numeric variant id |

**Secrets and `ADMIN_EMAILS` are excluded by construction, not by filtering.** They are absent from the registry, so there is no code path that writes them: a `PUT` body carrying `adminEmails`, `lemonSqueezyWebhookSecret` or `supabaseServiceRoleKey` is rejected **whole** — validation runs over every key before anything is saved, so even mixed with a legitimate key nothing is written. `GET /api/admin/settings` returns only a **count** of admin emails, never the list, and `LEMONSQUEEZY_WEBHOOK_SECRET` stays in DigitalOcean. The table itself is `app_settings`: RLS on, no policies, backend-only, and its own table comment says configuration only, never secrets.

Two rules the validator enforces that are easy to lose:

- **Monthly-only plans can't be sold yearly.** The three Enterprise tiers have no yearly price, so `enterprise-yearly`, `docs-enterprise-yearly` and `complete-enterprise-yearly` are rejected as variant keys — and `variantFor()` refuses them too ([§5](#checkout-and-billing-lemon-squeezy)). Without that guard a stray variant would sell a plan at a price advertised nowhere.
- **A variant key must be a plan or pack DriveTag actually sells**, checked with `Object.hasOwn` against `plans.js`, so `__proto__` and friends can't resolve to an inherited member.

**Reads are synchronous, with a ~30-second background refresh.** `getSetting()` never awaits the database: `GET /api/plans`, `GET /api/me`, `POST /api/checkout` and the Lemon Squeezy webhook all read it on the hot path. A write invalidates the cache immediately, and `GET /api/admin/settings` forces a fresh read, so the admin page always shows true current state. The cache is per process — see the single-instance table in [§6](#6-deploying-to-digitalocean).

**It fails soft.** If `app_settings` can't be read — most obviously because `0007_admin.sql` hasn't been run yet — the service logs `Could not read app_settings; falling back to environment values` **once per outage** (not once per request) and keeps serving environment/default values. That is what makes this release safe to deploy *before* `0007` is run, and it is why `schemaProblem()` doesn't probe for `0007` the way it does for `0002`/`0004`/`0005`/`0006`.

### Getting each credential

- **Gemini key** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey). **Enable billing on the Cloud project** before onboarding real users: the free tier's low rate limits will throttle a real workload, and Google's data-usage terms for billed API traffic differ from the free tier (it isn't used to improve Google's own products), which matters for a product whose whole pitch is "we don't retain your images."
- **Google OAuth client** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) — Google Cloud Console → enable the Drive API → OAuth consent screen (External, scope `https://www.googleapis.com/auth/drive`, your account as a test user while unverified) → Credentials → OAuth client ID (Web application). One client can carry every redirect URI this app needs:
  - `http://localhost:3001/api/auth/google/callback` — this backend's Drive flow, local dev
  - `https://api.drivetag-ai.com/api/auth/google/callback` — this backend's Drive flow, production
  - `https://ckskwjtjydaqewwojsfj.supabase.co/auth/v1/callback` — Supabase's own Google-login flow (a different flow from Drive authorization; see [../CLAUDE.md](../CLAUDE.md))
- **Supabase URL/keys** — dashboard → Project Settings → API keys. `SUPABASE_URL` and `SUPABASE_ANON_KEY` are not secret; `SUPABASE_SERVICE_ROLE_KEY` is. The project has moved off the legacy JWT keys (`eyJ…`) to Supabase's new ones: `sb_publishable_…` for the browser and `sb_secret_…` for the backend. Local `backend/.env` and `frontend/.env` are both on the new keys, and the live frontend bundle ships the `sb_publishable_` key with no legacy JWT in it.
  **The key migration is done:** DigitalOcean's `SUPABASE_SERVICE_ROLE_KEY` is the `sb_secret_` key, so the legacy `anon`/`service_role` JWTs can be disabled in Supabase. Any future key change is still checked **by prefix, not by length** — the two formats are different lengths but both are long. A legacy key left behind after legacy keys are switched off fails every `/api/*` request with "Invalid or expired token" while `/health` stays green, and nothing alerts ([§7](#7-operations)).
- **Lemon Squeezy** (`LEMONSQUEEZY_WEBHOOK_SECRET`, plus the store slug and variant ids that now live in `/admin`) — **[../LemonSqueezySetup.md](../LemonSqueezySetup.md)** is the field-by-field walkthrough: every product to create, what to leave empty on each form, the tax category, how to read a variant id off a checkout link, and the webhook and its eight events. Not repeated here. The one thing worth restating: **no API key is needed anywhere** — plain buy links require none, and the webhook authenticates with its signing secret.
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
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Lemon Squeezy → Settings → Webhooks → the endpoint → new signing secret | Every event signed with the old secret fails verification (401) until the backend restarts with the new value; Lemon Squeezy redelivers, so a short overlap self-heals |

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
| `0005_beta.sql` | **Already applied in production** (readable credit-grant errors, closed-beta signups) | Replaces `grant_credits` so a removal below zero raises `insufficient_credits` — naming the kind, the balance and the amount — before writing the audit row, instead of surfacing a raw check-constraint violation; `grant_image_credits` and `admin_grant_document_credits` inherit it. Adds the `beta_signups` table (RLS on, no policies, backend-only; no FK to `auth.users`) and the owner helper `admin_mark_beta_added`. One transaction, safe to re-run, additive |
| `0006_checkout.sql` | **Already applied in production** (checkout, idempotent grants) | Replaces `grant_credits` again so that, with a non-null `p_reference`, a grant that already exists under that reference returns the current balance instead of granting a second time. The check sits **after** the `select … for update`, so two overlapping webhook redeliveries serialise on the subscription row rather than racing into `provider_reference`'s unique index and raising. A null reference (every manual grant) still repeats freely, and everything else from `0005` — kind check, row lock, the `insufficient_credits` guard and its raise-before-insert ordering, the return value — is unchanged. Adds `apply_subscription_state(...)`, the upsert the Lemon Squeezy webhook writes subscriptions through. One transaction, safe to re-run, additive |
| `0007_admin.sql` | **Written and tested, NOT run yet** — run it to switch the admin dashboard's settings on; the release deploys safely without it | Three independent pieces backing the owner-only admin API. **`app_settings(key, value jsonb, updated_at, updated_by)`** — RLS on, no policies, backend-only, `service_role` granted select/insert/update/delete (delete is how an override is cleared); **configuration only, never secrets**, stated in the table's own `comment on table`. **`admin_user_lookup(p_email)`** → `(user_id, email, created_at)`, case-insensitive, zero rows for an unknown address: **`security definer`** with `set search_path = public, pg_temp`, so it doesn't depend on `service_role` having its own `SELECT` on `auth.users` — a Supabase platform default this repo can neither see nor control, and one the PGlite tests would have masked. It's an email-enumeration surface, so it is `service_role`-only and reached solely through admin-gated routes. **`admin_set_plan_by_id(p_user_id, p_plan, p_status, p_restart_period)`** — the backend-reachable sibling of `admin_set_plan` (which stays email-keyed and SQL-editor-only); it delegates entirely to `apply_subscription_state` so plan/status validation and the `period_anchor` rule can't drift, and passes **`provider => null`** so an admin plan change never relabels a real Lemon Squeezy subscriber as manual. One transaction, safe to re-run, additive |

**Production status: `0001`–`0006` are applied; `0007_admin.sql` is written and tested but has NOT been run.** `0004`, `0005` and `0006` are all proved by the deployed backend booting without a `"Schema problem"` line, and by `POST /api/beta/signups` answering `{"received":true}`, which writes to `beta_signups`. **`0007` is the one pending database step**, and unlike `0006` it is *not* a pre-deploy blocker: the settings service fails soft to environment values when `app_settings` is unreadable ([§2](#settings-the-owner-can-change-at-runtime)), so the admin release can ship first and the migration can follow — until it runs, every setting simply shows source `environment` or `default` and a write fails. Any *future* migration works the same way — nothing applies migrations automatically. The backend logs `"Schema problem"` at boot against a database missing `0002`, `0004`, `0005` or `0006` (`schemaProblem()` probes `image_usage`, then `usage_snapshot`, then `beta_signups`, then `apply_subscription_state`; it does **not** probe `0007`, deliberately — [§7](#7-operations)). The backend code still contains the legacy `/api/drive/config`, `/raw-status`, `/organize` endpoints and `/api/me`'s legacy fields — removing them is the only piece of the `0003` cleanup release left (code only; see [§9](#9-state-limits-and-next-steps)). For a brand-new database, run `0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007` in that order.

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
| `image_credit_grants` | Audit log of every top-up credit change, of either kind (`kind` column added by `0004`) | `provider_reference` is unique, and since `0006` `grant_credits` checks it under the row lock, so a redelivered payment webhook can't grant the same purchase twice (`ls-order-<id>` for a purchase, `ls-refund-<id>` for its refund — deliberately different, or the guard would swallow the refund). Table name predates documents — kept as-is; renaming would break the deployed backend's function bodies |
| `app_settings` | The five owner-settable configuration keys, as `jsonb`, with who changed each and when (added by `0007`) | No RLS policy at all — backend-only, like `google_credentials`. **Configuration only, never secrets**: whoever holds an admin session can read and write every row here, so keys, signing secrets and `ADMIN_EMAILS` stay in environment variables ([§2](#settings-the-owner-can-change-at-runtime)) |
| `schema_migrations` | Which one-time data backfills (and, since `0004`, which migrations) have already run | Bookkeeping only |

### SQL functions

| Function | Added / changed by | Called from | Purpose |
|---|---|---|---|
| `image_usage(p_user_id)` | 0002 | kept for the currently-deployed backend | Read-only **image-only** usage snapshot, monthly counter rolled to the current billing period |
| `usage_snapshot(p_user_id)` | 0004 | `repositories/usage.repo.js` `getUsage()` | Read-only usage snapshot covering **both** kinds, same period-rollover rule as `image_usage` |
| `complete_processed_file(...)` (9-arg, v1) | 0002; updated by 0004 | kept for the currently-deployed backend | Charges one **image** credit and marks a file completed, atomically, fenced by the claim token. `0004`'s only change: rolling the period also resets `period_documents_used`, so a stale document count can't carry across a period boundary during the deploy window |
| `complete_processed_file_v2(...)` (10-arg, adds `p_kind`) | 0004 | `repositories/processedFile.repo.js` `completeFile()` | Same claim fence and `FOR UPDATE` locking as v1, generalized to charge either kind's three buckets (free → monthly → top-up → overage) and to stamp `processed_files.kind` |
| `save_work_process(...)` | 0002; updated by 0004 | `repositories/workProcess.repo.js` | Creates/updates a process and replaces its destination list in one transaction, under a per-user advisory lock, enforcing the plan's process limit. `0004` adds kind handling: stores `kind` (defaulting to `image`) on insert; on update, raises `process_kind_immutable` if the caller sends a `kind` that disagrees with the stored one |
| `grant_image_credits(...)` | 0002; delegates as of 0004 | `admin_grant_credits` | Adds or removes **image** top-up credits and logs why. Since `0004` it's a thin wrapper around `grant_credits(..., 'image', ...)` — one code path, same signature |
| `grant_credits(p_user_id, p_kind, p_amount, p_reason, p_source, p_reference)` | 0004, fixed in 0005, made idempotent in 0006 | `admin_grant_credits`, `admin_grant_document_credits`, `grant_image_credits`, `repositories/subscription.repo.js` `grantCredits()` (the Lemon Squeezy webhook) | Adds or removes top-up credits of either kind and logs the grant. Locks the subscription row; since `0006`, a non-null `p_reference` that already appears in the grants log returns the current balance and grants nothing (that is what makes a redelivered payment event safe). Refuses a removal that would go below zero with `insufficient_credits: <kind> top-up balance is N, cannot remove M` — raised before the log row is written, so a refused grant leaves no trace |
| `apply_subscription_state(p_user_id, p_plan, p_status, p_provider, p_customer_id, p_subscription_id, p_period_end, p_restart_period)` | 0006 | `repositories/subscription.repo.js` `applySubscriptionState()` (the Lemon Squeezy webhook) | Upserts a user's subscription row from a payment event and returns it. `period_anchor` moves only when the plan actually changed or a restart was asked for, exactly mirroring `admin_set_plan`. The provider columns and `current_period_end` use `coalesce(excluded.x, s.x)`, so an event carrying no customer id can't erase one an earlier event stored. Plan and status are validated against the live `subscriptions_plan_check` / `subscriptions_status_check` constraints (caught and re-raised as `invalid_plan` / `invalid_status`), never a second hard-coded list |
| `admin_mark_beta_added(p_email)` | 0005 | the owner, in the SQL editor | Marks a beta sign-up as added to Google's test-user list. Returns false when there's no sign-up for that email. Revoked from every API role |
| `admin_user_lookup(p_email)` | 0007 | `repositories/subscription.repo.js` `adminUserLookup()` (the admin dashboard's account screen) | Resolves an email to `(user_id, email, created_at)` without exposing `auth.users` through PostgREST. `security definer` with a pinned `search_path`, so it doesn't rely on `service_role` holding its own `SELECT` on `auth.users`. An email-enumeration surface: `service_role` only, reached solely through `requireAuth` + `requireAdmin` routes |
| `admin_set_plan_by_id(p_user_id, p_plan, p_status, p_restart_period)` | 0007 | `repositories/subscription.repo.js` `adminSetPlanById()` (`POST /api/admin/users/plan`) | Sets a plan from the admin dashboard. A thin delegate to `apply_subscription_state` with `p_provider => null`, so plan/status validation and the `period_anchor` rule stay in one place, and a real Lemon Squeezy subscriber keeps `lemonsqueezy` in the provider column instead of being relabelled manual |
| `admin_set_plan` / `admin_grant_credits` / `admin_grant_document_credits` | 0002 / 0002 / 0004 | SQL editor only | Owner helpers — not exposed to any API role (see grants below). `admin_set_plan`'s plan-change/restart branch also resets `period_documents_used` as of `0004` |

`billing_period`, `image_usage`, `complete_processed_file`, `complete_processed_file_v2`, `usage_snapshot`, `grant_image_credits`, `grant_credits`, `apply_subscription_state`, `admin_user_lookup`, `admin_set_plan_by_id` and `save_work_process` are granted to `service_role` only. `admin_set_plan`, `admin_grant_credits` and `admin_grant_document_credits` are revoked from every role including `service_role` — they only run as the database owner, from the SQL editor.

### Managing plans and credits by hand

Checkout is deployed but not live: nothing charges anyone until the owner creates the Lemon Squeezy store and fills in the store slug and variant ids ([../LemonSqueezySetup.md](../LemonSqueezySetup.md), then `/admin` — no redeploy). Until then — and afterwards, for comps, goodwill credits and manual fixes — run these in the Supabase SQL Editor (verified against the function signatures in `0002_work_processes.sql`, `0004_documents.sql` and `0005_beta.sql`). Once `0007` is run, the admin dashboard's **Accounts** card does the same two jobs (set a plan, grant or remove credits with a required reason) through `admin_set_plan_by_id` and `grant_credits`; the SQL below stays the fallback and is the only way to do anything these two don't cover.

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
| `npm test` | `node --test --experimental-test-module-mocks "test/**/*.test.js"` — **242 tests across 15 test files, all passing as of 2026-09-21**: pipeline worker pools, account deletion, entitlement math, per-kind organize-now (402 gating), process/template validation, document reading (`document.service.js`), Gemini request/response shapes, naming-template vectors, the beta routes (validation, the 5-per-hour-per-IP limiter, the `ADMIN_EMAILS` gate, CSV formula escaping), checkout link building (auth, unknown/prototype-shaped item ids, the mandatory `user_id` parameter, the 503 when unconfigured), the Lemon Squeezy webhook (signature verification including missing/short/garbage headers, every event handler, idempotency, the refund clamp, 500-for-redelivery), the admin routes (the 403 on every one of them for a non-admin, the settings allow-list, `adminEmails`/secret keys rejected as unknown settings, inherited `Object` keys rejected cleanly, the environment fallback when the settings table throws, account lookup, plan and credit writes), the rate-limit middleware, `schemaProblem()`'s key-vs-migration wording, and — via `@electric-sql/pglite`, an in-memory Postgres — the real SQL from every migration file applied in order, exercised through the actual `complete_processed_file[_v2]` / `grant_credits` / `apply_subscription_state` / `admin_user_lookup` / `admin_set_plan_by_id` / `save_work_process` functions. Every collaborator is mocked or in-memory; no `.env`, network, or real Supabase project needed. Needs **Node 22.3+** for `--experimental-test-module-mocks` (the server itself runs on 18+) |
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
| **Creator** | 5 | 2 | `creator` — 1,000 img/mo, $9.99 ($99.90/yr) | `docs-creator` — 500 docs/mo, $7.99 ($79.90/yr) | `complete-creator` — 1,000 img + 500 docs/mo, $14.99 ($149.90/yr) |
| **Studio** | 15 | 3 | `studio` — 5,000 img/mo, $29.99 ($299.90/yr) | `docs-studio` — 2,000 docs/mo, $24.99 ($249.90/yr) | `complete-studio` — 5,000 img + 2,000 docs/mo, $44.99 ($449.90/yr) |
| **Enterprise** | 50 | 10 | `enterprise` — 25,000 img/mo, $99.99 (monthly only) | `docs-enterprise` — 7,500 docs/mo, $79.99 (monthly only) | `complete-enterprise` — 25,000 img + 7,500 docs/mo, $149.99 (monthly only) |

The Studio tier of each family is `popular: true` ("Recommended" badge). Enterprise tiers are billed monthly only, by decision; the others also offer yearly at 2 months free.

**`aiPerProcess` is a speed knob, not a cost knob.** It has exactly one functional use in the whole backend: the concurrency limit `runProcessQueue` passes to `mapWithConcurrency` ([src/services/pipeline.service.js](src/services/pipeline.service.js), `const limit = Math.max(1, ctx.plan.aiPerProcess ?? 1)`). It never reaches the charging SQL, the credit reservation or the Gemini request config — a file costs the same single AI call however many workers are pulling from the queue — so changing it moves throughput and peak memory, never gross margin. Everything else that reads it (`utils/serialize.js`, the plan cards, the dashboard) only displays it.

Two rules follow. **A tier's `aiPerProcess` must never exceed `MAX_CONCURRENT_AI_JOBS`** ([§2](#2-environment-variables)) — the server-wide semaphore would silently clamp it, so the number on the plan card would be a promise the server can't keep. That's why the tiers were lowered (Creator 3→2, Studio 5→3, Enterprise 15→10) — Enterprise's old 15 was never deliverable above the recommended 10 on a 1 GB instance. **If the deployed value is 10, Enterprise at 10 now exactly equals that cap**, so a single Enterprise customer could occupy every slot while their backlog clears; the semaphore is FIFO, not fair across users. Before selling an Enterprise seat, confirm the deployed `MAX_CONCURRENT_AI_JOBS`, then move the instance to 2 GB and raise it to 20 if it's still 10 (≈360 MB of buffers worst case).

**Top-up packs** (never expire, used after the plan's allowance for that kind): images 250/$4.99, 1,000/$14.99, 5,000/$49.99 (`TOPUP_PACKS`); documents 250/$5.99, 1,000/$19.99, 5,000/$79.99 (`DOCUMENT_PACKS`). All prices are USD placeholders rendered on the pricing pages. `GET /api/plans` marks each plan and pack `purchasable` — true only once the **resolved** variant map (the `/admin` values, falling back to `LEMONSQUEEZY_VARIANTS`) has an entry for its id — and carries `checkoutEnabled` for the page as a whole; anything not purchasable keeps showing "Coming soon."

**`FILE_LIMITS`** (also in `plans.js`, since it's what keeps document pricing safe — a 500-page PDF costs the same as a 5-page one): `documentMaxMb: 20`, `pagesRead: 5`, `textChars: 12000`, `editingGraceMinutes: 10`. **`PROCESS_LIMITS`** caps destinations (20, not counting Unsorted), tag fields (10), and various field lengths — enforced by both `processValidation.js` and the frontend editor.

### Checkout and billing (Lemon Squeezy)

Deployed, but **not configured, and no real payment has ever been put through it** — until a store slug and variant ids exist ([../LemonSqueezySetup.md](../LemonSqueezySetup.md), then `/admin`), `checkoutEnabled` is false and every buy button reads "Coming soon". Lemon Squeezy is the Merchant of Record — it collects and remits VAT/sales tax, which is why every price is quoted tax-exclusive (`pricesIncludeTax: false`).

**Outbound — `POST /api/checkout`** (Bearer, body `{ item, billing? }`, [src/routes/checkout.routes.js](src/routes/checkout.routes.js)):

- `200 { url }` with a plain buy link: `https://<store>.lemonsqueezy.com/checkout/buy/<variantId>?checkout[custom][user_id]=<uid>&checkout[email]=<email>`. The user id is **mandatory and added server-side** — `checkoutUrlFor` throws rather than build an anonymous link — because `checkout[custom][user_id]` is the only thing that maps a payment back to a DriveTag account.
- `503 { code: "checkout_unconfigured" }` when the store or variant map is empty; `400 { code: "unknown_item" }` for anything else that can't be bought.
- **No API key is used or stored.** Plain buy links need none; Lemon Squeezy's REST API would only be needed for bespoke per-customer checkouts. `variantFor()` requires the item to be a real plan or pack and looks the variant up with `Object.hasOwn` on a null-prototype map, so a body of `{"item":"__proto__"}` can't resolve to an inherited member and produce a nonsense 200. The map may now come from the settings table rather than `LEMONSQUEEZY_VARIANTS`, so it is re-wrapped in a null prototype either way.
- **A monthly-only plan can't be sold yearly.** `variantFor()` refuses `billing: "yearly"` for any plan whose `billing` doesn't include it — the three Enterprise tiers — and the settings validator refuses to store an `<enterprise-plan>-yearly` key at all ([§2](#settings-the-owner-can-change-at-runtime)). Two guards, because a stray variant id either way would sell a plan at a price advertised nowhere.

**Inbound — `POST /webhook/lemonsqueezy`** ([src/routes/lemonSqueezyWebhook.routes.js](src/routes/lemonSqueezyWebhook.routes.js)), how DriveTag finds out someone paid:

- **Mounted before `app.use(express.json())`** in [src/app.js](src/app.js) with `express.raw({ type: "application/json" })`. The signature is an HMAC over the exact request bytes, and the global parser would consume and re-serialise them, so every signature would silently fail. The Drive webhook is unaffected — it authenticates with a shared-secret header, not a body hash.
- **Verification:** `X-Signature` is an HMAC-SHA256 **hex** digest of the raw body under `LEMONSQUEEZY_WEBHOOK_SECRET`, compared with `crypto.timingSafeEqual` **after an explicit length check** (`timingSafeEqual` throws on unequal lengths). A missing, short or garbage header returns `401` and never throws. No secret configured ⇒ `503`.
- **It does the work BEFORE acking** — the opposite of `/webhook/drive`. A missed Drive notification is recoverable (the changes feed or "Organize now" finds the file again); a missed payment is not. Success is `200`; a handler failure is `500`, so Lemon Squeezy redelivers (three more times, roughly 5s/25s/125s). Every handler is idempotent, which is exactly what makes a redelivery safe.
- A verified request that simply **cannot** be acted on — malformed JSON, no `meta.custom_data.user_id`, an event we don't handle — still answers `200`, because retrying would never fix it.

| Event | What it does here |
|---|---|
| `order_created` | A top-up pack was bought → `grant_credits` with reference `ls-order-<id>`. A plan's order needs nothing here; `subscription_created` arrives alongside it and is what grants the plan |
| `order_refunded` | Claws the pack credits back with a negative `grant_credits`, reference **`ls-refund-<id>`** — deliberately different from the order's, or `0006`'s idempotency guard would swallow every refund. If the balance is already spent, the `insufficient_credits` refusal is caught and the request still answers `200` (there is nothing left to claw back; that is the right commercial outcome, not an error to retry) |
| `subscription_created` | `apply_subscription_state` with `restartPeriod: true` — sets plan, status and a fresh period anchor |
| `subscription_updated` | Reconciles plan and status from the payload, without restarting the period |
| `subscription_payment_success` | Forces `active` (a renewal was paid) |
| `subscription_payment_failed` | → `past_due`. Still entitled, since the plan gate counts `active` *or* `past_due`, so a failed card doesn't stop sorting mid-month |
| `subscription_cancelled` | **Does not downgrade.** It re-applies the same plan and status and only refreshes `current_period_end` from `ends_at` |
| `subscription_expired` | → `expired`, so the gate falls back to Free limits |

`mapStatus` maps Lemon Squeezy's statuses to ours: `on_trial`/`active` → `active`, `past_due`/`unpaid` → `past_due`, `cancelled` → **`active`**, `paused` → `cancelled`, `expired` → `expired`. Lemon Squeezy's "cancelled" means "will not renew", not "access revoked" — the customer keeps access until `ends_at`, which is what the Terms promise. Getting that mapping backwards would cut off people who have already paid for the current period, which is why only `subscription_expired` downgrades.

---

## 6. Deploying to DigitalOcean

**App Platform settings:** connect the GitHub repo, **Source Directory** `/backend`, build command `npm ci`, run command `npm start`. Both the frontend (Vercel) and this backend deploy from the same repo/branch (`production`) — don't split them. `production` is at `aa9f464` and already contains the checkout release (`ad42d23`); the working copy carrying the admin dashboard is checked out on `production` itself, with everything in [§9](#9-state-limits-and-next-steps) still uncommitted. Shipping means committing and pushing `production` — never changing either host's branch. Vercel usually finishes before DigitalOcean, which is why `frontend/src/lib/api.ts` keeps its normalizers for an older API response shape.

**Production env values** (on top of [§2](#2-environment-variables)'s table, set as encrypted app-level variables):

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.drivetag-ai.com/api/auth/google/callback` |
| `DRIVE_WEBHOOK_URL` | `https://api.drivetag-ai.com/webhook/drive` |
| `FRONTEND_URL` | `https://drivetag-ai.com` |
| `CORS_ORIGINS` | `https://drivetag-ai.com` (comma-separate to also allow `www`) |
| `AUTO_SYNC_INTERVAL_SECONDS` | `> 0` until the domain is Google-verified and the webhook is confirmed reachable (see below); `0` once it is, to run webhook-only |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Unset until the webhook endpoint exists in Lemon Squeezy — until then `POST /webhook/lemonsqueezy` answers `503` to everything. It is a secret, so it lives here and **only** here, never in the settings table ([§2](#settings-the-owner-can-change-at-runtime)). Point the endpoint at `https://api.drivetag-ai.com/webhook/lemonsqueezy` ([../LemonSqueezySetup.md](../LemonSqueezySetup.md)) |
| `LEMONSQUEEZY_STORE` / `LEMONSQUEEZY_VARIANTS` | Leave unset on DigitalOcean; set the store slug and the 21 variant ids from `/admin` instead, which needs no redeploy ([§2](#settings-the-owner-can-change-at-runtime)). Either way, until both exist every buy button stays "Coming soon" |

`api.drivetag-ai.com` reaches DigitalOcean via a CNAME record added in Namecheap pointing at the app's `*.ondigitalocean.app` address (App Platform → Settings → Domains shows the exact target).

**Boot-time log checks.** After every deploy, search the runtime logs for these — both are silent (the server still starts and serves `/health`) if they'd otherwise go unnoticed:
- `"Production config problem"` — logged once per offending variable if `FRONTEND_URL`, `CORS_ORIGINS`, `GOOGLE_OAUTH_REDIRECT_URI` or `DRIVE_WEBHOOK_URL` still points at `localhost`/`127.0.0.1` or an `ngrok`/placeholder URL, and also when Lemon Squeezy is half-configured — a store with no variants, or variants with no store — since neither can build a checkout link ([src/config/env.js](src/config/env.js) `productionConfigProblems()`).
- `"Schema problem"` — logged if migration `0002_work_processes.sql`, `0004_documents.sql`, `0005_beta.sql` or `0006_checkout.sql` hasn't been run against this database yet, **or** if Supabase refused the probe outright, which means the service-role key and not the schema ([src/repositories/usage.repo.js](src/repositories/usage.repo.js) `schemaProblem()`, which checks `image_usage`, then `usage_snapshot`, then `beta_signups`, then `apply_subscription_state`). The `0006` probe calls `apply_subscription_state` with a deliberately invalid plan id, which `subscriptions_plan_check` always rejects, so the probe can never write a row — only PostgREST's own "no such function" reply counts as a missing migration. **`0007` is deliberately not probed**: the settings service fails soft to environment values without it, so a missing `app_settings` is not a boot-time problem — it shows up as one `Could not read app_settings; falling back to environment values` line instead ([§2](#settings-the-owner-can-change-at-runtime)).

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
| Owner settings cache (~30s TTL) | `src/services/settings.service.js` (`cache`) | A setting written on one instance leaves the others serving the old value for up to ~30 seconds, because a write only invalidates its own process's cache. The database row is the single source of truth, so it converges on its own — but during that window two instances can disagree about whether a plan is purchasable, or which variant id a checkout link uses. `GET /api/admin/settings` always forces a fresh read, so the admin page never shows a stale value, whichever instance it lands on |

---

## 7. Operations

**Google "Access blocked" when a user connects Drive.** The app requests the restricted `https://www.googleapis.com/auth/drive` scope (`drive.file` can't see files other people drop into the watched folder — see [../CLAUDE.md](../CLAUDE.md)). While the OAuth consent screen is in **Testing** mode, only accounts added as test users in Cloud Console → OAuth consent screen can connect. Testing-mode refresh tokens also expire after 7 days regardless of use, and there's no "reconnect Drive" prompt in the product yet when that happens — the pipeline gate just fails closed for that user until they reconnect.

**Going beyond a test-user allowlist** needs Google's restricted-scope app verification, and likely a third-party security assessment (CASA), reviewed annually — both have real lead time and can carry a cost. Budget for this before committing to a public (non-invite) launch date.

**Security headers and rate limiting.** `helmet({ contentSecurityPolicy: false })` is mounted first in [src/app.js](src/app.js), before `cors()`, so its headers wrap every response including CORS refusals and errors. CSP is switched off deliberately: this is a JSON-only API on its own subdomain with no HTML of its own to protect. A loose app-wide budget of **300 requests per IP per minute** then applies to `/api` only ([src/middleware/rateLimit.js](src/middleware/rateLimit.js), the same sliding-window limiter the beta signup form uses at 5/hour). **Both webhooks are exempt, by path** — Google and Lemon Squeezy legitimately burst, and rate-limiting a payment webhook loses money. Over budget is `429` with code `rate_limited`. The counters are per instance and in memory; a multi-instance backend would need a shared store.

**Reading logs.** [src/utils/logger.js](src/utils/logger.js) emits structured JSON lines to stdout/stderr. Any field whose key matches `token|secret|key|authorization|refresh|password` (case-insensitive) is replaced with `[redacted]` before logging, recursively through nested objects — image bytes are never logged at all, by construction (nothing in the pipeline passes a buffer to the logger).

**Every `/api/*` request answers "Invalid or expired token" while `/health` is fine.** That pairing means the backend's Supabase key is dead or wrong, not that a user's session expired — `/health` never touches Supabase, so it stays green and nothing alerts. Check `SUPABASE_SERVICE_ROLE_KEY` on DigitalOcean **by prefix**: it must start `sb_secret_` now that the project has moved to Supabase's new API keys. The most likely causes are a legacy `eyJ…` key left in place after legacy keys were disabled, or a publishable key pasted into the service-role slot.

**A `"Schema problem"` line at boot.** `schemaProblem()` ([src/repositories/usage.repo.js](src/repositories/usage.repo.js)) now says which of the two it is, instead of always blaming the schema. An auth-shaped refusal (`invalid api key`, `JWT`, `legacy API keys are disabled`, `permission denied`, `unauthorized`) reads as

```
Supabase rejected the request (<message>). This is not a missing migration — check that SUPABASE_SERVICE_ROLE_KEY is correct and hasn't been rotated or disabled in the Supabase dashboard.
```

Anything else names the file to run: `The database is missing supabase/migrations/0006_checkout.sql (<message>). Run it in the Supabase SQL editor.` Read it literally — the first form means the credential and re-running a migration will change nothing; the second means the migration genuinely hasn't been applied. (Before the checkout release, *every* probe error was reported as a missing migration, which once sent the owner chasing an already-applied `0002`.)

**Account deletion.** `DELETE /api/me` with body `{ "confirm": "DELETE" }`:
1. 409 `sorting_in_progress` if a sweep is currently running for that user (refuses rather than race a worker that might still move a file after credentials are gone).
2. Stops the Drive watch, revokes the refresh token at Google, deletes the stored credential — failures here are logged but don't block deletion (once the DriveTag rows are gone the token is unusable anyway).
3. Drops any Drive-connect grant parked but never claimed for that user.
4. Deletes the Supabase auth user. Every app table cascades from `auth.users(id)`, directly or (for `process_destinations`, via `work_processes`) transitively, so this removes the rest of the account's data.

---

## 8. API reference

All `/api/*` routes except `GET /api/plans` and `POST /api/beta/signups` require `Authorization: Bearer <supabase-access-token>`, and all of `/api` is under the 300-per-IP-per-minute budget ([§7](#7-operations)); neither webhook is. Legacy routes are removed in the cleanup release (code change only — the database side, `0003_cleanup.sql`, is already applied in production). The four `/api/beta/*` routes, `POST /api/checkout` and `POST /webhook/lemonsqueezy` are all live; the five `/api/admin/*` routes exist in the working tree but are not deployed yet.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | |
| POST | `/webhook/drive` | `X-Goog-Channel-Token` shared secret | Acks immediately, sweeps in the background |
| POST | `/webhook/lemonsqueezy` | `X-Signature` HMAC-SHA256 over the raw body | Raw-body mount before `express.json()`. `401` if the signature doesn't verify, `503` with no signing secret configured, `500` on a handler failure so Lemon Squeezy redelivers, `200` on success *and* on a verified request that can't be acted on ([§5](#checkout-and-billing-lemon-squeezy)) |
| POST | `/api/auth/google/start` | Bearer | Returns a Google consent URL |
| GET | `/api/auth/google/callback` | signed `state` param | Hit by Google's redirect; parks the grant, redirects to `/connect?pending=` |
| POST | `/api/auth/google/complete` | Bearer, must be the user who started the flow | Claims the parked grant |
| DELETE | `/api/auth/google` | Bearer | Disconnects Drive |
| GET | `/api/plans` | none | Public plan/pricing data for the frontend |
| POST | `/api/beta/signups` | none | Public closed-beta signup form. 5 per hour per IP; validated first, so a rejected body never spends that budget. Always answers `201 {received:true}`, whether the email was new or already listed |
| GET | `/api/beta/signups` | Bearer + `ADMIN_EMAILS` | The sign-up list plus `{total, added, pending}` counts |
| PATCH | `/api/beta/signups/:id` | Bearer + `ADMIN_EMAILS` | `{addedToGoogle?, notes?}` |
| GET | `/api/beta/signups.csv` | Bearer + `ADMIN_EMAILS` | CSV export for mail-merge. Cells starting with `=`, `+`, `-` or `@` are apostrophe-prefixed so a spreadsheet can't execute a name from the public form |
| GET | `/api/admin/settings` | Bearer + `ADMIN_EMAILS` | Every setting as `{ value, source }` (`database`\|`environment`\|`default`), plus `readOnly: { adminEmails: <count> }` — a **count**, never the list. Forces a fresh database read ([§2](#settings-the-owner-can-change-at-runtime)) |
| PUT | `/api/admin/settings` | Bearer + `ADMIN_EMAILS` | Body `{ <key>: <value>, … }` from the five-key allow-list. All-or-nothing: one unknown key (`adminEmails`, a webhook secret, `__proto__`, anything) is a `400 unknown_setting` and **nothing** is written; a value that fails validation is `400 invalid_setting` with a field-level detail |
| DELETE | `/api/admin/settings/:key` | Bearer + `ADMIN_EMAILS` | Clears that key's database override so its environment/default value applies again. An unknown key is `400 unknown_setting`, not a silent success |
| GET | `/api/admin/users?email=` | Bearer + `ADMIN_EMAILS` | `{ user }` — id, email, created-at, plan, status and both kinds' usage — or `{ user: null }` for an address with no account. Missing `email` is a 400 |
| POST | `/api/admin/users/plan` | Bearer + `ADMIN_EMAILS` | Body `{ email, plan, status?, restartPeriod? }` (`status` defaults to `active`, `restartPeriod` to false). 404 `user_not_found`; 400 `invalid_plan` / `invalid_status`. Writes through `admin_set_plan_by_id` ([§3](#3-database)) |
| POST | `/api/admin/users/credits` | Bearer + `ADMIN_EMAILS` | Body `{ email, kind, amount, reason }` — `kind` is `image`\|`document`, `amount` any whole number (negative removes), `reason` required and ≤ 200 chars. Always granted with `provider_reference: null`, so a manual grant stays repeatable. A removal below zero is a readable `400 insufficient_credits`, not a 500 |
| POST | `/api/checkout` | Bearer | Body `{ item, billing? }` (`billing` is `"monthly"` \| `"yearly"`, default monthly). `200 {url}` with a Lemon Squeezy buy link carrying the signed-in user's id; `503 {code:"checkout_unconfigured"}` when no store/variants are set; `400 {code:"unknown_item"}` for an item that isn't purchasable ([§5](#checkout-and-billing-lemon-squeezy)) |
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

**Done — written, tested, and live in production:** Drive OAuth (with the account-linking hole closed — the callback parks the grant and only the flow's starter can claim it), the watch-channel lifecycle with in-process hourly renewal, the polling fallback, work processes of both kinds (`image` and `document`) with per-process AI worker pools, Gemini classification with a per-process schema for each kind, the document pipeline (PDF/Word/Google Docs·Sheets·Slides/text, in memory only), rename/move with the loop guard, per-kind plan/credit metering with atomic charging, "Organize now", account deletion, the closed-beta sign-up list with its admin-only endpoints, the `insufficient_credits` fix in `grant_credits` (`0005`), tax-exclusive pricing (`pricesIncludeTax: false` on `GET /api/plans`), and — since the checkout release — `POST /api/checkout`, the signature-verified `POST /webhook/lemonsqueezy` with every event handler, per-kind pack grants and subscription state through `apply_subscription_state` (`0006`), `helmet`, the app-wide `/api` rate limiter, the `schemaProblem()` key-vs-migration fix, and the `purchasable`/`checkoutEnabled` flags. Everything not covered by the 242 automated tests ([§4](#4-commands)) has been verified by manual probes, curl and browser checks. **What is live is not the same as proven: no card has ever been charged.**

**Done, written and tested, but neither committed nor deployed — the owner admin dashboard:** `/admin` and the five `/api/admin/*` routes ([§8](#8-api-reference)), the five-key settings service with its `database → environment → default` precedence and fail-soft fallback ([§2](#settings-the-owner-can-change-at-runtime)), migration `0007_admin.sql` ([§3](#3-database)), the monthly-only-plan guard in `variantFor()` and the settings validator, and [../LemonSqueezySetup.md](../LemonSqueezySetup.md). The working copy is on `production`, with all of it uncommitted.

### Claude builds this next (code work — ask for it)

- **Commit the admin release** sitting in the working tree, so the owner can run `0007` and fill in the Lemon Squeezy values from `/admin`.
- **Yearly billing in the UI.** The buy button always sends `billing: 'monthly'` today and `buildReceipt()` in `pages/CheckoutSuccess.tsx` prices off `price.monthly` to match, even though the backend, the settings validator and the variant map already handle `<planId>-yearly` ([§5](#checkout-and-billing-lemon-squeezy)).
- **The cleanup release** — remove `/api/drive/config`, `/raw-status`, `/organize` and `/api/me`'s legacy fields now that the database side (`0003_cleanup.sql`) is already applied in production and no old frontend build is being served. Deliberately kept **out** of both the checkout and admin releases so a rollback is unambiguous.
- **Re-sorting an already-sorted file** — `processed_files` is unique on `(user_id, file_id)`, so a file is sorted automatically at most once; there's no "run it again" action.

### The owner does this first (no code can do it)

1. **Run `0007_admin.sql`** in the Supabase SQL editor ([§3](#3-database)). Unlike `0006`, it isn't a pre-deploy blocker — the release runs without it on environment values — but nothing can be saved from `/admin` until it exists.
2. **Set up Lemon Squeezy** by following **[../LemonSqueezySetup.md](../LemonSqueezySetup.md)** end to end: the store, the 21 products (9 paid plans, 6 of which also have a yearly price, plus 6 top-up packs), the tax category, and the webhook at `https://api.drivetag-ai.com/webhook/lemonsqueezy` with its eight events. One caution worth repeating here: the "Domains" setting only rebrands Lemon Squeezy's *own* checkout pages; it is optional, and if it's wanted it must be a subdomain such as `checkout.drivetag-ai.com`, never the apex — that's exactly the mistake behind the resolved DNS incident in [../DeveloperToDo.md §2.1](../DeveloperToDo.md).
3. **Put the store slug and the 21 variant ids into `/admin`** → Payments, one labelled box per purchasable thing ([§2](#settings-the-owner-can-change-at-runtime)). No redeploy, and a plan becomes purchasable on its own as soon as its box is filled. Set **`LEMONSQUEEZY_WEBHOOK_SECRET`** on DigitalOcean — that one is a secret, so it stays an environment variable and the webhook `503`s until it's there.
4. **Make one real test-mode purchase end to end before anything goes public** — a pack and a plan — and check that the credits or plan actually land. **This is the most important item on the list**: nothing in checkout has ever seen a real payment.
5. **Set `googleAppTesting` from `/admin`** → Google, and decide the beta discount (percent + code) there too if it's being offered ([§2](#settings-the-owner-can-change-at-runtime)). `ADMIN_EMAILS` and the `sb_secret_` key are already set on DigitalOcean; `GOOGLE_APP_TESTING`, `BETA_DISCOUNT_PERCENT` and `BETA_DISCOUNT_CODE` are deliberately left unset there, because `/admin` now covers them.
6. **Redeploy the backend** once the admin release is committed, and watch the boot logs for `"Production config problem"` and `"Schema problem"` ([§6](#6-deploying-to-digitalocean)).
7. **Confirm Drive watches now register.** Domain verification (Search Console + Cloud) is recorded done; check whether webhooks work and, if so, move `AUTO_SYNC_INTERVAL_SECONDS` to `0` ([§6](#6-deploying-to-digitalocean)). Google brand verification, restricted-scope verification and the CASA track are still open ([../DeveloperToDo.md §4](../DeveloperToDo.md)).
8. **Plans and credits stay manual** until checkout is live, and stay available afterwards for comps and fixes — `/admin` → Accounts once `0007` is run, or the SQL in [§3](#3-database).

### Known limits

- Single backend instance only ([§6](#6-deploying-to-digitalocean)).
- Shared Drives aren't supported — Drive queries use `restrictToMyDrive: true`, and shared-drive folders are rejected when saving a process. A Raw folder from "Shared with me" isn't swept automatically by the changes feed; "Organize now" still sorts it.
- SVG and AVIF aren't sortable as images — `MIME_TYPES_BY_KIND.image` ([src/utils/filename.js](src/utils/filename.js)) covers JPEG, PNG, WebP, GIF, HEIC, HEIF and TIFF only.
- `.xlsx`, `.pptx` and legacy `.doc` aren't sortable as documents — only PDF, `.docx`, plain text/Markdown/CSV, and Google Docs/Sheets/Slides (`MIME_TYPES_BY_KIND.document`, [§5](#5-how-sorting-works)).
- Any image over `MAX_IMAGE_BYTES` (default 18 MB), or any document over `FILE_LIMITS.documentMaxMb` (20 MB), is skipped with a readable per-file error rather than sent to Gemini — and never charged.
- A Google Doc/Sheet/Slide edited within the last `FILE_LIMITS.editingGraceMinutes` (10) minutes is left alone entirely: not claimed, not charged, not counted as failed. It shows as "waiting" (there's no separate "still editing" status) and is sorted automatically about 10½ minutes after its last edit via the in-memory re-check queue — unless the backend restarts in between, in which case "Organize now" picks it up.
- Duplicate output filenames are allowed within a folder — Drive keeps files distinct by ID; add a `{date}` or `{original}` token to a naming template if that's undesirable.
