# DriveTag AI — Task List

Full scope, frontend + backend, tracked against the two SaaS loops in [CLAUDE.md](CLAUDE.md). Manual setup steps (Supabase, Google Cloud, secrets) live in [ForDev.md](ForDev.md). Current state and next steps: [Handover.md](Handover.md).

**Where things stand:** the backend is built for Loops A and B. The frontend is a designed UI shell with **mocked authentication** and no backend calls. Supabase, the Google OAuth client, Gemini and Supabase's Google login were set up and live-verified in one environment — `.env` files don't sync, so other working copies need them copied over. `drivetag-ai.com` is purchased. Remaining work: make frontend auth real, wire the two halves together, wire the domain and deploy, payments, and a first full Drive loop.

## Environment & housekeeping

- [ ] Copy `backend/.env` and `frontend/.env` to every working copy — setup was done in one environment only, and all copies must share one `TOKEN_ENCRYPTION_KEY`
- [ ] Restore `backend/.env.example` and `frontend/.env.example` (deleted in `0bdd63d`), and fix the `config/env.js` error message that still points to it
- [ ] Change any local `GEMINI_MODEL=gemini-2.5-flash` (retired) to the new default `gemini-3.6-flash`
- [ ] Reset the Supabase Postgres password; rotate the Gemini key if it's the one pasted into chat
- [ ] Untrack `.claude/settings.local.json` (a personal settings file) and delete the stale local `prod` branch
- [x] GSAP agent skills installed in `.claude/skills/`, pinned by `skills-lock.json`

## Phase 0 — Core Webhook + AI Loop (backend)

- [x] Express server scaffold, split into `server.js` + `src/app.js`
- [x] `POST /webhook/drive` with timing-safe shared-secret validation, fast ack, async sweep
- [x] Gemini classification service with strict `responseSchema` → `{genre, subject, style}`
- [x] Manual test script (`npm run test:gemini`)
- [x] Centralized env config with fail-fast validation
- [x] Structured redacting logger + central error handler
- [x] Idempotency guard — `processed_files` unique `(user_id, file_id)` claim before processing
- [x] Per-file error isolation so one bad image doesn't abort a sweep
- [x] Image size ceiling (skips files too large for an inline Gemini request)
- [x] Gemini classification live-verified — with a 1×1 placeholder image only; retest with a real photo
- [ ] First real end-to-end run against live Google + Supabase credentials (follow ForDev.md)

## Phase 1 — Google Drive integration (backend)

- [x] `drive.service.js` — fetch file bytes into memory (`alt=media`, never touches disk)
- [x] `drive.service.js` — rename + move (`files.update` with `addParents`/`removeParents`)
- [x] `drive.service.js` — changes feed (`getStartPageToken`, `changes.list`)
- [x] `pipeline.service.js` — notification → changes sweep → filter to Raw folder → classify → rename/move → record
- [x] Watch channel registration storing `channelId`/`resourceId`/`pageToken`/`expiresAt`
- [x] Channel renewal driven by the Drive-issued expiration (`npm run renew:channels`)
- [x] `resourceState: sync` treated as a no-op
- [x] Map incoming webhook → user via `channel_id` lookup
- [ ] Schedule the renewal job in production (GitHub Actions cron or a worker component — see ForDev.md §9). Channels lapse silently, so this is required before real users.
- [ ] Shared Drive support (currently `restrictToMyDrive`, My Drive only)

## Phase 2 — Auth & Onboarding (Loop A)

**Backend**
- [x] Supabase service-role client + repository layer per table
- [x] Schema with RLS: `google_credentials`, `folder_configs`, `drive_channels`, `processed_files`, `subscriptions` (`supabase/migrations/0001_init.sql`)
- [x] `requireAuth` middleware validating Supabase access tokens
- [x] Dedicated Drive OAuth flow (offline refresh token) with signed, expiring `state`
- [x] Refresh tokens encrypted at rest (AES-256-GCM) in a table with no client-readable policy
- [x] `GET /api/drive/folders` — folder listing for the onboarding picker
- [x] `GET/POST /api/drive/config` — save Raw/Destination folders, validated against Drive
- [x] `POST/DELETE /api/drive/watch` — start/stop watching
- [x] `DELETE /api/auth/google` — disconnect: stop watch, revoke at Google, delete credentials
- [x] `GET /api/me` and `GET /api/activity` for the dashboard
- [x] Create the Supabase project and run the migration (ForDev.md §1–2) — all tables live-verified
- [x] Google OAuth client with localhost + Supabase redirect URIs (ForDev.md §3)
- [x] Supabase Google login provider + URL configuration, live-verified at protocol level (ForDev.md §3b)
- [ ] Confirm the consent screen's test-user list by completing a real login
- [ ] Begin Google restricted-scope verification if launching publicly — long lead time

**Frontend** — the UI shell is built, but **auth is mocked and nothing calls the backend**
- [x] Scaffold React 19 + Vite + Tailwind 4 in `frontend/` (Vercel-ready, Root Directory `frontend`)
- [x] Supabase client module, `AuthContext`, `ProtectedRoute`, routing
- [x] Login, Onboarding (3-step) and Dashboard screens designed
- [ ] **Replace the dummy auth in `AuthContext.signInWithGoogle`** — it fabricates a fake user with `access_token: 'dummy-token'` instead of calling `supabase.auth.signInWithOAuth({ provider: 'google' })`. The backend rejects that token with 401, so nothing works until this is real.
- [ ] Add `VITE_API_URL` plus an API helper that sends `Authorization: Bearer <supabase access token>`
- [ ] Connect-Drive step: `POST /api/auth/google/start`, redirect to consent, handle `?connected=1` / `?error=` on return
- [ ] Folder pickers backed by `GET /api/drive/folders`, saved via `POST /api/drive/config` — replaces the local-state-only selection in `Onboarding.tsx`, which still has a `TODO` where the API call belongs
- [ ] Kick off `POST /api/drive/watch` to finish onboarding

## Phase 3 — Dashboard & Account Management (frontend)

The screens exist as static UI. None of them read real data yet.

- [x] Dashboard, settings and activity screens designed, including empty/error states
- [x] `gsap` + `@gsap/react` installed for UI animation (not used yet)
- [ ] Dashboard reading `GET /api/me` (connection, folders, watch status, subscription)
- [ ] Activity list from `GET /api/activity` (filenames + tags only)
- [ ] Settings actions wired: change folders, disconnect Drive (`DELETE /api/auth/google`), delete account
- [ ] Empty/error states driven by real state rather than placeholders

## Phase 3b — AI work processes

- [x] Schema: `work_processes`, `process_destinations`, usage counters, `image_credit_grants` + SQL functions (`supabase/migrations/0002_work_processes.sql`), tested in PGlite
- [x] Several processes per user: Raw → Master → AI-chosen destinations, "Unsorted" fallback, one Drive watch for all
- [x] Per-process naming templates (`{destination}_{subject}_{date}`…, shared vectors in `tests/filename-vectors.json`), custom tag fields, AI instructions
- [x] Dynamic Gemini schema per process (destination enum), output validation, loop guard between processes
- [x] Folder browser with breadcrumbs, search and "New folder"; destinations created inside Master
- [x] Process editor, onboarding for the first process, dashboard per-process cards with Organize now / Retry / on-off
- [ ] Run `0002` on production, deploy backend then frontend, smoke-test with a real Drive (Handover.md)
- [ ] Cleanup release: remove legacy `/api/drive/config` endpoints and `/api/me` fields, then run `0003_cleanup.sql`
- [ ] "Re-sort already-sorted images" action
- [ ] SVG/AVIF support (Gemini doesn't accept SVG inline; would need rasterizing in memory)

## Phase 4 — Payments (Lemon Squeezy or Paddle)

**Decision needed before starting:** Lemon Squeezy vs Paddle.

**Backend**
- [x] Plans in one config file (`backend/src/config/plans.js`): Free (1 process, 100 lifetime images), Creator (5, 1,000/mo), Studio (15, 5,000/mo), Enterprise (50, 25,000/mo, monthly only)
- [x] Usage metering charged atomically on success (`complete_processed_file`), top-up packs that never expire (`grant_image_credits`), plan gate failing closed before any Gemini spend
- [x] Owner SQL helpers to set plans and grant credits by hand (ForDev.md §2b)
- [ ] Checkout/customer API integration for the chosen provider
- [ ] Webhook handler: subscription lifecycle → `subscriptions.plan`/`status`/`period_anchor`; pack purchases → `grant_image_credits(..., 'purchase', provider_reference)`
- [ ] Dunning / `past_due` resolution (treated as paid until then)

**Frontend**
- [x] Pricing on the landing page and a `/plans` page (prices show "Coming soon")
- [x] Usage meter and upgrade prompts on the dashboard and in the editor
- [ ] Checkout redirect for plans and image packs
- [ ] Billing portal link

## Phase 5 — Deployment & Launch

- [ ] Backend on DigitalOcean App Platform (Source Directory `/backend`, encrypted env vars) — unconfirmed, no live URL recorded
- [ ] Frontend on Vercel (Root Directory `frontend`) — unconfirmed, no live URL recorded
- [ ] Production `GOOGLE_OAUTH_REDIRECT_URI` + `DRIVE_WEBHOOK_URL`; re-register watch channels after cutover ([domainguide.md](domainguide.md) §5–§6)
- [x] Domain purchased: `drivetag-ai.com` (Namecheap)
- [ ] DNS: `drivetag-ai.com` → Vercel, `api.drivetag-ai.com` → DigitalOcean, SSL auto-issued ([domainguide.md](domainguide.md) §1–§3)
- [ ] Verify the domain in Search Console + Cloud Console — unblocks Drive webhooks ([domainguide.md](domainguide.md) §4)
- [ ] `helmet` + rate limiting on public endpoints (exclude `/webhook/drive` — Google bursts)
- [ ] Error monitoring beyond stdout logs (e.g. Sentry)
- [ ] Landing page copy — lead with Zero-Retention, it's the trust pitch for a tool touching client assets
- [x] Vercel Web Analytics installed, tracking redirects, with OAuth credentials stripped from reported URLs
- [ ] Enable Analytics in the Vercel dashboard and redeploy
- [ ] Terms of Service + Privacy Policy reflecting Zero-Retention, required for Google verification anyway — disclose Vercel Analytics too

## Decisions resolved in code

Recorded so they aren't relitigated by accident — details in ForDev.md §12.

- Watch the **changes feed**, not the folder (Drive folder watches don't reliably fire for added children).
- Drive authorization is a **separate OAuth grant** from Supabase login, to get an offline refresh token.
- Activity history is kept, **metadata only** — needed for idempotency, stores no pixels.
- **Full `drive` scope** is required; `drive.file` cannot see files other people add.
- Duplicate output filenames are allowed; Drive keeps files distinct by ID.

## Open decisions

- [ ] Lemon Squeezy vs Paddle
- [ ] Whether to pursue Google restricted-scope verification (public launch) or stay on a test-user allowlist (design partners only)
- [x] Pricing model: tiers limit work processes and monthly images, plus one-time image packs (prices still to set in `backend/src/config/plans.js`)
- [ ] Prices for Creator, Studio, Enterprise and the image packs
