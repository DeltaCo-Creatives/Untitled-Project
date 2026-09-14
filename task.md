# DriveTag AI — Task List

Full scope, frontend + backend, tracked against the two SaaS loops in [CLAUDE.md](CLAUDE.md). Check items off as they land; keep this file in sync with `CLAUDE.md`'s "Current State" section when a phase completes.

## Phase 0 — Core Webhook + AI Loop (backend proof of concept)

- [x] Express server scaffold (`backend/server.js`)
- [x] `POST /webhook/drive` receiver with shared-secret validation (`backend/src/routes/driveWebhook.routes.js`)
- [x] Gemini classification service — `classifyImage()` returning strict `{genre, subject, style}` JSON (`backend/src/services/gemini.service.js`)
- [x] Manual test script (`npm run test:gemini`)
- [x] ngrok walkthrough for exercising the webhook locally
- [ ] Idempotency guard on the webhook (Drive can redeliver the same notification — dedupe by `resourceId` + `X-Goog-Message-Number` before processing)
- [ ] Structured error handling for Gemini failures (bad JSON, rate limit, timeout) — log and skip rather than crash the process

## Phase 1 — Google Drive integration (backend)

Depends on Phase 2 OAuth for real user credentials; build the plumbing first against a personal/service Drive account if needed to unblock.

- [ ] `drive.service.js`: fetch a file's bytes into memory by file ID (Drive API `files.get` with `alt=media`)
- [ ] `drive.service.js`: rename + move a file (`files.update` with `name` and `addParents`/`removeParents`)
- [ ] Wire the webhook handler: notification → look up owning user/folder config → fetch file → `classifyImage()` → rename/move → discard buffer (never touches disk, per Zero-Retention)
- [ ] Register a Drive `watch()` channel for a user's Raw Assets folder, store `channelId`/`resourceId`/`expiration` in Supabase
- [ ] Channel renewal job (Drive watch channels expire after ~7 days — needs a scheduled renewal before expiry)
- [ ] Handle `resourceState: sync` (initial channel-creation ping) as a no-op, only act on `update`/`add`
- [ ] Map an incoming webhook to the correct user by `channelId`/`resourceId` lookup in Supabase

## Phase 2 — Auth & Onboarding (Loop A)

**Backend**
- [ ] Create Supabase project (Postgres + Auth)
- [ ] Enable Google OAuth provider in Supabase, request Drive scopes (`drive.file` or narrower, scoped to user-selected folders — avoid full `drive` scope if possible)
- [ ] Schema: `users` (from Supabase auth), `folder_configs` (user_id, raw_folder_id, destination_folder_id), `drive_channels` (user_id, channel_id, resource_id, expires_at), `subscriptions` (user_id, status, plan, provider_customer_id)
- [ ] Express middleware to verify Supabase JWT on protected API routes
- [ ] Secure storage/refresh of Google OAuth refresh tokens (Supabase Vault or equivalent — never log or expose them)
- [ ] `POST /api/folders` — save the user's chosen Raw/Destination folder IDs
- [ ] `POST /api/drive/watch` — register the watch channel for the saved Raw folder (calls Phase 1 logic)
- [ ] `DELETE /api/drive/watch` — stop watching (disconnect flow)

**Frontend**
- [x] Scaffold React + Vite app in `frontend/` (Vercel-ready, Root Directory `frontend`)
- [x] Supabase client + "Login with Google" flow
- [x] Auth session handling, protected routes/layout
- [ ] Google Picker API integration: pick Raw Assets folder, pick Destination folder
- [x] Onboarding flow: login → pick folders → confirm → trigger watch registration → success state

## Phase 3 — Dashboard & Account Management (frontend)

- [x] Dashboard: show currently watched Raw folder + Destination folder
- [x] Settings: change folders, disconnect Drive, delete account
- [x] Activity view (optional): log of renamed/moved files — store only filenames/tags/timestamps in Supabase, never image bytes (Zero-Retention still applies to logs)
- [x] Error/empty states (no folders configured yet, Drive disconnected, subscription inactive)

## Phase 4 — Payments (Lemon Squeezy or Paddle)

**Decision needed:** pick Lemon Squeezy vs Paddle before starting this phase.

**Backend**
- [ ] Integrate chosen provider's checkout/customer API
- [ ] Webhook handler for subscription lifecycle events (created, renewed, cancelled, payment failed)
- [ ] Update `subscriptions` table on each event
- [ ] Gate the webhook/AI pipeline on active subscription status (stop processing for lapsed accounts)

**Frontend**
- [ ] Pricing page
- [ ] Checkout flow (redirect to hosted checkout)
- [ ] Billing management link (customer portal)
- [ ] Subscription status shown in dashboard

## Phase 5 — Deployment & Launch

- [ ] Backend: deploy to DigitalOcean App Platform (Source Directory `/backend`), set production env vars (`GEMINI_API_KEY`, `GOOGLE_DRIVE_WEBHOOK_TOKEN`, Supabase keys, payment provider keys)
- [ ] Frontend: deploy to Vercel (Root Directory `frontend`), set production env vars
- [ ] Register the production webhook URL with Google Drive `watch()` calls (replace ngrok)
- [ ] Custom domain + HTTPS on both frontend and backend
- [ ] Basic logging/monitoring on the backend (at minimum: structured logs for webhook receipts, Gemini calls, Drive API errors)
- [ ] Landing/marketing page copy — lead with the Zero-Retention security posture, it's the main trust pitch for a B2B tool touching client assets
- [ ] Terms of Service + Privacy Policy reflecting the Zero-Retention data handling
- [ ] Rate limiting / abuse protection on public-facing endpoints (`/webhook/drive`, auth endpoints)

## Open decisions

- [ ] Lemon Squeezy vs Paddle
- [ ] Exact Drive OAuth scope (narrow `drive.file` vs broader `drive`) — affects Google's app verification requirements
- [ ] Whether to keep any processing history/log at all, or truly log nothing beyond ephemeral console output
