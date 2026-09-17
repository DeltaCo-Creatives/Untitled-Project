# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DriveTag AI is a B2B micro-SaaS that automatically organizes visual assets for creative agencies and freelancers.

**Core mechanism:** the app listens for Google Drive webhooks fired when an image is dropped into a specific "Raw" folder, temporarily ingests the image into memory, sends it to the Gemini Flash API for visual classification, then renames and moves the file in Google Drive based on the AI's returned tags.

**Security posture — "Zero-Retention":** user images must never be persisted to the database or any third-party storage bucket. Images are processed in memory only and discarded immediately after the Drive rename/move completes. Any code path that writes an incoming image to disk, a database, or a storage bucket violates this design and should be flagged. Note this is also why Gemini is called with inline image data rather than the Files API, which would retain the upload.

## Current State

**[Handover.md](Handover.md) is the authoritative snapshot of current state and next steps — read it before starting work, and update it when state changes.** In brief:

- **Backend:** complete for Loops A and B — Drive OAuth, folder config, watch-channel lifecycle, the change-feed sweep, Gemini classification, and rename/move are all wired together. It also has a polling fallback for local dev and "Organize now" for images already in Raw. The full Drive loop has never run against a real Drive: no account has connected Drive yet.
- **Frontend:** React 19 + Vite + Tailwind with real Supabase Google login and every screen backed by the API (`src/lib/api.ts`). Pages: Landing `/`, `/login`, and protected `/onboarding`, `/dashboard`, `/connect`. The whole UI uses a pastel "Lavender garden" design system and GSAP animation throughout. Real sign-in works; the full Drive loop (connect → watch → drop image → renamed) hasn't been run yet.
- **Credentials:** accounts were set up and live-verified in a *different* working copy. `.env` files are gitignored and don't travel through git, so a given checkout may have blank credentials — `npm run dev` names what's missing. Both `.env.example` templates were deleted in commit `0bdd63d`; [tutorial.md](tutorial.md) lists every variable.
- **Not built:** the payment-provider webhook (Lemon Squeezy vs Paddle undecided; the subscription gate it feeds exists).
- **Production:** deployed from `production`. The frontend is on Vercel at `drivetag-ai.com`, the backend on DigitalOcean at `api.drivetag-ai.com` (`/health` 200). Login was broken on 2026-09-17 by three missing pieces: the Vercel SPA rewrite, `VITE_API_URL` on Vercel, and the Supabase Site URL/redirect allowlist, which still said `localhost:5173`. The code side is fixed; the dashboard steps are in [domainguide.md](domainguide.md) §2–§7.

Other docs: [task.md](task.md) (scope checklist), [ForDev.md](ForDev.md) (setup runbook + SQL), [tutorial.md](tutorial.md) (per-credential guide). Keep them current when setup changes.

## Tech Stack & Hosting

- **Frontend:** React 19 + Vite + Tailwind 4 + react-router, TypeScript. Hosted on Vercel (Root Directory: `frontend`) at `drivetag-ai.com`. Lint via `oxlint`. Visitor analytics via `@vercel/analytics` in `src/components/RouteAnalytics.tsx`.
  - **Deploy requirements:**
    - `frontend/vercel.json` rewrites every path to `index.html`; without it every client route 404s on Vercel.
    - `vite build` refuses to run unless `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` are set. They're baked in at build time, so changing them on Vercel needs a redeploy.
    - Supabase auth uses the PKCE flow (`src/lib/supabase.ts`).
  - **Styling:** design tokens live in `src/index.css` `@theme` (`canvas`, `ink`, `lavender`, `periwinkle`, `butter`, `sage`, `rose` + `-soft` tints). Use those rather than raw Tailwind palette colors. Fonts: Fredoka (headings) and Nunito (body).
  - **Animation:** GSAP. Import it from `src/lib/gsap.ts`, which registers plugins once — not from `gsap` directly. Use `useGSAP`, and gate motion behind `gsap.matchMedia()` with `MOTION_OK` / `REDUCED_MOTION`. Project GSAP skills live in `.claude/skills/`.
- **Backend:** Node.js + Express 5 (ESM). Hosted on DigitalOcean App Platform (Source Directory: `/backend`) at `api.drivetag-ai.com`. Must run with `NODE_ENV=production` there, which locks CORS and turns on in-process channel renewal. At boot it logs `"Production config problem"` for any localhost or placeholder URL env var.
- **Database & Auth:** Supabase (PostgreSQL), project `ckskwjtjydaqewwojsfj` — Google login for identity, plus all app tables.
- **AI Engine:** Gemini Flash via `@google/genai`, with a `responseSchema` for strict JSON. Default model `gemini-3.6-flash` — Google retired `gemini-2.5-flash` for new users, and a stale `GEMINI_MODEL` in a local `.env` overrides the default.
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
│   ├── lib/supabase.js        service-role client (bypasses RLS — server only)
│   ├── middleware/            requireAuth (Supabase token), errorHandler
│   ├── routes/
│   │   ├── driveWebhook.routes.js  POST /webhook/drive
│   │   ├── auth.routes.js          Drive OAuth start/callback/disconnect
│   │   ├── drive.routes.js         folder listing, config, watch lifecycle
│   │   └── account.routes.js       /api/me, /api/activity
│   ├── services/
│   │   ├── googleAuth.service.js   OAuth client, consent URL, token exchange
│   │   ├── drive.service.js        file bytes, rename/move, changes feed
│   │   ├── driveWatch.service.js   channel start/stop/renew
│   │   ├── gemini.service.js       classifyImage() → {genre, subject, style}
│   │   ├── pipeline.service.js     Loop B sweeps, Organize now, Raw folder status
│   │   └── autoSync.service.js     polling fallback for channels Google won't push to
│   ├── repositories/          one module per table, all Supabase access
│   └── utils/                 logger (redacting), crypto (AES-GCM + HMAC state), filename, origins, serialize
└── scripts/
    ├── test-gemini.js         standalone Gemini probe
    ├── renew-channels.js      cron entrypoint for channel renewal
    └── get-token.js           mint a Supabase access token for curl testing

frontend/vercel.json           SPA rewrite (all paths → index.html)
frontend/src/
├── App.tsx                    routes: / (Landing), /login, /onboarding + /dashboard + /connect (protected)
├── index.css                  Tailwind @theme design tokens
├── contexts/AuthContext.tsx   Supabase session + Google sign-in
├── components/
│   ├── ProtectedRoute.tsx
│   ├── RouteAnalytics.tsx     Vercel Analytics + URL redaction
│   ├── TagFlowIllustration.tsx, MemoryDemo.tsx   animated marketing illustrations
│   └── ui/                    Button, Card, Logo, Skeleton, AnimatedNumber, BlobBackground
├── hooks/                     usePressMotion, useReveal
├── lib/
│   ├── supabase.ts            anon-key client
│   ├── api.ts                 typed backend client (Bearer token, readable network/CORS errors)
│   ├── gsap.ts                plugin registration + reduced-motion queries
│   └── confetti.ts
└── pages/                     Landing, Login, Onboarding, Connect, Dashboard

supabase/migrations/0001_init.sql   schema + RLS (source of truth), at the repo root
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
  - `recordResult`/`recordFailure` only write while that token still owns the row, so a stalled worker can't overwrite or re-move a file someone else took over.
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
- **The changes feed never reports files that were already in Raw.** `POST /api/drive/organize` lists the Raw folder directly and runs the same `processFile`. It only starts on an explicit click, so existing client files are never moved without consent. Passing `retryFailed: true` frees `failed` claims first.
- **Folder config is camelCase on the wire.** Repositories return snake_case rows; routes pass `folder_configs` through `utils/serialize.js`. Activity rows stay snake_case, and the frontend types match that.
- **Drive-connect returns to the origin that started it.** `POST /api/auth/google/start` signs the request's `Origin` into the OAuth `state`, provided `utils/origins.js` allows it, and the callback redirects there. Dev CORS allows any `localhost` port; production uses `CORS_ORIGINS` only, so `NODE_ENV=production` must be set when deployed.
- **The webhook acks before processing.** Google retries on non-2xx and expects a fast response, so the sweep runs in `setImmediate` after `res.sendStatus(200)`.
- **The subscription gate fails closed** and is checked before any Gemini spend. A trial row is created on first Drive connect so onboarding works pre-billing.
- **Vercel Analytics gets explicit `route`/`path` props and a `beforeSend` redactor** (`frontend/src/components/RouteAnalytics.tsx`). The script's auto-tracking only hooks `history.pushState`, so `<Navigate replace />` redirects — including login → dashboard — went uncounted. The redactor strips the hash and every query param except `utm_*`, because OAuth returns put Supabase tokens and `code`/`state` in the URL. Don't swap it for a bare `<Analytics />`. In dev, StrictMode logs the first view twice; production sends one.
- **Full `drive` scope is required**, not `drive.file` — the app must read files other people drop in the folder. This makes the app subject to Google restricted-scope verification; see the warning in ForDev.md.
- **The frontend dev server uses `strictPort` on 5173.** Supabase's redirect allowlist names that origin, and silently drifting to 5174 used to break every API call with a bare "Failed to fetch". Dev CORS now tolerates other localhost ports too, but keep `strictPort` so there's one canonical dev origin.
- **`@gsap/react` doesn't revert between dependency changes by default.** Pass `revertOnUpdate: true` to `useGSAP` whenever a dependency-driven effect starts looping or stateful animations, or they stack up.
- **The Drive webhook needs a Google-verified domain.** Drive refuses to register a watch on an address whose domain isn't verified in the Cloud project, so free ngrok URLs and `*.ondigitalocean.app` can't receive notifications. Production is planned as `api.drivetag-ai.com`.

## Commands

All commands run from `backend/`:

```bash
npm install                    # install dependencies
npm run dev                    # start with nodemon (auto-reload)
npm start                      # start without auto-reload
npm run test:gemini [path]     # classify a local image, print tags + target filename
npm run renew:channels         # renew expiring Drive watch channels now (production also does this hourly in-process)
npm run token -- <email> <pw>  # mint a Supabase access token for curling the authed routes
```

From `frontend/`: `npm run dev` (Vite, port 5173), `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint), `npm run preview` (serve the production build). `.claude/launch.json` defines the dev server and production preview as preview-server configs.

`npm run test:gemini` and `npm run token` need only their own vars; the server needs the full `backend/.env` and refuses to boot, naming the missing variables, when it's incomplete. The variable list lives in [tutorial.md](tutorial.md). There is no automated test suite — verification so far is manual probes, curl against a running server, and browser checks.

## API surface

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | none |
| POST | `/webhook/drive` | `X-Goog-Channel-Token` shared secret |
| POST | `/api/auth/google/start` | Bearer (Supabase) |
| GET | `/api/auth/google/callback` | signed `state` param |
| DELETE | `/api/auth/google` | Bearer |
| GET | `/api/drive/folders` | Bearer |
| GET/POST | `/api/drive/config` | Bearer |
| GET/POST/DELETE | `/api/drive/watch` | Bearer |
| GET | `/api/drive/raw-status` | Bearer |
| POST | `/api/drive/organize` | Bearer |
| GET | `/api/me` | Bearer |
| GET | `/api/activity` | Bearer |

## Conventions

- ESM throughout (`"type": "module"`); use `node:` prefixes for builtins.
- Secrets come from `config/env.js`, never `process.env` at a call site.
- Log with `utils/logger.js` (structured JSON, auto-redacts token/secret/key fields) rather than `console.log`. Never log image bytes.
- Repositories throw on Supabase errors with a contextual message; routes let Express 5 forward rejections to `errorHandler`.
- Never paste or commit credentials. `.env` files are gitignored; production values go in DigitalOcean/Vercel encrypted env settings.
- `.claude/skills/gsap-*` are third-party files pinned by `skills-lock.json` — update with `npx skills update`, don't hand-edit.
