# DriveTag AI — Task List

Full scope, frontend + backend, tracked against the two SaaS loops in [CLAUDE.md](CLAUDE.md). Manual setup steps (Supabase, Google Cloud, secrets) live in [ForDev.md](ForDev.md).

**Where things stand:** the backend is built for Loops A and B. Remaining work is the frontend, payments, and running the whole thing against real credentials for the first time.

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
- [ ] Create the Supabase project and run the migration (ForDev.md §1–2)
- [ ] Configure Google OAuth consent screen + client (ForDev.md §3)
- [ ] Begin Google restricted-scope verification if launching publicly — long lead time

**Frontend**
- [x] Scaffold React + Vite app in `frontend/` (Vercel-ready, Root Directory `frontend`)
- [x] Supabase client + "Login with Google" flow
- [x] Auth session handling, protected routes/layout
- [ ] Connect-Drive step: call `/api/auth/google/start`, redirect to consent, handle the `?connected=1` / `?error=` return
- [ ] Google Picker API integration: pick Raw Assets folder, pick Destination folder
- [x] Onboarding flow: login → pick folders → confirm → trigger watch registration → success state
- [ ] Folder pickers backed by `GET /api/drive/folders`, saving via `POST /api/drive/config`
- [ ] Kick off `POST /api/drive/watch` to finish onboarding

## Phase 3 — Dashboard & Account Management (frontend)

- [x] Dashboard: show currently watched Raw folder + Destination folder
- [ ] Dashboard reading `GET /api/me` (connection, folders, watch status, subscription)
- [x] Settings: change folders, disconnect Drive, delete account
- [x] Activity view (optional): log of renamed/moved files — store only filenames/tags/timestamps in Supabase, never image bytes (Zero-Retention still applies to logs)
- [ ] Activity list from `GET /api/activity` (filenames + tags only)
- [x] Error/empty states (no folders configured yet, Drive disconnected, subscription inactive)
- [ ] Error/empty states: no folders yet, Drive disconnected, watch expired, trial ended

## Phase 4 — Payments (Lemon Squeezy or Paddle)

**Decision needed before starting:** Lemon Squeezy vs Paddle.

**Backend**
- [x] Provider-agnostic subscription gate (`isEntitled`) checked before any Gemini spend, failing closed
- [x] Trial row created on first Drive connect (`TRIAL_DAYS`) so onboarding works pre-billing
- [ ] Checkout/customer API integration for the chosen provider
- [ ] Webhook handler for subscription lifecycle events → update `subscriptions`
- [ ] Handle trial expiry → `expired`, and dunning/`past_due`

**Frontend**
- [ ] Pricing page
- [ ] Checkout redirect
- [ ] Billing portal link + subscription status in dashboard

## Phase 5 — Deployment & Launch

- [ ] Backend on DigitalOcean App Platform (Source Directory `/backend`, encrypted env vars)
- [ ] Frontend on Vercel (Root Directory `frontend`)
- [ ] Production `GOOGLE_OAUTH_REDIRECT_URI` + `DRIVE_WEBHOOK_URL`; re-register watch channels after cutover
- [ ] Custom domain + HTTPS on both
- [ ] `helmet` + rate limiting on public endpoints (exclude `/webhook/drive` — Google bursts)
- [ ] Error monitoring beyond stdout logs (e.g. Sentry)
- [ ] Landing page copy — lead with Zero-Retention, it's the trust pitch for a tool touching client assets
- [ ] Terms of Service + Privacy Policy reflecting Zero-Retention, required for Google verification anyway

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
- [ ] Pricing model — per seat, per folder, or per image processed
