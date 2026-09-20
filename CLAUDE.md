# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DriveTag AI is a B2B micro-SaaS that automatically organizes the **images and documents** creative agencies and freelancers juggle.

**Core mechanism:** the app watches Google Drive "Raw" folders (webhooks, or polling until the domain is Google-verified). A new file is ingested into memory:
- an image as bytes;
- a document as its first 5 PDF pages, or up to 12,000 characters of text.

It's then sent to the Gemini Flash API for classification, and the file is renamed and moved in Google Drive based on the AI's returned tags.

**Security posture — "Zero-Retention":** user files, and text extracted from them, must never be persisted to the database, disk, logs or any storage bucket.
- Files are processed in memory only and discarded immediately after the Drive rename/move completes.
- Any code path that writes an incoming file or its text to disk, a database, a log or a storage bucket violates this design and should be flagged.
- This is also why Gemini is called with inline data rather than the Files API, which would retain the upload.

## Current State

Production-ready and live. The deployed build is the last committed release; a whole **checkout release** now sits uncommitted on top of it (below). Status, plans and the pricing strategy are in [README.md](README.md).
- Setup, env vars, credentials, database helpers, deployment and operations are in [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).
- Everything only the owner can do (migrations, DNS, Google, hosting settings) is in [DeveloperToDo.md](DeveloperToDo.md).

Keep all four current when state or setup changes.

**Branch reality as of 2026-09-20:**
- The closed-beta + Lemon Squeezy-naming + VAT release **shipped**. `production` is at `392236b` (remove accidental debug JSON files), reached via `540af6b` (beta release docs and form fixes) → `f851715` (merge `staging` into `production`) → `392236b`. The working copy is checked out on **`staging`**, whose ref still sits at `540af6b`: `540af6b` is an ancestor of `392236b` and `git diff 540af6b 392236b` is empty, so the two trees are identical and only staging's ref lags. The five accidental debug JSON files are gone, and `.claude/settings.local.json` is untracked with a `.gitignore` rule in place.
- Live and verified 2026-09-20: `GET https://api.drivetag-ai.com/api/plans` serves `pricesIncludeTax` and `merchantOfRecord`, `POST /api/beta/signups` answers `{"received":true}`, and the deployed frontend bundle contains `/beta`.
- `npm test` in `backend/` is **205 tests across 14 test files, all passing**; `npx tsc -b` in `frontend/` is clean, `npm run lint` shows only the pre-existing AuthContext fast-refresh warning, and the production build succeeds.
- **Uncommitted in the working tree — the whole checkout release.** Done and tested, but **not committed, not deployed, and its migration has not been run**. Nothing in it is live; the site and API still run `392236b`. It is:
  - **Lemon Squeezy checkout and webhook.** `POST /api/checkout` builds a plain buy link; `POST /webhook/lemonsqueezy` verifies an `X-Signature` HMAC and applies orders, refunds and subscription events. New: `backend/src/routes/checkout.routes.js`, `backend/src/routes/lemonSqueezyWebhook.routes.js`, `backend/src/services/lemonSqueezy.service.js`, `supabase/migrations/0006_checkout.sql`, and on the frontend `lib/lemonSqueezy.ts`, `pages/CheckoutSuccess.tsx`, `components/billing/ReceiptPrint.tsx`.
  - **Hardening:** `helmet` mounted first in `app.js`, and the beta route's limiter extracted to `backend/src/middleware/rateLimit.js` and applied app-wide on `/api`.
  - **`schemaProblem()` fixed** — an auth-shaped Supabase error now names `SUPABASE_SERVICE_ROLE_KEY` instead of blaming a migration.
  - `backend/src/config/plans.js` lowers `aiPerProcess` (Creator 3→2, Studio 5→3, Enterprise 15→10), plus the `purchasable` / `checkoutEnabled` fields on `GET /api/plans`.
  - All five docs — `README.md`, `CLAUDE.md`, `DeveloperToDo.md`, `backend/README.md`, `frontend/README.md`.
- **A real purchase has never been tested.** Signature verification, every event handler, idempotency, the refund clamp and link building are all unit-tested; an actual card payment through a live Lemon Squeezy store is not, and can't be until the owner creates the store. Nothing about this release should be treated as proven against the real provider.

- **Backend:** Drive OAuth, the watch-channel lifecycle, the change-feed sweep, AI classification and rename/move are wired together.
  - Users build **AI work processes** of two kinds, `image` or `document`, chosen at creation and never changed.
  - Each process is a Raw folder feeding a Master folder, split into AI-chosen destination folders, with its own naming template, custom tag fields and instructions.
  - Each process is sorted by up to `plan.aiPerProcess` AI workers at once.
  - Also included: a polling fallback, "Organize now" for files already in Raw, and self-service account deletion (`DELETE /api/me`).
- **Plans:** Free plus three families (Images, Documents, Images + Documents) × three tiers (Creator / Studio / Enterprise).
  - Tiers set processes and AI workers per process; families set the monthly image and/or document allowances.
  - AI workers per process: Free 1, Creator 2, Studio 3, Enterprise 10 (working tree; the deployed backend still serves the old 3 / 5 / 15 until it is redeployed).
  - **`aiPerProcess` is a speed knob, not a cost knob.** It appears in exactly one functional place in the backend — the concurrency limit in `runProcessQueue` (`backend/src/services/pipeline.service.js:364`) — and never touches the charging SQL, the credit reservation or the AI request config. Every file costs the same single AI call whatever the worker count, so changing it moves throughput and peak memory, never unit economics or the margin tables in README.md.
  - **Never advertise a number above `MAX_CONCURRENT_AI_JOBS`.** The server-wide semaphore bounds real concurrency, so a bigger tier number is a promise the server can't keep. `MAX_CONCURRENT_AI_JOBS` is recommended at `10` on a 1 GB instance (DeveloperToDo.md §7; the code default is `20`) — that's a recommendation, not a reading of the deployed value, so confirm what DigitalOcean is actually set to before relying on it. It's why Enterprise was set to 10 — the old 15 was never deliverable above a 10 cap. If the deployed value is 10, Enterprise's 10 workers exactly equal that cap, and the semaphore is FIFO rather than fair across users, so one Enterprise customer can occupy every slot: before selling an Enterprise seat, confirm the deployed value, then move to 2 GB and raise the cap to 20 if it's still 10 (about 360 MB of buffers in flight).
  - Image and document packs top up either kind.
  - Usage is metered per kind. Prices are USD placeholders. Everything is in `backend/src/config/plans.js`.
- **Frontend:** React 19 + Vite + Tailwind. Real Supabase Google login, and every screen is backed by the API (`src/lib/api.ts`).
  - Public pages: Landing `/`, `/login`, `/plans`, `/beta` (closed-beta sign-up), and the legal pages `/privacy`, `/terms`, `/refunds`, `/cookies`, `/data-deletion`.
  - Protected pages: `/onboarding`, `/dashboard`, `/connect`, `/processes/new`, `/processes/:id`.
  - Pastel "Lavender garden" design system, GSAP animation, cookie consent banner, self-hosted fonts.
- **Closed beta:** the Google OAuth app is in *Testing* status, so only emails on Google's test-user list (max 100) can sign in at all, and Drive refresh tokens expire every 7 days. `/beta` collects sign-ups into `beta_signups`; the owner sees them on `/dashboard` (gated by `ADMIN_EMAILS`), copies the pending addresses into Google's console by hand — there is no API for that list — and ticks **Added**. That flag also makes the account a beta tester for pricing. Nothing is emailed automatically; no mail provider is wired in, deliberately.
- **Credentials:** `.env` files are gitignored and don't travel through git. The desktop working copy has real credentials; any other checkout, including cloud sessions, starts blank, and `npm run dev` names what's missing. There are no `.env.example` templates, deliberately; [backend/README.md](backend/README.md) lists every variable.
- **Supabase API keys — moved off the legacy JWTs.** The project now uses Supabase's new key format: `sb_publishable_…` in the browser, `sb_secret_…` on the server. The variable *names* are unchanged — `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — only the values.
  - The migration is complete on both sides: local `.env` files, the live frontend bundle (publishable key) and the DigitalOcean backend (`sb_secret_`). Judge that server variable by its **`sb_secret_` prefix, never by length** — a legacy JWT is also long.
  - Former trap, **fixed in the uncommitted release**: `schemaProblem()` in `backend/src/repositories/usage.repo.js` used to blame the *first* failing Supabase RPC on a missing migration, so a dead key printed `The database is missing supabase/migrations/0002_work_processes.sql (Invalid API key)` and sent the owner to re-run a migration applied months ago. It now matches an auth-shaped message (`AUTH_ERROR_PATTERN`: invalid api key / JWT / legacy keys disabled / permission denied / unauthorized) and names `SUPABASE_SERVICE_ROLE_KEY` instead. The deployed backend still has the old behaviour until this release ships.
- **Not built:**
  - Re-sorting already-sorted files.
  - Yearly billing in the UI. The plan config carries a yearly price for the six non-Enterprise paid plans and the checkout API accepts `billing: 'yearly'`, but the buy button always sends `'monthly'` and the receipt prices off `price.monthly` to match.
  - The legacy-endpoint cleanup, deliberately **kept out of the checkout release** so that rolling it back is unambiguous.
- **Schema:** production has `0001`–`0005` applied. `0005_beta.sql` was run in Supabase on 2026-09-20, so the beta routes and `grant_credits`'s readable `insufficient_credits` errors are live.
  - **`0006_checkout.sql` is written but has NOT been run.** It must be run by the owner *before* the checkout release is pushed, or `POST /webhook/lemonsqueezy` 500s on every subscription event (`apply_subscription_state` won't exist) and a redelivered order raises a raw unique violation instead of being deduped.
  - Any new migration must be run by hand in the Supabase SQL editor before deploying code that depends on it; nothing applies migrations automatically. Deploy code first and the routes that need it 500.
- **Production:** deployed from `production`. The frontend is on Vercel at `drivetag-ai.com` and the backend on DigitalOcean at `api.drivetag-ai.com`.
  - ✅ **DNS incident, resolved 2026-09-20: the apex briefly pointed at Lemon Squeezy as well as Vercel.** A second `A` record for `@` → `3.33.255.208` was added alongside Vercel's `216.198.79.1`; `8.8.8.8` returned the Lemon Squeezy address first, and it answered HTTP 403 for the domain, so a large share of visitors got an error page while the owner's cached resolver showed a healthy site. The owner deleted the Lemon Squeezy record the same day — verified 2026-09-20: `nslookup drivetag-ai.com 8.8.8.8` returns only `216.198.79.1`, and `curl https://drivetag-ai.com/` answered `200` three times out of three. Full story and the standing rule it left behind (never point the apex at Lemon Squeezy): DeveloperToDo.md §2.1. `www` and `api` were unaffected.
  - `ADMIN_EMAILS` is set; `GOOGLE_APP_TESTING`, `BETA_DISCOUNT_PERCENT`, `BETA_DISCOUNT_CODE` and all three `LEMONSQUEEZY_*` variables are still unset. Every one of them fails closed, so the checkout release can be deployed before the store exists: `/api/plans` reports `checkoutEnabled: false` and `purchasable: false` everywhere, every button stays "Coming soon", `POST /api/checkout` answers 503, and the webhook 503s.
  - Google domain verification is recorded done (Search Console + Cloud; the Namecheap records are settled — DeveloperToDo.md §7). Check whether Drive watches now register, then move `AUTO_SYNC_INTERVAL_SECONDS` to `0`. Until that's confirmed, sorting runs on the polling fallback.
  - The rest are in DeveloperToDo.md, and summarised under **Open tasks** at the end of this file.

## Tech Stack & Hosting

- **Frontend:** React 19 + Vite + Tailwind 4 + react-router, TypeScript. Hosted on Vercel (Root Directory: `frontend`) at `drivetag-ai.com`. Lint via `oxlint`. Visitor analytics via `@vercel/analytics` in `src/components/RouteAnalytics.tsx`.
  - **Deploy requirements:**
    - `frontend/vercel.json` rewrites every path to `index.html`; without it every client route 404s on Vercel.
    - `vite build` refuses to run unless `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` are set. They're baked in at build time, so changing them on Vercel needs a redeploy.
    - Supabase auth uses the PKCE flow (`src/lib/supabase.ts`).
  - **Styling:** design tokens live in `src/index.css` `@theme` (`canvas`, `ink`, `lavender`, `periwinkle`, `butter`, `sage`, `rose` + `-soft` tints). Use those rather than raw Tailwind palette colors. Fonts: Fredoka (headings) and Nunito (body), self-hosted via `@fontsource-variable/*` imported in `main.tsx` — never add a Google Fonts `<link>` (GDPR: it sends every visitor's IP to Google).
  - **Animation:** GSAP. Import it from `src/lib/gsap.ts`, which registers plugins once — not from `gsap` directly. Use `useGSAP`, and gate motion behind `gsap.matchMedia()` with `MOTION_OK` / `REDUCED_MOTION`. Project GSAP skills live in `.claude/skills/`.
- **Backend:** Node.js + Express 5 (ESM). Hosted on DigitalOcean App Platform (Source Directory: `/backend`) at `api.drivetag-ai.com`. Must run with `NODE_ENV=production` there, which locks CORS and turns on in-process channel renewal. At boot it logs `"Production config problem"` for any localhost or placeholder URL env var.
- **Database & Auth:** Supabase (PostgreSQL), project `ckskwjtjydaqewwojsfj` — Google login for identity, plus all app tables.
- **AI Engine:** Gemini Flash via `@google/genai`, with a `responseSchema` for strict JSON. Default model `gemini-3.6-flash` — Google retired `gemini-2.5-flash` for new users, and a stale `GEMINI_MODEL` in a local `.env` overrides the default. The API key's project must have billing enabled: on the free tier Google may use submitted images to improve its products, which the Privacy Policy rules out. User-facing text never names the vendor or model ("advanced AI"); only the Privacy Policy names Google LLC as the AI processor.
- **Google Drive:** `googleapis` SDK.
- **Payments:** Lemon Squeezy (Merchant of Record — legal entity *Sold through Link, LLC*, formerly Lemon Squeezy LLC). It is the seller of record, collects and remits VAT/sales tax, and handles refunds and chargebacks; DriveTag never sees card data. Named in `/privacy`, `/terms` and `/refunds`. Prices are **tax-exclusive** — `publicPlansPayload()` says so with `pricesIncludeTax: false`, and the UI must keep saying so next to every price.
  - **Checkout and the webhook now exist in code** (uncommitted, undeployed, and never run against a real store). Two halves: **outbound**, `POST /api/checkout` → a plain buy link carrying `checkout[custom][user_id]`, **no API key involved anywhere**; and **inbound**, `POST /webhook/lemonsqueezy`, which verifies an `X-Signature` HMAC over the **raw** body and applies orders, refunds and subscription events. Read the Lemon Squeezy entries under **Non-obvious design decisions** before touching either.
  - Until the owner creates the store and sets `LEMONSQUEEZY_*`, nothing is purchasable, every button stays "Coming soon", and plans and credits are still set by hand (DeveloperToDo.md §5).
  - Three new backend env vars, **all optional and all failing closed** (full list in [backend/README.md](backend/README.md)):

    | Var | Meaning |
    |---|---|
    | `LEMONSQUEEZY_STORE` | store subdomain slug, e.g. `drivetag` |
    | `LEMONSQUEEZY_VARIANTS` | JSON map of our plan/pack id → variant id, e.g. `{"creator":"111","creator-yearly":"112","pack-250":"210"}`. Yearly keys are `<planId>-yearly`. Parsed into a null-prototype object; unparseable ⇒ treated as none and logged once |
    | `LEMONSQUEEZY_WEBHOOK_SECRET` | webhook signing secret; empty ⇒ `POST /webhook/lemonsqueezy` 503s every request |

    Checkout links need `LEMONSQUEEZY_STORE` **and** at least one variant (`env.lemonSqueezy.configured`); the webhook needs only the secret. Setting one of store/variants without the other is reported at boot as a "Production config problem".

Both `frontend/` and `backend/` deploy from the same GitHub repo/branch (`production`) — do not split them into separate repos or branches. Work lands on `staging` first and is merged into `production` to release; their trees are currently identical, though staging's ref still sits one commit behind (see **Branch reality**). Within a single merge Vercel usually finishes before DigitalOcean, which is why `api.ts` keeps normalizers for older API responses and why `/beta` maps auth-shaped errors to "this server is too old".

## Architecture

```
backend/
├── server.js                  validates env, then dynamically imports the app
├── src/
│   ├── app.js                 express assembly (separate from listen)
│   ├── config/env.js          dotenv + typed config + assertRequiredEnv()
│   ├── config/plans.js        every plan limit, top-up pack and per-process editing limit
│   ├── lib/supabase.js        service-role client (bypasses RLS — server only)
│   ├── middleware/            requireAuth (Supabase token), errorHandler,
│   │                          rateLimit.js (sliding-window factory: { windowMs, max, key? })
│   ├── routes/
│   │   ├── driveWebhook.routes.js  POST /webhook/drive
│   │   ├── lemonSqueezyWebhook.routes.js  POST /webhook/lemonsqueezy — raw body, HMAC, verify-then-work-then-ack
│   │   ├── auth.routes.js          Drive OAuth start/callback/disconnect
│   │   ├── drive.routes.js         folder browser/create, watch lifecycle, legacy single-folder endpoints
│   │   ├── processes.routes.js     work process CRUD, status, per-process Organize now
│   │   ├── plans.routes.js         public GET /api/plans
│   │   ├── beta.routes.js          public closed-beta signup; admin list/patch/CSV behind an email allowlist
│   │   ├── checkout.routes.js      POST /api/checkout → a Lemon Squeezy buy link for a plan or pack
│   │   └── account.routes.js       /api/me (GET, and DELETE = delete account), /api/activity
│   ├── services/
│   │   ├── googleAuth.service.js   OAuth client, consent URL, token exchange
│   │   ├── drive.service.js        file bytes, rename/move, changes feed, folder browse/create
│   │   ├── driveWatch.service.js   channel start/stop/renew
│   │   ├── driveConnect.service.js parks the OAuth grant until the user who started Drive-connect claims it
│   │   ├── gemini.service.js       per-process prompt + schema: images → {subject, style, genre, …}; documents →
│   │   │                           {topic, type, organization, documentDate, …}; per-kind cost config
│   │   ├── document.service.js     reads a document into memory: PDF first pages (pdf-lib), .docx text (mammoth),
│   │   │                           text files, Google Docs/Sheets/Slides export; size, zip-bomb and editing-grace rules
│   │   ├── entitlement.service.js  effective plan, remaining credits, which processes are locked
│   │   ├── processes.service.js    process validation, folder checks, create-in-Master folders
│   │   ├── pipeline.service.js     Loop B sweeps, Organize now, per-process AI worker pools, Raw folder status
│   │   ├── account.service.js      account deletion (disconnect Drive, drop pending grants, delete the auth user)
│   │   ├── beta.service.js         closed-beta signups: validation, admin allowlist, tester discount, CSV export
│   │   ├── lemonSqueezy.service.js variant lookup both ways, checkout-link building, X-Signature HMAC verify,
│   │   │                           their subscription status -> ours. No API key, no network calls.
│   │   └── autoSync.service.js     polling fallback for channels Google won't push to
│   ├── repositories/          one module per table or SQL function group, all Supabase access
│   └── utils/                 logger (redacting), crypto (AES-GCM + HMAC state), filename (templates), fileDate,
│                              processValidation, httpError, origins, serialize
└── scripts/
    ├── test-gemini.js         standalone Gemini probe
    ├── renew-channels.js      cron entrypoint for channel renewal
    └── get-token.js           mint a Supabase access token for curl testing
backend/test/                  node:test suites (mocked collaborators; PGlite runs the real migrations for the SQL tests;
                               the filename vectors run against both renderers)

frontend/vercel.json           SPA rewrite (all paths → index.html)
frontend/src/
├── App.tsx                    routes (public + legal + protected), app-wide SiteFooter
├── index.css                  Tailwind @theme design tokens
├── contexts/AuthContext.tsx   Supabase session + Google sign-in
├── components/
│   ├── ProtectedRoute.tsx
│   ├── RouteAnalytics.tsx     consent-gated Vercel Analytics + URL redaction; mounts CookieConsent
│   ├── CookieConsent.tsx      the cookie banner (two equal choices, reopened from the footer)
│   ├── BetaBanner.tsx         dismissible "closed beta" bar on the landing page (localStorage, try/catch)
│   ├── SiteFooter.tsx         legal links, "Cookie settings", support email
│   ├── TagFlowIllustration.tsx, DocumentFlowIllustration.tsx, PageCapIllustration.tsx, MemoryDemo.tsx
│   │                          animated marketing illustrations (images, documents, the page cap, Zero-Retention)
│   ├── ui/                    Button, Card, Modal, ConfirmDialog, TextField/TextArea, Switch,
│   │                          ProgressBar, Logo, Skeleton, AnimatedNumber, BlobBackground
│   ├── drive/                 FolderBrowser (breadcrumbs, search, new folder), FolderPickerField
│   ├── processes/             ProcessForm, ProcessKindPicker/Badge + destination, naming, tag field and instruction editors
│   ├── billing/               FamilyPicker, PlanGrid/PlanCard, TopupPacks, DocumentsExplainer, LandingPricingSection,
│   │                          TransparencyNote, BetaPriceNote, UsageMeter (both kinds), planFeatures helpers,
│   │                          ReceiptPrint (the printing-receipt confirmation graphic)
│   └── dashboard/             useDashboardData polling + the dashboard's cards (AccountCard: delete account;
│                              BetaSignupsCard: admin-only sign-up list, shown when /api/me says admin)
├── hooks/                     usePressMotion, useReveal, usePlans
├── lib/
│   ├── supabase.ts            anon-key client
│   ├── api.ts                 typed backend client (Bearer token, readable network/CORS errors, field-level error details,
│   │                          normalizers for an older backend mid-deploy)
│   ├── filename.ts            naming-template mirror of backend/src/utils/filename.js for the live preview
│   ├── consent.ts             analytics consent storage + the events the banner and footer use
│   ├── lemonSqueezy.ts        lazy lemon.js overlay loader with a redirect fallback; the
│   │                          drivetag-pending-checkout sessionStorage handoff
│   ├── format.ts, messages.ts
│   ├── gsap.ts                plugin registration + reduced-motion queries
│   └── confetti.ts
└── pages/                     Landing, Login, Plans, Beta, Onboarding, Connect, Dashboard, ProcessEditor,
                               CheckoutSuccess (/checkout/success — confirms from /api/me, never the query string);
                               legal/ Privacy, Terms, Refunds, Cookies, DataDeletion (+ LegalPage layout)

supabase/migrations/           0001_init.sql, 0002_work_processes.sql, 0003_cleanup.sql, 0004_documents.sql,
                               0005_beta.sql, 0006_checkout.sql (source of truth; 0006 not yet run in Supabase)
tests/filename-vectors.json    shared naming-template vectors both filename implementations must pass
```

Layering is strict: routes handle HTTP, services own external APIs and orchestration, repositories own all Supabase queries. Routes should not query Supabase directly.

### Non-obvious design decisions

These were deliberate and are easy to "fix" wrongly:

- **We watch the user's changes feed, not the Raw folder.** Drive's per-file watch on a folder does not reliably fire for files added inside it. So `changes.watch` + `changes.list(pageToken)` is used, filtered to the Raw folder. This is why `drive_channels.page_token` exists and must be advanced after every sweep.
- **Drive authorization is a separate OAuth grant from Supabase login.** The pipeline runs while the user is absent, so it needs its own offline refresh token; Supabase does not durably hand one over. `/api/auth/google/*` implements that flow, with a signed+expiring `state` param instead of a session cookie.
- **Env loading is centralized in `config/env.js`, which calls `dotenv.config()` in its own module body.** ESM hoists imports, so calling `dotenv.config()` in an entrypoint body runs *after* imported modules have already read `process.env`. For the same reason `server.js` validates env and then `await import()`s the app — otherwise Supabase's constructor throws before the readable "you forgot these vars" error.
- **Idempotency lives in the database.** `processed_files` has `unique (user_id, file_id)`; claiming a file before processing is what makes Drive's duplicate/retried notifications safe. The in-memory `inFlight` set in the pipeline is only a cost optimization, not the correctness guarantee. It is shared by webhook sweeps, polling sweeps and "Organize now", and its `syncing` flag is what the dashboard polls on.
- **Claims are fenced by `claimed_at`.**
  - A claim still `processing` after 15 minutes is treated as orphaned by a crash or redeploy. `claimFile` may take it over, and "Retry failed" frees it.
  - `claimFile` returns the row's `claimed_at` as a token. `processFile` re-checks it before the Drive move (`holdsClaim`).
  - `completeFile` (the `complete_processed_file` SQL function) and `recordFailure` only write while that token still owns the row, so a stalled worker can't overwrite or re-move a file someone else took over.
  - `/api/activity` reports a stale claim as `failed` ("Interrupted…"), matching `raw-status`.
  - Every Drive call passes a timeout, and the Gemini client sets `httpOptions.timeout`. Neither SDK has a default, and a hung call would keep that user's sweep "in flight" forever.
- **Drive watch channels are renewed inside the production server.**
  - Channels are requested with a 6-day expiration; the default is 1 hour.
  - `startChannelRenewal` runs hourly. `renewChannel` opens the new channel from the stored `page_token` *before* stopping the old one, so nothing queued is skipped, and a failed renewal leaves the working channel alone.
  - `stopWatch` deletes by `user_id` first, then stops whichever channel it removed, so a pause can't lose a race with a renewal.
  - Start, stop, renew and `disconnectDrive` for a user run under a per-user in-process lock, and a channel registered at Google but not recorded is stopped again. Without the lock, a disconnect during a start or renewal leaks a live channel that can no longer be stopped once credentials are gone. This assumes one backend instance.
  - `disconnectDrive` order matters: stop the channel, revoke at Google (`revokeToken(refreshToken)`; the client holds no access token, so `revokeCredentials` always failed), then delete the stored token.
  - Renewal and polling-channel conversion only run when `NODE_ENV=production`, because a local backend points at the same Supabase database. Keep `AUTO_SYNC_INTERVAL_SECONDS=0` locally for the same reason.
- **Polling fallback reuses `drive_channels`.** Google refuses webhook addresses without a public, verified domain (always the case on localhost). When `AUTO_SYNC_INTERVAL_SECONDS > 0`, `startWatch` falls back to storing a channel with `resource_id = 'polling'` and a far-future expiry:
  - `services/autoSync.service.js` runs the normal `processNotification` on those rows each interval, so live and polling modes share one code path.
  - Deleting the row pauses it.
  - The renewal job ignores these rows.
  - Off (`0`) by default.
- **The changes feed never reports files that were already in Raw.** `POST /api/processes/:id/organize` lists that process's Raw folder directly and runs the same `processFile`. It only starts on an explicit click, so existing client files are never moved without consent. Passing `retryFailed: true` frees `failed` claims first.
- **Processes are camelCase on the wire.** Repositories return snake_case rows; routes pass processes, destinations and usage through `utils/serialize.js`. Activity rows stay snake_case, and the frontend types match that.
- **One Drive watch per user serves every work process.**
  - The sweep matches each changed file's direct parent against the Raw folders of *active* processes. Processes are ranked oldest first; any beyond the plan's `maxProcesses` are `locked`, and disabled processes are skipped.
  - Adding or editing processes never touches the watch. Deleting the last one stops it.
  - A Raw folder belongs to exactly one process (`unique (user_id, raw_folder_id)`).
- **Loop guard.** An image must never be moved into any process's Raw folder, including disabled or locked ones, or it would be sorted again.
  - `processValidation.folderConflicts` rejects such layouts on save.
  - `pipeline.resolveDestination` falls back to Unsorted at runtime, and fails the file if Unsorted is itself a Raw folder.
  - The ledger stays unique on `(user_id, file_id)`, so a file is sorted automatically at most once.
- **Two process kinds, one pipeline.** `work_processes.kind` is `image` or `document`, set at creation and immutable.
  - Immutability is enforced three times: validation 400 on `kind`, the service, and `save_work_process` raising `process_kind_immutable`.
  - A process only claims files whose MIME type is in `MIME_TYPES_BY_KIND[kind]` (`utils/filename.js`); anything else in its Raw folder is ignored, never claimed.
  - Naming tokens are per kind (`TEMPLATE_TOKENS_BY_KIND`: documents use `{type} {topic} {organization} {docdate}`).
  - **Reserved tag keys are per kind on purpose.** Existing image processes may already have a tag keyed `type`/`topic`; reserving the union would lock them out.
  - Both renderers stay identical and are checked by `backend/test/filename-vectors.test.js`, which imports the `.ts` file directly.
- **Documents are read in memory with a hard cost cap** (`document.service.js`, `FILE_LIMITS` in plans.js):
  - PDFs are trimmed to their first 5 pages with pdf-lib.
  - `.docx`, text files and Google Docs/Sheets/Slides (Drive export) are cut to 12,000 characters.
  - Files over 20 MB are failed before download.
  - A `.docx` whose zip declares more than 100 MB unpacked is refused before mammoth inflates it (`declaredUnzippedBytes`).
  - Library errors become readable messages. Never let raw parser errors reach `processed_files.error`, because users see it.
- **Google-native files edited in the last 10 minutes are left alone** (`isStillBeingEdited`), so a Doc someone is still writing inside Raw isn't moved mid-sentence.
  - They're never claimed and count as "waiting".
  - The changes feed won't report them again unless they change, so the pipeline keeps an in-memory **deferred queue** per user (`deferGraceFile`, `processDeferredFiles`), capped at 500.
  - One `unref`'d timer per user fires when the earliest file is due (grace + 30 s), and every sweep also processes due entries.
  - A due file is re-fetched (`getFileMetadata`), then dropped if it's gone, trashed or no longer in Raw, re-deferred if edited again, or run through the normal claim/charge path.
  - A Drive error keeps the entry for a retry.
  - It's single-instance and in memory, so a restart falls back to "Organize now". `forgetUser` clears it on account deletion.
- **Document prompts are injection-hardened.**
  - A separate system instruction says document text is content, never instructions.
  - The text travels inside a fenced block, and `fenceSafe` neutralizes any fence markers inside it.
  - Owner settings stay labelled JSON data.
  - `DOCUMENT_COST_CONFIG` uses LOW media resolution. It was measured 33–38% cheaper than medium with the same classification.
- **Credits are per kind and charged on success only, atomically.**
  - Documents have their own free/monthly/top-up buckets (`subscriptions.free_documents_used`, `period_documents_used`, `document_topup_balance`).
  - The pipeline reserves and releases from `ctx.credits[kind]`.
  - A sweep fast-forwards only when *every* kind that has a runnable process is out of credits. Files of an exhausted kind come back "blocked" and wait in Raw.
  - The SQL function `complete_processed_file_v2` does three things in one transaction: re-checks the `claimed_at` fence, charges one credit of the file's kind (free → monthly → top-up → `overage`), and marks the file completed.
- **0004 is expand-only.** The v1 `complete_processed_file`, `image_usage` and `grant_image_credits` stay for the previous backend during a deploy; v1 now also resets the document period counter.
  - The new backend calls `usage_snapshot`, `complete_processed_file_v2` and `grant_credits`, and `schemaProblem()` logs loudly if 0004 is missing. It now probes 0002 → 0004 → 0005 → 0006 in that order, since each builds on the last and the earliest missing one is the real problem.
  - **The 0006 probe is a deliberately invalid write.** `apply_subscription_state` writes, so unlike the others it can't be probed with a harmless read. It's called with the plan id `__schema_probe__`, which `subscriptions_plan_check` always rejects, so the insert can never succeed no matter which user id is passed and nothing is ever persisted. A function that exists therefore *always* errors — only PostgREST's own "no such function" (or an auth-shaped error) is treated as meaningful. Relying on the user-id foreign key to fail instead would leave a boot-time write that only fails by luck.
  - Drop the v1 functions only in a later migration, after the cleanup release.
  - The frontend's `api.ts` normalizes old API responses (missing `kind`, family, document usage) because Vercel usually finishes deploying before DigitalOcean. Don't remove those normalizers.
  - Failed files are never charged, so there are no refunds, and a taken-over claim can't be charged twice.
  - A run reads remaining credits once. Each file **reserves** one before its first `await`, and the reservation is released on every outcome that wasn't charged (skipped, claim lost, failed), so concurrent workers can never dispatch more files than there are credits. Deploy overlap is the only thing that produces `overage`.
- **Several AI workers per process, one run per user.**
  - The per-user single slot (`inFlight`) still allows one sweep or "Organize now" at a time.
  - Inside a run, each process gets a manager (`runProcessQueue`). It de-duplicates files by id and runs them through a pool of `plan.aiPerProcess` workers.
  - Different processes run concurrently.
  - A server-wide FIFO semaphore (`MAX_CONCURRENT_AI_JOBS`, default 20; DeveloperToDo.md §7 recommends `10` on a 1 GB instance, though nobody has confirmed the deployed value) bounds simultaneous download+classify steps. It exists for memory, since each step holds an image buffer, and for the AI rate limit. It isn't fair across users (ponytail-noted), so if the deployed value is 10, a tier whose `aiPerProcess` equals that cap can starve everyone else — see the **Plans** bullet in **Current State**.
  - The DB claim stays the duplicate guard.
  - `complete_processed_file` locks the subscription row `FOR UPDATE`, so concurrent charges can't lose an increment.
  - Live counts reach the dashboard as `workers` in `GET /api/processes/status`.
- **The AI call is tuned for cost** (`COST_CONFIG` in `gemini.service.js`: medium media resolution, low thinking).
  - Measured on 2026-09-19: about 3× cheaper than the defaults, which spend ~420 billed thinking tokens per image, and 2× faster, with the same routing on the test images.
  - Google's price for the model doubles on 2027-01-01, and without this config Enterprise would run at a loss.
  - Transient 429/500/503 errors are retried by the SDK (`httpOptions.retryOptions`).
  - Errors stored for users are vendor-neutral.
- **Plan families share tiers.** A tier (Creator/Studio/Enterprise) fixes `maxProcesses` and `aiPerProcess`; the family fixes the monthly allowances.
  - Any plan can run both process kinds and buy either pack kind.
  - The image-family ids (`creator`, `studio`, `enterprise`) predate families and are stored in `subscriptions.plan`, so never rename them.
  - Adding a plan id also needs `subscriptions_plan_check` updated in a migration. `backend/test/sql-migrations.test.js` loops over `PLAN_ORDER` so they can't drift.
- **Plan limits live only in `backend/src/config/plans.js`.** They're passed into the SQL functions as arguments; don't hard-code them in SQL or the frontend. The frontend reads them from `GET /api/plans`.
- **Out of credits, or no active processes → the page token is fast-forwarded** (`getStartPageToken`) instead of listing changes. Images that arrived meanwhile wait in Raw for "Organize now". Holding the token instead would make every later Drive change re-read an ever-growing backlog.
- **A notification that arrives mid-sweep isn't dropped.** It sets `rerunRequested`, and one more sweep runs with the channel re-read once the user's slot frees up.
- **Multi-table writes go through SQL functions.** PostgREST has no transactions, so `save_work_process` saves a process and its destination list in one call. It enforces the process limit under a per-user advisory lock.
- **The naming template renderer exists twice.** `backend/src/utils/filename.js` names real files; `frontend/src/lib/filename.ts` renders the editor's live preview. Both must pass `tests/filename-vectors.json` — change them together. An empty token removes the separator next to it, so `{a}_{b}_{c}` without `{b}` gives `a_c`.
- **Gemini gets fixed rules in `systemInstruction`, and owner settings as labelled JSON data.** Destinations are an enum of slugged keys plus `unsorted`, decided after the descriptive fields. Unknown keys fall back to Unsorted, and text inside an image is treated as image content.
- **Legacy single-folder support is transitional.** `/api/drive/config`, `/raw-status`, `/organize` and `/api/me`'s `config`/`subscription`/`entitled` fields remain as shims mapped onto the user's first work process; they never touch `folder_configs`. Production has already run `0003_cleanup.sql`, which dropped `folder_configs`, its sync trigger, the `trialing` status and `trial_ends_at`. So the remaining cleanup is code only: delete the shims.
- **Routers that must be public mount before `accountRouter`** in `app.js`. Its `router.use(requireAuth)` runs for every `/api/*` request that reaches it.
- **`app.js`'s middleware order is deliberate, top to bottom.** `helmet` first, so its security headers wrap *every* response including CORS refusals and errors; then `cors()`; then the Lemon Squeezy webhook on the raw body; then `express.json()`; then the `/api` rate limit. `contentSecurityPolicy: false` is explicit and correct — this is a JSON-only API on its own subdomain serving no HTML of its own, so a CSP here would be dead weight rather than a defense. Everything else in helmet's defaults still applies.
  - The app-wide limit is 300 requests per IP per minute and is **scoped to `/api`**, which is what keeps `/webhook/drive` and `/webhook/lemonsqueezy` out of it.
  - `app.set("trust proxy", 1)` matters for this: without it every request behind DigitalOcean's load balancer shares one `req.ip` and the whole world rate-limits as a single client.
- **Expected errors use `utils/httpError.js`.** `errorHandler` shows `error`, `code` and `details` only for errors marked `expose` (HttpError, malformed JSON), including in production. Anything else becomes "Internal server error".
- **Drive-connect returns to the origin that started it.** `POST /api/auth/google/start` signs the request's `Origin` into the OAuth `state`, provided `utils/origins.js` allows it, and the callback redirects there. Dev CORS allows any `localhost` port; production uses `CORS_ORIGINS` only, so `NODE_ENV=production` must be set when deployed.
- **The OAuth callback never stores the Drive grant.** The signed `state` proves DriveTag issued the flow, but not *who* finished Google's consent screen. Storing the grant under `state.userId` would let anyone send a victim their own consent link and attach the victim's Drive to the sender's account.
  - So `driveConnect.service.js` parks the refresh token (encrypted, in memory, 10 minutes, single use) and redirects to `/connect?pending=<id>`.
  - The signed-in frontend claims it with `POST /api/auth/google/complete`. It's saved only if the claimer started the flow; otherwise it's revoked at Google.
  - The in-memory store assumes one backend instance. A restart mid-connect just means "try again".
- **The webhook acks before processing.** Google retries on non-2xx and expects a fast response, so the sweep runs in `setImmediate` after `res.sendStatus(200)`.
- **The plan gate fails closed** and is checked before any Gemini spend. A user with no `subscriptions` row gets no processing. A Free row is created on first Drive connect (`ensureSubscription`). A paid plan only counts while `active` or `past_due`; otherwise Free limits apply.
- **Analytics is consent-gated.** `<Analytics>` mounts only after the visitor clicks "Allow analytics" in the cookie banner (`lib/consent.ts`, key `drivetag-analytics-consent-v1`).
  - The Vercel script never un-registers its `beforeSend`, so revoking takes effect through `beforeSend` reading consent live and returning `null`.
  - The banner's two choices must stay equal-weight. There's no pre-ticked option and no close button that means "accept".
  - Anything new stored in the browser must be added to the Cookie Policy (`pages/legal/Cookies.tsx`).
- **Account deletion** (`DELETE /api/me`, body `{ "confirm": "DELETE" }`):
  - It refuses with 409 `sorting_in_progress` while the user's run is in flight.
  - Then it runs `disconnectDrive`. A failure there is logged and doesn't block deletion.
  - It drops any parked Drive-connect grant, then deletes the Supabase auth user. Every user table cascades from `auth.users`.
  - Files in Drive are never touched.
  - The frontend signs out locally even if the server-side sign-out fails, because the account is already gone.
- **The closed beta is invite-only because Google says so, not because we chose it.** While the OAuth app is in *Testing* status Google caps the tester list at 100, expires refresh tokens after 7 days, and refuses sign-in to anyone not on the list. `GOOGLE_APP_TESTING=true` turns on the dashboard's reconnect warning (shown from day 5 of `driveConnectedAt`); **set it to `false` the day verification is granted**, or every user is told about an expiry that no longer applies.
- **`beta_signups` is deliberately not tied to `auth.users`.** People sign up before they have an account, and some never create one, so there is no foreign key and deleting an account does not touch a sign-up. The Privacy Policy promises a sign-up can be deleted on request, which is why `service_role` holds `delete` on that table.
- **One flag, not two.** `added_to_google` means both "I pasted this address into Google's test-user list" and "this account gets the beta price". A second approval flag would be one more thing to forget; the owner ticks one box.
- **Admin is an environment allowlist and fails closed.** `ADMIN_EMAILS` is compared against `req.user.email`, which comes from Supabase's verified token. An empty list means nobody is an admin, including the owner. The frontend's `me.admin` only decides whether to *render* the card; every admin route re-checks server-side.
- **The beta discount lives in Lemon Squeezy, not in our billing code.** The backend only says *whether* a signed-in tester may see a percentage and a code (`BETA_DISCOUNT_PERCENT` + `BETA_DISCOUNT_CODE`, both required). Neither value ever reaches a non-tester's `/api/me`. Unset either and the feature disappears from the UI — that is the off switch.
- **The signup upsert deliberately omits `added_to_google` and `notes`**, so someone re-submitting the form cannot reset their own tester status or wipe the owner's notes.
- **The public signup is validated *before* the rate limit is charged.** The 5-per-hour budget exists to protect the table, and a rejected body never reaches it — charging someone for mistyping their own email would lock them out for an hour over a typo. The limiter now comes from the shared `middleware/rateLimit.js` factory — an in-memory Map, single-instance, pruned across all keys on every write. Its `{ windowMs, max, key? }` signature is depended on by both `app.js` and `beta.routes.js`; a multi-instance backend would need a shared store instead.
- **`/beta`'s signup call reads an auth-shaped status as "this backend is too old".** The POST is public and sends no token, so 401/403/404/405 back from it cannot mean "you aren't signed in" — it can only mean the server predates `/api/beta/*`. On the older backend that path falls past the router that would mount it and lands on `accountRouter`'s `requireAuth`, which answers "Missing bearer token": accurate, useless, and not the visitor's problem to solve. `pages/Beta.tsx` keeps an `AUTH_SHAPED` set of those four statuses and shows "Beta sign-up isn't live on this server yet…" plus the support address instead.
  - `lib/messages.ts`'s `errorMessage` only recognises the 404 `No route for` shape, which is why this one is handled at the call site rather than in the shared helper.
  - This is not hypothetical: it is exactly what the deployed backend did before this release shipped, and it is what any backend still mid-deploy does while Vercel is ahead of DigitalOcean.
- **The consent checkbox's Privacy Policy link opens in a new tab** (`target="_blank"` + `rel="noreferrer"`, with a visually-hidden "(opens in a new tab)" so it isn't a surprise). Reading what you're agreeing to should not cost you the half-filled form behind it.
- **The admin CSV neutralizes spreadsheet formulas.** `name` and `notes` come from a public form and the file is opened by the owner, so a cell starting with `=`, `+`, `-` or `@` is prefixed with an apostrophe (CSV injection, CWE-1236). Escaping quotes and commas is not enough.
- **`betaStatusFor` never fails the dashboard.** `GET /api/me` is the dashboard's whole load and polls every 3 seconds while sorting; a hiccup reading `beta_signups` degrades to "not a tester" and logs a warning rather than 500-ing the page. `/me` also stopped decrypting the Drive refresh token just to test existence — `getCredentialStatus` reads only `updated_at`, which is what the reconnect warning needs anyway.
- **Prices are quoted tax-exclusive.** Lemon Squeezy is the Merchant of Record and adds the buyer's local VAT or sales tax at checkout, so `publicPlansPayload()` carries `pricesIncludeTax: false` and the UI must keep saying "Excludes VAT/sales tax" next to every price rather than hard-coding that sentence's truth.
- **"Payments launch soon" copy is gated on `plans.checkoutEnabled`, not hard-coded.** `/plans` used to state flatly that paid plans were coming and that "there's nothing to pay for or cancel yet" — sentences that become false the moment a variant is configured, while a working buy button sits beside them. Both the hero line and the cancellation FAQ now branch on `checkoutEnabled`. Any new sentence about whether payment exists must branch the same way; advertising "launching soon" next to a live buy button is exactly the false claim the project's honesty rule forbids.
- **`checkoutEnabled` and per-item `purchasable` both normalize to `false` in `api.ts`.** An older backend mid-deploy sends neither field, and defaulting either to `true` would render a buy button that 503s. Failing to "Coming soon" is always the safe direction. A plan is `purchasable` only once `LEMONSQUEEZY_VARIANTS` maps its id; Free never is. Signed-out visitors see a purchasable plan link to `/login`, not to checkout.
- **Lemon Squeezy outbound: a plain buy link, and no API key anywhere.** `POST /api/checkout` returns `https://<store>.lemonsqueezy.com/checkout/buy/<variantId>?checkout[custom][user_id]=<uid>&checkout[email]=<email>`. Plain buy links need no credentials, so none are stored — there is deliberately no `LEMONSQUEEZY_API_KEY`. The REST API (`POST /v1/checkouts`) is only for bespoke checkouts (custom expiry, per-customer pricing); don't add it, and the key it would need, without a reason.
  - **`checkout[custom][user_id]` is the whole mapping, and it is added server-side.** It comes back in the webhook at `meta.custom_data.user_id` and is the only thing tying a payment to a DriveTag account. `checkoutUrlFor` *throws* rather than build a URL without one — a link missing it produces a paid order nobody can be credited for.
  - **Their "Domains" setting is for *their* pages, not ours.** It re-hosts the Lemon Squeezy storefront and checkout under your own domain. It has nothing to do with serving the DriveTag app, which is why pointing the apex at it collided with Vercel and took the marketing site down for anyone whose resolver picked their IP (DeveloperToDo.md §2.1). It is entirely optional, and a branded address must be a subdomain like `checkout.drivetag-ai.com` — **never the apex**.
- **The Lemon Squeezy webhook is mounted before `express.json()`, and that is load-bearing.** The `X-Signature` header is an HMAC-SHA256 of the **exact request bytes**. `app.js` mounts `/webhook/lemonsqueezy` at line 42 with `express.raw({ type: "application/json" })`; the global `app.use(express.json())` is line 44. Move the mount below it and the parser consumes the body, the router re-serializes a different byte string, and *every* delivery verifies as forged — a silent, total payment outage that looks like an attack. The Drive webhook is unaffected: it authenticates with a shared-secret header, not a body hash.
  - `verifySignature` length-checks before `crypto.timingSafeEqual`, which **throws** on unequal-length buffers. A missing, short or non-hex header returns `false`, never a 500.
  - The app-wide `/api` rate limit does not apply: **both webhook paths are outside `/api` by design.** Google and Lemon Squeezy legitimately burst, and rate-limiting a payment webhook loses money.
- **This webhook does the work BEFORE acking — the exact opposite of the Drive one, on purpose.** The Drive webhook acks in `setImmediate` because Google wants a fast 200 and a missed notification is recoverable (the changes feed or "Organize now" finds the file again). A missed *payment* is not recoverable: acking first means a transient database error drops someone's credits with nothing left to retry it, and the only trace is a log line nobody reads. So: verify, dispatch, then `200` on success and **`500` on failure**, which makes Lemon Squeezy redeliver (3 more times, ~5 s / 25 s / 125 s). Every handler is idempotent, and that idempotency is the only reason a redelivery is safe — don't add a handler that isn't.
  - A **verified** request that simply cannot be acted on — malformed JSON, no `meta.custom_data.user_id`, an event we don't handle — still returns `200`. Retrying would never fix any of those, and a non-2xx would retry forever.
  - An **unverified** request is never 200'd: bad signature is `401`, and a missing `LEMONSQUEEZY_WEBHOOK_SECRET` is `503`.
- **`cancelled` maps to `active`, and only `subscription_expired` downgrades.** Lemon Squeezy's "cancelled" means *will not renew*, not *access revoked* — the customer keeps what they paid for until `ends_at`, which is exactly what `/terms` promises. `mapStatus`: `on_trial`/`active` → `active`, `past_due`/`unpaid` → `past_due`, **`cancelled` → `active`**, `paused` → `cancelled`, `expired` → `expired`. Getting this backwards cuts off people who have already paid for the current period. `subscription_cancelled` therefore re-applies the same plan and status and only refreshes `current_period_end`.
- **Purchase and refund use deliberately DIFFERENT grant references.** `grant_credits` in `0006` no-ops when `p_reference` already exists, which is what makes a redelivered order safe. If a refund reused the order's reference, that guard would swallow **every** clawback silently. So an order grants under `ls-order-<id>` and its refund removes under `ls-refund-<id>` — same order id, different namespace, both individually idempotent.
  - The idempotency check sits **after** `select … for update`, not before it. Checked before the lock, two overlapping redeliveries would both find no existing grant, both proceed, and the loser would hit `provider_reference`'s unique index and raise — a spurious 500 that triggers yet another retry. Under the lock they serialise on the user's subscription row.
  - A clawback that would take the balance below zero raises `insufficient_credits`; the webhook **catches it and still 200s**. The customer already spent those credits, there is nothing left to take back, and that is the correct commercial outcome — not an error to retry forever.
  - `apply_subscription_state` uses `coalesce(excluded.x, s.x)` for the provider columns and `current_period_end`, so an event carrying no customer id cannot erase one an earlier event stored. `period_anchor` moves only when the plan actually changed or a restart was asked for, mirroring `admin_set_plan`. Status and plan are validated by catching the live table constraints, never a second hard-coded list.
- **Variant lookup guards against prototype keys.** The item id arrives in a request body, so `variants[itemId]` on a plain object would resolve `__proto__`, `constructor` or `toString` to inherited members of `Object.prototype`, sail past a `!variantId` check and return a 200 with a nonsense checkout URL. Two guards, both needed: the item must be something we actually sell (`Object.hasOwn(PLANS, …)` or a real pack), and the variant must be an own key. `LEMONSQUEEZY_VARIANTS` is also parsed into a **null-prototype** object, so the map is safe by construction. Unparseable JSON there is treated as "no variants" and logged once, never a boot crash.
- **`/checkout/success` confirms from `GET /api/me`, never from the query string**, and a before/after diff alone is **not sufficient**. The webhook is a server-to-server call that routinely lands *before* the browser gets redirected back, so the very first `/api/me` read already contains the purchase, every later delta is zero, and a diff-only page leaves a paying customer on "confirming" forever. The buy button therefore records the chosen item in `sessionStorage` under **`drivetag-pending-checkout`** (`lib/lemonSqueezy.ts`, `rememberPendingCheckout`), and the page confirms by matching `me.plan.id` to it — **checked before the baseline is taken, and on every poll**. Packs still use a delta, because their id isn't a plan id.
  - `sessionStorage`, not `localStorage`: one tab, one browsing session, which is exactly the lifetime of one checkout. Every access is wrapped in try/catch — it throws in private mode and with site data blocked, and a storage failure must never stop someone buying. Without it the page falls back to the delta.
  - The stored value is only ever used to *recognise* the purchase, never to display anything, so a tampered value can at worst delay confirmation. It can never put a plan name or a number on the receipt.
  - It is browser storage, so **the Cookie Policy (`pages/legal/Cookies.tsx`) must list it** — the standing rule is in the analytics-consent entry above. **It is not listed there yet**; that is item 2 on Claude's list under **Open tasks**.
- **Legal pages are code, and must match the code.** `/privacy`, `/terms`, `/refunds`, `/cookies` and `/data-deletion` describe exactly what the backend stores and does, including Google's required Limited Use sentence.
  - Change them when data handling, providers, storage keys or refund terms change.
  - The Google OAuth consent screen links to `/privacy` and `/terms`.
- **Vercel Analytics gets explicit `route`/`path` props and a `beforeSend` redactor** (`frontend/src/components/RouteAnalytics.tsx`). The script's auto-tracking only hooks `history.pushState`, so `<Navigate replace />` redirects — including login → dashboard — went uncounted. The redactor strips the hash and every query param except `utm_*`, because OAuth returns put Supabase tokens and `code`/`state` in the URL. Don't swap it for a bare `<Analytics />`. In dev, StrictMode logs the first view twice; production sends one.
- **Full `drive` scope is required**, not `drive.file` — the app must read files other people drop in the folder. This makes the app subject to Google restricted-scope verification and an annual CASA security assessment; see backend/README.md.
- **The frontend dev server uses `strictPort` on 5173.** Supabase's redirect allowlist names that origin, and silently drifting to 5174 used to break every API call with a bare "Failed to fetch". Dev CORS now tolerates other localhost ports too, but keep `strictPort` so there's one canonical dev origin.
- **`@gsap/react` doesn't revert between dependency changes by default.** Pass `revertOnUpdate: true` to `useGSAP` whenever a dependency-driven effect starts looping or stateful animations, or they stack up.
- **Tailwind v4's `rotate-*` / `scale-*` emit standalone `rotate` and `scale` properties, which *compose* with GSAP's `transform` rather than being replaced by it.** So a GSAP `rotation` value is applied **relative to** the class's resting rotation, not instead of it. The receipt stamp (`components/billing/ReceiptPrint.tsx`) rests at `rotate-[-8deg]` and animates to GSAP `rotation: 0`, which lands on the intended -8deg; animating to `rotation: -8` stacked into -16deg under motion while reduced-motion visitors correctly rested at -8. If a GSAP rotation or scale looks doubled, check for a Tailwind utility of the same name on the element before touching the tween.
  - Same file, separate rule: **the PAID stamp lives in a reserved right gutter (`pr-24`) of the footer row, not absolutely positioned over the paper.** Overlaid, it covered the subtotal figure. A stamp that can obscure a money value is a bug, not a style preference — verified down to 375px.
- **The Drive webhook needs a Google-verified domain.** Drive refuses to register a watch on an address whose domain isn't verified in the Cloud project, so free ngrok URLs and `*.ondigitalocean.app` can't receive notifications. Production uses `api.drivetag-ai.com`. It needs `drivetag-ai.com` verified in Search Console, with a TXT record on host `@`, before watches can switch from polling to webhooks.

## Commands

All commands run from `backend/`:

```bash
npm install                    # install dependencies
npm run dev                    # start with nodemon (auto-reload)
npm start                      # start without auto-reload
npm test                       # node:test suites in test/ (mocked + PGlite SQL; no .env, network or AI calls; Node 22.3+)
npm run test:gemini [path] [--process spec.json]   # classify a local image or document (.pdf .docx .txt .md .csv), print tags + filename
npm run renew:channels         # renew expiring Drive watch channels now (production also does this hourly in-process)
npm run token -- <email> <pw>  # mint a Supabase access token for curling the authed routes
```

From `frontend/`: `npm run dev` (Vite, port 5173), `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint), `npm run preview` (serve the production build). `.claude/launch.json` defines the dev server and production preview as preview-server configs.

`npm run test:gemini` and `npm run token` need only their own vars; the server needs the full `backend/.env` and refuses to boot, naming the missing variables, when it's incomplete. The variable list lives in [backend/README.md](backend/README.md). `npm test` covers:
- the worker manager (concurrency caps, de-duplication, per-kind credit reservation, fast-forward);
- document reading (PDF trimming, docx, text, exports, zip-bomb guard);
- document prompts;
- process validation;
- both filename renderers;
- entitlement;
- the organize route;
- account deletion;
- the checkout route and link building (including `__proto__` / `constructor` as item ids);
- the Lemon Squeezy webhook — signature verification, every event handler, idempotency, the refund clamp;
- the rate-limit middleware;
- `schemaProblem()` telling an auth error apart from a missing migration;
- the real SQL migrations in PGlite (charging, rollover, grants, plan ids, kind immutability). Everything else is verified with manual probes, curl and browser checks. Name new test files `*.test.js` under `backend/test/`; the script is scoped there so it never picks up `scripts/test-gemini.js`, which makes a real, billed AI call.

## API surface

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |
| POST | `/webhook/drive` | `X-Goog-Channel-Token` shared secret |
| POST | `/webhook/lemonsqueezy` | `X-Signature` HMAC-SHA256 over the raw body (mounted before `express.json()`; exempt from the `/api` rate limit) |
| POST | `/api/auth/google/start` | Bearer (Supabase) |
| GET | `/api/auth/google/callback` | signed `state` param (parks the grant; stores nothing) |
| POST | `/api/auth/google/complete` | Bearer, must be the user who started the flow |
| DELETE | `/api/auth/google` | Bearer |
| GET | `/api/plans` | none |
| POST | `/api/beta/signups` | none (public form; 5/hour per IP) |
| GET | `/api/beta/signups` | Bearer + `ADMIN_EMAILS` |
| PATCH | `/api/beta/signups/:id` | Bearer + `ADMIN_EMAILS` |
| GET | `/api/beta/signups.csv` | Bearer + `ADMIN_EMAILS` |
| GET/POST | `/api/drive/folders` (`?q`, `?parentId`, `?pageToken`; POST creates a folder) | Bearer |
| GET | `/api/drive/folders/:id/path` | Bearer |
| GET/POST/DELETE | `/api/drive/watch` | Bearer |
| GET/POST | `/api/processes` (POST body requires `kind`: `image` \| `document`) | Bearer |
| GET | `/api/processes/status` | Bearer |
| GET/PUT/PATCH/DELETE | `/api/processes/:id` | Bearer |
| POST | `/api/processes/:id/organize` (402 `out_of_images` / `out_of_documents`) | Bearer |
| POST | `/api/checkout` — body `{ item, billing? }` → `{ url }`; 503 `checkout_unconfigured`, 400 `unknown_item` | Bearer |
| GET | `/api/me` | Bearer |
| DELETE | `/api/me` (body `{ "confirm": "DELETE" }`) — delete account | Bearer |
| GET | `/api/activity` (`?processId`) | Bearer |
| GET/POST | `/api/drive/config` — legacy, removed in the cleanup release | Bearer |
| GET / POST | `/api/drive/raw-status` / `/api/drive/organize` — legacy, all processes | Bearer |

## Conventions

- ESM throughout (`"type": "module"`); use `node:` prefixes for builtins.
- Secrets come from `config/env.js`, never `process.env` at a call site.
- Log with `utils/logger.js` (structured JSON, auto-redacts token/secret/key fields) rather than `console.log`. Never log image bytes.
- Repositories throw on Supabase errors with a contextual message; routes let Express 5 forward rejections to `errorHandler`.
- Never paste or commit credentials. `.env` files are gitignored; production values go in DigitalOcean/Vercel encrypted env settings.
- `.claude/skills/gsap-*` are third-party files pinned by `skills-lock.json`. Update them with `npx skills update` rather than hand-editing.
  - The current CLI installs into an untracked `.agents/skills/` and turns each `.claude/skills/gsap-*` into a symlink. Git on this Windows machine has `core.symlinks=false`, so that layout doesn't commit cleanly.
  - If `git status` then shows no content change, restore the committed layout: remove the symlinks, run `git checkout -- .claude/skills skills-lock.json`, and delete `.agents/`. The 2026-09-19 update was content-identical.

## Open tasks (as of 2026-09-20)

Two lists, and they are not interchangeable. The first is code, and is what the owner should ask Claude for. The second needs a dashboard, a key, a domain or money — no code can do it, and the long form lives in [DeveloperToDo.md](DeveloperToDo.md).

### What Claude does next (code)

1. **Commit the checkout release** sitting uncommitted in the working tree — the whole set listed under **Branch reality** above, code and all five `.md` files. Nothing in it is live until it is committed, merged to `production` and redeployed, **and `0006_checkout.sql` has been run first** (owner item 1).
2. ~~Add `drivetag-pending-checkout` to the Cookie Policy~~ — **done**, it is listed in `frontend/src/pages/legal/Cookies.tsx` alongside the analytics and beta-banner keys, with a note that it is session storage and so is dropped when the tab closes. The standing rule stands: anything the app writes to a visitor's browser appears on that page, cookie or not.
3. **Delete the legacy shims** — `/api/drive/config`, `/api/drive/raw-status`, `/api/drive/organize`, and `/api/me`'s `config` / `subscription` / `entitled` fields. `0003_cleanup.sql` already ran; what's left is code only. Kept deliberately **out** of the checkout release so a rollback of that release is unambiguous — do this as its own change, after checkout has shipped and settled.
4. **Yearly billing in the UI.** The plan config already carries a yearly price for the six non-Enterprise paid plans, `POST /api/checkout` already accepts `billing: 'yearly'`, and `variantFor` already looks up `<planId>-yearly`. What's missing is a monthly/yearly toggle on the plan cards; today the button always sends `'monthly'`, and `buildReceipt()` in `pages/CheckoutSuccess.tsx` prices off `planInfo.price.monthly` to match — change both together or the receipt will lie. (`ReceiptPrint` itself never prices anything; it takes pre-formatted strings.)
5. **Drop the v1 SQL functions** (`complete_processed_file`, `image_usage`, `grant_image_credits`) in a later migration, once the cleanup release is deployed on both hosts.
6. **Re-sorting already-sorted files.** Not built; the ledger is unique on `(user_id, file_id)`, so a design decision is needed before code.

### What only the owner can do

1. **Run `0006_checkout.sql`** in the Supabase SQL editor — **before** the checkout release is deployed, not after. Nothing applies it automatically.
2. **Create the Lemon Squeezy store, products and variants.** 21 variants: 9 paid plans, 6 of which also have a yearly price (the Enterprise tiers are monthly only), plus the 6 top-up packs. **Name each variant after its plan or pack id** — that name is what makes the webhook's variant→plan mapping unambiguous. No API key is needed; plain buy links use none. DeveloperToDo.md §2.
3. **Set the three `LEMONSQUEEZY_*` variables on DigitalOcean** — `LEMONSQUEEZY_STORE`, `LEMONSQUEEZY_VARIANTS`, `LEMONSQUEEZY_WEBHOOK_SECRET` (see the Payments table under **Tech Stack**). All three fail closed, so the release can ship before they're set.
4. **Create the webhook endpoint** at `https://api.drivetag-ai.com/webhook/lemonsqueezy`, subscribed to `order_created`, `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_payment_success`, `subscription_payment_failed`, `subscription_cancelled` and `subscription_expired`, and put its signing secret in `LEMONSQUEEZY_WEBHOOK_SECRET`.
5. **Make one real test-mode purchase, end to end, before anything goes public.** No real payment has ever run through this code. Everything is unit-tested; nothing is proven against the live provider.
6. **Redeploy the backend** so the new AI-worker counts (Creator 2, Studio 3, Enterprise 10) actually apply — after the release is committed.
7. **Set the remaining DigitalOcean variables**: `GOOGLE_APP_TESTING`, and `BETA_DISCOUNT_PERCENT` + `BETA_DISCOUNT_CODE` (both required, or the discount never appears). `ADMIN_EMAILS` is already set. Decide the beta discount first.
8. **Delete the test sign-up row left behind when the live form was verified**: `delete from public.beta_signups where lower(email) = 't@example.com';` in the Supabase SQL editor.
9. **Confirm Drive watches now register.** Google domain verification (Search Console + Cloud) is recorded done, and the Namecheap records, including the TXT on host `@`, are settled (DeveloperToDo.md §7). Check whether webhooks now work and, if so, move `AUTO_SYNC_INTERVAL_SECONDS` to `0`; until confirmed, sorting stays on the polling fallback.
10. **Google brand verification, restricted-scope verification and the CASA assessment.** Until they're granted the app stays in *Testing*: 100 testers maximum, refresh tokens expiring every 7 days, and nobody off the list can sign in. Paste beta sign-ups into Google's test-user list by hand and tick **Added** on the dashboard. The day verification lands, set `GOOGLE_APP_TESTING=false`.
