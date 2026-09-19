# DriveTag AI — Task List

Full scope, frontend + backend, tracked against the two SaaS loops in [CLAUDE.md](CLAUDE.md). Manual setup steps (Supabase, Google Cloud, secrets) live in [ForDev.md](ForDev.md). Current state and next steps: [Handover.md](Handover.md).

**Last reconciled against the code:** 2026-09-19, at commit `3f4f554` on `production` / `production-vdsjba` (identical).

## Where things stand

**Both halves are built and wired together.** The backend runs Loops A and B end to end: Drive OAuth, work processes, watch channels, the changes-feed sweep, per-process Gemini routing, rename/move, and plan/credit metering. The frontend is a complete, API-backed app with real Supabase Google sign-in — not a shell, and not mocked.

What is left splits into three kinds of work:

1. **Operations you must do by hand** — run migration `0002` in Supabase, finish the Vercel/DigitalOcean/Supabase/Namecheap settings in [domainguide.md](domainguide.md), and do the first real end-to-end Drive run. No code involved.
2. **Features not built** — checkout and the payment webhook (provider undecided), `/privacy` and `/terms`, re-sorting already-sorted images.
3. **The cleanup release** — remove the legacy endpoints, then run `0003_cleanup.sql`.

**Status key:** `[x]` done · `[~]` in progress or partly done · `[ ]` not started.

---

## Working on now / next up

In the order Handover.md recommends:

1. `[ ]` Run `supabase/migrations/0002_work_processes.sql` in the Supabase SQL editor — **must happen before** the backend that needs it serves traffic (ForDev.md §2b)
2. `[ ]` Finish the dashboard settings that broke production login: Vercel `VITE_API_URL`, DigitalOcean `CORS_ORIGINS`/`FRONTEND_URL`/`GOOGLE_OAUTH_REDIRECT_URI`/`DRIVE_WEBHOOK_URL`, Supabase Site URL + redirect allowlist, Namecheap DNS (domainguide.md §2–§7)
3. `[ ]` First real end-to-end run on `https://drivetag-ai.com`: add destinations to a process, drop real images in Raw, confirm they're renamed, routed, and metered
4. `[ ]` Security follow-ups: reset the Supabase Postgres password, rotate the Gemini key if it's the one pasted into chat
5. `[ ]` Decide Lemon Squeezy vs Paddle, then build checkout and the webhook

## Environment & housekeeping

- `[ ]` Copy `backend/.env` and `frontend/.env` into every working copy — setup was done in one environment only, and all copies must share one `TOKEN_ENCRYPTION_KEY`. *(The current cloud checkout has neither file and no `node_modules`.)*
- `[ ]` Reset the Supabase Postgres password; rotate the Gemini key if it's the one pasted into chat
- `[ ]` Untrack `.claude/settings.local.json` — it's a personal settings file but is committed, and `.gitignore` has no `.claude` entry
- `[ ]` Rename `frontend/package.json` from the template's `temp-front`
- `[x]` `.env.example` templates deliberately **not** restored (deleted in `f018f23`); [tutorial.md](tutorial.md) is the variable list instead
- `[x]` `backend/src/config/env.js` no longer points at a nonexistent `.env.example` — it names tutorial.md
- `[x]` `GEMINI_MODEL` default is `gemini-3.6-flash` in `config/env.js`; a stale `gemini-2.5-flash` in a local `.env` still overrides it and will 404
- `[x]` GSAP agent skills installed in `.claude/skills/`, pinned by `skills-lock.json`
- `[x]` Stale local `prod` branch — not present in this checkout; delete it wherever it still exists

## Phase 0 — Core webhook + AI loop (backend)

- `[x]` Express 5 server scaffold, split into `server.js` + `src/app.js`
- `[x]` `POST /webhook/drive` with timing-safe shared-secret validation, fast ack, async sweep
- `[x]` Gemini classification with a strict `responseSchema`, now per-process (destination enum + custom tag fields)
- `[x]` Manual test script (`npm run test:gemini`, optionally `--process spec.json`)
- `[x]` Centralized env config with fail-fast validation, plus boot-time `"Production config problem"` warnings
- `[x]` Structured redacting logger + central error handler with `expose`-gated detail
- `[x]` Idempotency guard — `processed_files` unique `(user_id, file_id)`, claimed before processing
- `[x]` Claim fencing on `claimed_at`: a claim stuck >15 min is recoverable, and a stalled worker can't overwrite or re-move
- `[x]` Per-file error isolation so one bad image doesn't abort a sweep
- `[x]` Image size ceiling (`MAX_IMAGE_BYTES`, default 18 MB) so an oversized file never reaches an inline Gemini request
- `[x]` Timeouts on every Drive call (60s, 120s for downloads) and on Gemini (90s) — neither SDK has a default
- `[x]` Mid-sweep notifications set `rerunRequested` instead of being dropped
- `[x]` Gemini live-verified, including a prompt-injection image that was correctly ignored
- `[ ]` First real end-to-end run against live Google + Supabase (ForDev.md §8) — **never done**

## Phase 1 — Google Drive integration (backend)

- `[x]` `drive.service.js` — fetch file bytes into memory (`alt=media`, never touches disk)
- `[x]` `drive.service.js` — rename + move (`files.update` with `addParents`/`removeParents`)
- `[x]` `drive.service.js` — changes feed (`getStartPageToken`, `changes.list`), folder browse/search/create
- `[x]` `pipeline.service.js` — notification → sweep → match parent to a process's Raw folder → classify → rename/move → record and charge
- `[x]` Watch channel registration storing `channel_id` / `resource_id` / `page_token` / `expires_at`
- `[x]` Channels requested for 6 days rather than Google's 1-hour default
- `[x]` Renewal that opens the new channel from the stored page token **before** stopping the old one, so nothing queued is skipped
- `[x]` In-process hourly renewal when `NODE_ENV=production`, plus `npm run renew:channels` as a cron entrypoint
- `[x]` Per-user in-process lock over start/stop/renew/disconnect, so a pause can't race a renewal into a leaked channel
- `[x]` `disconnectDrive` revokes the refresh token at Google (`revokeToken`), fixing a bug where the grant stayed live
- `[x]` `resourceState: sync` treated as a no-op; incoming webhook mapped to a user via `channel_id`
- `[x]` Polling fallback (`AUTO_SYNC_INTERVAL_SECONDS`) reusing `drive_channels` with `resource_id = 'polling'`, for local dev and for production before the webhook domain is verified
- `[x]` Page token fast-forwarded when the user is out of credits or has no active processes, instead of accumulating a backlog
- `[ ]` Schedule renewal outside the app as a safety net (ForDev.md §9) — in-process renewal covers a single production instance, but only while it's up
- `[ ]` Shared Drive support — currently `restrictToMyDrive: true`, and shared-drive folders are rejected on save

## Phase 2 — Auth & onboarding (Loop A)

**Backend**

- `[x]` Supabase service-role client + one repository module per table
- `[x]` Schema with RLS: `google_credentials`, `folder_configs`, `drive_channels`, `processed_files`, `subscriptions` (`0001_init.sql`)
- `[x]` `requireAuth` middleware validating Supabase access tokens
- `[x]` Dedicated Drive OAuth flow (offline refresh token) with a signed, expiring `state`
- `[x]` Refresh tokens encrypted at rest (AES-256-GCM) in a table with no client-readable policy
- `[x]` **Account-linking hole closed:** the callback parks the grant instead of storing it, and only the signed-in user who started the flow can claim it via `POST /api/auth/google/complete`. Previously anyone could attach a victim's Drive to their own account
- `[x]` Drive-connect returns to the origin that started it, signed into the OAuth `state` and checked against `utils/origins.js`
- `[x]` Folder browser API: `GET/POST /api/drive/folders`, `GET /api/drive/folders/:id/path`
- `[x]` `GET/POST/DELETE /api/drive/watch`
- `[x]` `DELETE /api/auth/google` — stop watch, revoke at Google, delete credentials, in that order
- `[x]` `GET /api/me` and `GET /api/activity`
- `[x]` Supabase project created and `0001` run — all tables live-verified
- `[x]` Google OAuth client with localhost + Supabase redirect URIs
- `[x]` Supabase Google login provider + URL configuration, live-verified at protocol level
- `[x]` Real Google sign-in completed with more than one account
- `[ ]` Begin Google restricted-scope app verification, if launching publicly — long lead time

**Frontend** — all of this is built and calling the real API

- `[x]` React 19 + Vite + Tailwind 4 scaffold (Vercel-ready, Root Directory `frontend`)
- `[x]` Supabase client, `AuthContext`, `ProtectedRoute`, routing
- `[x]` **Real Google sign-in** — `supabase.auth.signInWithOAuth({ provider: 'google' })` over the PKCE flow. The old `dummy-token` login is gone
- `[x]` `VITE_API_URL` + typed API client sending `Authorization: Bearer <supabase access token>`, with readable network/CORS errors and field-level error details
- `[x]` Connect-Drive step: `POST /api/auth/google/start` → consent → `/connect?pending=` → `POST /api/auth/google/complete`
- `[x]` Folder pickers backed by the folder browser API, with breadcrumbs, search, paging and "New folder"
- `[x]` Onboarding creates the first work process and starts the watch, ending in a confetti burst
- `[x]` Landing, Login and Plans pages; pastel design system; GSAP animation throughout

## Phase 3 — Dashboard & account management (frontend)

- `[x]` Dashboard reading `GET /api/me` and `GET /api/processes/status`, polling via `useDashboardData` (3s while organizing, 30s idle)
- `[x]` Activity list from `GET /api/activity` with destination and custom-tag chips and a process filter
- `[x]` Per-process cards: Raw → Master → destination chips, waiting/failed counts, Organize now (with a confirm when images run short), Retry failed, on/off, locked badge
- `[x]` Usage meter and plan card; automatic-sorting switch; connection card with a disconnect confirm dialog
- `[x]` Empty, error and loading states driven by real state, including a "Try again" card for network/CORS failures
- `[x]` `ActivityEntry` typing fixed — it claimed `id` and `created_at`, which `listRecent` never selects; rows now key on `file_id`
- `[ ]` Delete-account action
- `[ ]` "At a glance" counts cover only the latest 50 activity rows (`ACTIVITY_LIMIT`), not all-time totals. The card says so; real totals would need a count endpoint

## Phase 3b — AI work processes

- `[x]` Schema: `work_processes`, `process_destinations`, usage counters, `image_credit_grants`, `schema_migrations` + SQL functions (`0002_work_processes.sql`), tested in PGlite
- `[x]` Several processes per user: Raw → Master → AI-chosen destinations, "Unsorted" fallback, one Drive watch serving all of them
- `[x]` Per-process naming templates (shared vectors in `tests/filename-vectors.json`, mirrored in `frontend/src/lib/filename.ts`), custom tag fields, AI instructions
- `[x]` Dynamic Gemini schema per process (destination enum), output validation, unknown keys falling back to Unsorted
- `[x]` Loop guard: rejected at save time (`processValidation.folderConflicts`) and again at runtime (`pipeline.resolveDestination`), so an image can never land back in any Raw folder
- `[x]` Multi-table writes through SQL functions (`save_work_process`) under a per-user advisory lock, since PostgREST has no transactions
- `[x]` Process editor, onboarding for the first process, dashboard per-process cards
- `[ ]` Run `0002` on production, then smoke-test with a real Drive (Handover.md ⚠️ 0)
- `[ ]` Cleanup release: remove the legacy `/api/drive/config`, `/raw-status` and `/organize` endpoints and the `/api/me` legacy fields, then run `0003_cleanup.sql` at least 24h later
- `[ ]` "Re-sort already-sorted images" action — a file is currently sorted automatically at most once
- `[ ]` SVG/AVIF support (Gemini won't take SVG inline; would need rasterizing in memory). GIF/TIFF and images over ~14 MB may also exceed what Gemini accepts inline
- `[ ]` Shared folders: a Raw folder from "Shared with me" isn't swept automatically, though "Organize now" still works

## Phase 4 — Payments (Lemon Squeezy or Paddle)

**Decision needed before starting:** Lemon Squeezy vs Paddle.

**Backend**

- `[x]` Plans in one config file (`backend/src/config/plans.js`): Free (1 process, 100 lifetime images), Creator (5, 1,000/mo), Studio (15, 5,000/mo), Enterprise (50, 25,000/mo, monthly only)
- `[x]` Usage metered atomically on success only (`complete_processed_file` charges free → monthly → top-up → overage in the same transaction that records the file)
- `[x]` Top-up packs that never expire (`grant_image_credits`), with a unique `provider_reference` so a future webhook can't grant twice
- `[x]` Plan gate fails closed, checked before any Gemini spend; a paid plan only counts while `active` or `past_due`
- `[x]` Owner SQL helpers to set plans and grant credits by hand (ForDev.md §2b)
- `[ ]` Checkout / customer API integration for the chosen provider
- `[ ]` Webhook handler: subscription lifecycle → `subscriptions.plan`/`status`/`period_anchor`; pack purchases → `grant_image_credits(..., 'purchase', provider_reference)`
- `[ ]` Dunning / `past_due` resolution (treated as paid until then)

**Frontend**

- `[x]` Pricing on the landing page and a `/plans` page; usage meter and upgrade prompts on the dashboard and in the editor
- `[ ]` Checkout redirect for plans and image packs
- `[ ]` Billing portal link
- `[ ]` Real `priceLabel` values in `plans.js` — every price is `null`, which renders as "Coming soon"

## Phase 5 — Deployment & launch

- `[~]` Backend on DigitalOcean App Platform (Source Directory `/backend`) — `579932a` was confirmed live on 2026-09-17, but its env vars still held localhost values, and nothing has been re-probed since
- `[~]` Frontend on Vercel (Root Directory `frontend`) — the 2026-09-17 build **failed** with `Missing VITE_API_URL for this build`, so the live site was still an old bundle
- `[x]` `frontend/vercel.json` SPA rewrite — without it every client route returns Vercel's 404
- `[x]` Build guards in `vite.config.ts`: a build without all three `VITE_*` vars fails, and a Vercel build pointing at localhost fails
- `[x]` Supabase auth on the PKCE flow, verified live (`code_challenge=s256`)
- `[x]` Domain purchased: `drivetag-ai.com` (Namecheap)
- `[ ]` DNS: `@` and `www` → Vercel (they still resolve to a Namecheap host, with a parking page on `www`); `api` → DigitalOcean is already correct (domainguide.md §2)
- `[ ]` Verify the domain in Search Console + Cloud Console — this is what unblocks Drive webhooks (domainguide.md §4)
- `[ ]` Production `GOOGLE_OAUTH_REDIRECT_URI` + `DRIVE_WEBHOOK_URL`, and re-register watch channels after cutover (domainguide.md §5–§6)
- `[ ]` Supabase Site URL + redirect allowlist — still `localhost:5173`, which is why production sign-ins landed there (domainguide.md §7)
- `[ ]` `helmet` + rate limiting on public endpoints (exclude `/webhook/drive` — Google bursts). Neither is installed today
- `[ ]` Error monitoring beyond stdout logs (e.g. Sentry)
- `[x]` Landing page copy leads with Zero-Retention
- `[x]` Vercel Web Analytics installed, tracking redirects, with OAuth credentials stripped from reported URLs
- `[ ]` Enable Analytics in the Vercel dashboard and redeploy
- `[ ]` Terms of Service + Privacy Policy pages, required for Google brand verification — disclose Vercel Analytics too
- `[ ]` Branded Google sign-in: Supabase custom domain `auth.drivetag-ai.com` + Google brand verification. The screen still says `ckskwjtjydaqewwojsfj.supabase.co` (domainguide.md §9)
- `[ ]` Automated test suite — there is none. Verification so far is manual probes, curl, browser checks, and scratch harnesses outside the repo

## Known single-instance limits

These live in process memory, so scaling DigitalOcean past one instance needs database-backed versions first:

- `[ ]` The per-user watch lock (`driveWatch.service.js`)
- `[ ]` The sweep slot (`inFlight`) and the rerun queue
- `[ ]` The per-process status cache
- `[ ]` The pending Drive-connect grants (a restart mid-connect means "try again")

## Decisions resolved in code

Recorded so they aren't relitigated by accident — the full list, with reasoning, is under "Non-obvious design decisions" in [CLAUDE.md](CLAUDE.md), and the operational version is in ForDev.md §12.

- Watch the **changes feed**, not the folder — Drive folder watches don't reliably fire for added children.
- Drive authorization is a **separate OAuth grant** from Supabase login, to get an offline refresh token.
- The OAuth callback **parks** the grant rather than storing it, to prevent account-linking attacks.
- Idempotency lives in the **database**, not in memory; the in-process `inFlight` set is only a cost optimization.
- Credits are charged **on success only, atomically** — so there are no refunds.
- Plan limits live **only** in `backend/src/config/plans.js` and are passed into SQL as arguments.
- Activity history is kept, **metadata only** — needed for idempotency, stores no pixels.
- **Full `drive` scope** is required; `drive.file` can't see files other people add.
- Duplicate output filenames are allowed; Drive keeps files distinct by ID.

## Open decisions

- `[ ]` Lemon Squeezy vs Paddle
- `[ ]` Prices for Creator, Studio, Enterprise and the three image packs
- `[ ]` Whether to pursue Google restricted-scope verification (public launch) or stay on a test-user allowlist (design partners only)
- `[x]` Pricing model: tiers limit work processes and monthly images, plus one-time image packs
