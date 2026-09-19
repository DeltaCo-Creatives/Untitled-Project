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

Production-ready and live. Status, plans and the pricing strategy are in [README.md](README.md).
- Setup, env vars, credentials, database helpers, deployment and operations are in [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).
- Everything only the owner can do (migrations, DNS, Google, hosting settings) is in [DeveloperToDo.md](DeveloperToDo.md).

Keep all four current when state or setup changes.

- **Backend:** Drive OAuth, the watch-channel lifecycle, the change-feed sweep, AI classification and rename/move are wired together.
  - Users build **AI work processes** of two kinds, `image` or `document`, chosen at creation and never changed.
  - Each process is a Raw folder feeding a Master folder, split into AI-chosen destination folders, with its own naming template, custom tag fields and instructions.
  - Each process is sorted by up to `plan.aiPerProcess` AI workers at once.
  - Also included: a polling fallback, "Organize now" for files already in Raw, and self-service account deletion (`DELETE /api/me`).
- **Plans:** Free plus three families (Images, Documents, Images + Documents) × three tiers (Creator / Studio / Enterprise).
  - Tiers set processes and AI workers per process; families set the monthly image and/or document allowances.
  - Image and document packs top up either kind.
  - Usage is metered per kind. Prices are USD placeholders. Everything is in `backend/src/config/plans.js`.
- **Frontend:** React 19 + Vite + Tailwind. Real Supabase Google login, and every screen is backed by the API (`src/lib/api.ts`).
  - Public pages: Landing `/`, `/login`, `/plans`, and the legal pages `/privacy`, `/terms`, `/refunds`, `/cookies`, `/data-deletion`.
  - Protected pages: `/onboarding`, `/dashboard`, `/connect`, `/processes/new`, `/processes/:id`.
  - Pastel "Lavender garden" design system, GSAP animation, cookie consent banner, self-hosted fonts.
- **Credentials:** `.env` files are gitignored and don't travel through git. The desktop working copy has real credentials; any other checkout, including cloud sessions, starts blank, and `npm run dev` names what's missing. There are no `.env.example` templates, deliberately; [backend/README.md](backend/README.md) lists every variable.
- **Not built:**
  - Checkout and the payment-provider webhook (Lemon Squeezy vs Paddle undecided). Until they exist, plans and credits are set by hand (DeveloperToDo.md §9).
  - `helmet`/rate limiting.
  - Re-sorting already-sorted files.
- **Schema:** production has `0001`–`0003` applied.
  - `0004_documents.sql` (document processes, per-kind credits, plan families) must be run by the owner **before** the release that uses it is pushed.
  - Any new migration must be run by hand in the Supabase SQL editor before deploying code that depends on it; nothing applies migrations automatically.
- **Production:** deployed from `production`. The frontend is on Vercel at `drivetag-ai.com` and the backend on DigitalOcean at `api.drivetag-ai.com`. Open owner items:
  - The Namecheap DNS fix.
  - Google domain verification. Until it's done, Drive webhooks can't be registered and sorting runs on the polling fallback (`AUTO_SYNC_INTERVAL_SECONDS` > 0).
  - The rest are in DeveloperToDo.md.

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
- **Payments:** Lemon Squeezy or Paddle (Merchant of Record). *Not integrated yet.*

Both `frontend/` and `backend/` deploy from the same GitHub repo/branch (`production`) — do not split them into separate repos or branches. `staging` also exists on the remote.

## Architecture

```
backend/
├── server.js                  validates env, then dynamically imports the app
├── src/
│   ├── app.js                 express assembly (separate from listen)
│   ├── config/env.js          dotenv + typed config + assertRequiredEnv()
│   ├── config/plans.js        every plan limit, top-up pack and per-process editing limit
│   ├── lib/supabase.js        service-role client (bypasses RLS — server only)
│   ├── middleware/            requireAuth (Supabase token), errorHandler
│   ├── routes/
│   │   ├── driveWebhook.routes.js  POST /webhook/drive
│   │   ├── auth.routes.js          Drive OAuth start/callback/disconnect
│   │   ├── drive.routes.js         folder browser/create, watch lifecycle, legacy single-folder endpoints
│   │   ├── processes.routes.js     work process CRUD, status, per-process Organize now
│   │   ├── plans.routes.js         public GET /api/plans
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
│   ├── SiteFooter.tsx         legal links, "Cookie settings", support email
│   ├── TagFlowIllustration.tsx, DocumentFlowIllustration.tsx, PageCapIllustration.tsx, MemoryDemo.tsx
│   │                          animated marketing illustrations (images, documents, the page cap, Zero-Retention)
│   ├── ui/                    Button, Card, Modal, ConfirmDialog, TextField/TextArea, Switch,
│   │                          ProgressBar, Logo, Skeleton, AnimatedNumber, BlobBackground
│   ├── drive/                 FolderBrowser (breadcrumbs, search, new folder), FolderPickerField
│   ├── processes/             ProcessForm, ProcessKindPicker/Badge + destination, naming, tag field and instruction editors
│   ├── billing/               FamilyPicker, PlanGrid/PlanCard, TopupPacks, DocumentsExplainer, LandingPricingSection,
│   │                          TransparencyNote, UsageMeter (both kinds), planFeatures helpers
│   └── dashboard/             useDashboardData polling + the dashboard's cards (incl. AccountCard: delete account)
├── hooks/                     usePressMotion, useReveal, usePlans
├── lib/
│   ├── supabase.ts            anon-key client
│   ├── api.ts                 typed backend client (Bearer token, readable network/CORS errors, field-level error details,
│   │                          normalizers for an older backend mid-deploy)
│   ├── filename.ts            naming-template mirror of backend/src/utils/filename.js for the live preview
│   ├── consent.ts             analytics consent storage + the events the banner and footer use
│   ├── format.ts, messages.ts
│   ├── gsap.ts                plugin registration + reduced-motion queries
│   └── confetti.ts
└── pages/                     Landing, Login, Plans, Onboarding, Connect, Dashboard, ProcessEditor;
                               legal/ Privacy, Terms, Refunds, Cookies, DataDeletion (+ LegalPage layout)

supabase/migrations/           0001_init.sql, 0002_work_processes.sql, 0003_cleanup.sql, 0004_documents.sql (source of truth)
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
  - The new backend calls `usage_snapshot`, `complete_processed_file_v2` and `grant_credits`, and `schemaProblem()` logs loudly if 0004 is missing.
  - Drop the v1 functions only in a later migration, after the cleanup release.
  - The frontend's `api.ts` normalizes old API responses (missing `kind`, family, document usage) because Vercel usually finishes deploying before DigitalOcean. Don't remove those normalizers.
  - Failed files are never charged, so there are no refunds, and a taken-over claim can't be charged twice.
  - A run reads remaining credits once. Each file **reserves** one before its first `await`, and the reservation is released on every outcome that wasn't charged (skipped, claim lost, failed), so concurrent workers can never dispatch more files than there are credits. Deploy overlap is the only thing that produces `overage`.
- **Several AI workers per process, one run per user.**
  - The per-user single slot (`inFlight`) still allows one sweep or "Organize now" at a time.
  - Inside a run, each process gets a manager (`runProcessQueue`). It de-duplicates files by id and runs them through a pool of `plan.aiPerProcess` workers.
  - Different processes run concurrently.
  - A server-wide FIFO semaphore (`MAX_CONCURRENT_AI_JOBS`, default 20) bounds simultaneous download+classify steps. It exists for memory, since each step holds an image buffer, and for the AI rate limit. It isn't fair across users (ponytail-noted).
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
- **Legal pages are code, and must match the code.** `/privacy`, `/terms`, `/refunds`, `/cookies` and `/data-deletion` describe exactly what the backend stores and does, including Google's required Limited Use sentence.
  - Change them when data handling, providers, storage keys or refund terms change.
  - The Google OAuth consent screen links to `/privacy` and `/terms`.
- **Vercel Analytics gets explicit `route`/`path` props and a `beforeSend` redactor** (`frontend/src/components/RouteAnalytics.tsx`). The script's auto-tracking only hooks `history.pushState`, so `<Navigate replace />` redirects — including login → dashboard — went uncounted. The redactor strips the hash and every query param except `utm_*`, because OAuth returns put Supabase tokens and `code`/`state` in the URL. Don't swap it for a bare `<Analytics />`. In dev, StrictMode logs the first view twice; production sends one.
- **Full `drive` scope is required**, not `drive.file` — the app must read files other people drop in the folder. This makes the app subject to Google restricted-scope verification and an annual CASA security assessment; see backend/README.md.
- **The frontend dev server uses `strictPort` on 5173.** Supabase's redirect allowlist names that origin, and silently drifting to 5174 used to break every API call with a bare "Failed to fetch". Dev CORS now tolerates other localhost ports too, but keep `strictPort` so there's one canonical dev origin.
- **`@gsap/react` doesn't revert between dependency changes by default.** Pass `revertOnUpdate: true` to `useGSAP` whenever a dependency-driven effect starts looping or stateful animations, or they stack up.
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
- the real SQL migrations in PGlite (charging, rollover, grants, plan ids, kind immutability). Everything else is verified with manual probes, curl and browser checks. Name new test files `*.test.js` under `backend/test/`; the script is scoped there so it never picks up `scripts/test-gemini.js`, which makes a real, billed AI call.

## API surface

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |
| POST | `/webhook/drive` | `X-Goog-Channel-Token` shared secret |
| POST | `/api/auth/google/start` | Bearer (Supabase) |
| GET | `/api/auth/google/callback` | signed `state` param (parks the grant; stores nothing) |
| POST | `/api/auth/google/complete` | Bearer, must be the user who started the flow |
| DELETE | `/api/auth/google` | Bearer |
| GET | `/api/plans` | none |
| GET/POST | `/api/drive/folders` (`?q`, `?parentId`, `?pageToken`; POST creates a folder) | Bearer |
| GET | `/api/drive/folders/:id/path` | Bearer |
| GET/POST/DELETE | `/api/drive/watch` | Bearer |
| GET/POST | `/api/processes` (POST body requires `kind`: `image` \| `document`) | Bearer |
| GET | `/api/processes/status` | Bearer |
| GET/PUT/PATCH/DELETE | `/api/processes/:id` | Bearer |
| POST | `/api/processes/:id/organize` (402 `out_of_images` / `out_of_documents`) | Bearer |
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
