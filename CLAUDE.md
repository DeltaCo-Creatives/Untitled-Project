# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DriveTag AI is a B2B micro-SaaS that automatically organizes visual assets for creative agencies and freelancers.

**Core mechanism:** the app listens for Google Drive webhooks fired when an image is dropped into a specific "Raw" folder, temporarily ingests the image into memory, sends it to the Gemini Flash API for visual classification, then renames and moves the file in Google Drive based on the AI's returned tags.

**Security posture — "Zero-Retention":** user images must never be persisted to the database or any third-party storage bucket. Images are processed in memory only and discarded immediately after the Drive rename/move completes. Any code path that writes an incoming image to disk, a database, or a storage bucket violates this design and should be flagged. Note this is also why Gemini is called with inline image data rather than the Files API, which would retain the upload.

## Current State

The backend is complete for Loops A and B: Drive OAuth, folder config, watch-channel lifecycle, the change-feed sweep, Gemini classification, and rename/move all exist and are wired together.

The frontend exists as a React 19 + Vite + Tailwind shell (`Login`, `Onboarding`, `Dashboard` pages, `AuthContext`, `ProtectedRoute`, Supabase client) but **makes no calls to the backend** — there is no `VITE_API_URL` and no `fetch` against `/api/*`. Wiring those two halves together is the largest open task; don't assume a screen works just because it renders.

Also not built: the payment-provider webhook, pending the Lemon Squeezy vs Paddle decision (the subscription gate it feeds is already in place).

Nothing has been run against real Google/Supabase credentials yet — [ForDev.md](ForDev.md) is the ordered setup runbook and [tutorial.md](tutorial.md) covers how to obtain each individual credential — keep both current when setup changes. See [task.md](task.md) for remaining scope.

## Tech Stack & Hosting

- **Frontend:** React 19 + Vite + Tailwind 4 + react-router, TypeScript. Hosted on Vercel (Root Directory: `frontend`). UI shell only — not yet calling the API. Lint via `oxlint`.
- **Backend:** Node.js + Express 5 (ESM). Hosted on DigitalOcean App Platform (Source Directory: `/backend`).
- **Database & Auth:** Supabase (PostgreSQL) — Google login for identity, plus all app tables.
- **AI Engine:** Gemini Flash via `@google/genai`, with a `responseSchema` for strict JSON.
- **Google Drive:** `googleapis` SDK.
- **Payments:** Lemon Squeezy or Paddle (Merchant of Record). *Not integrated yet.*

Both `frontend/` and `backend/` deploy from the same GitHub repo/branch (`production`) — do not split them into separate repos or branches.

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
│   │   └── pipeline.service.js     Loop B orchestration
│   ├── repositories/          one module per table, all Supabase access
│   └── utils/                 logger (redacting), crypto (AES-GCM + HMAC state), filename
├── scripts/
│   ├── test-gemini.js         standalone Gemini probe
│   └── renew-channels.js      cron entrypoint for channel renewal
└── supabase/migrations/0001_init.sql   schema + RLS (source of truth)
```

Layering is strict: routes handle HTTP, services own external APIs and orchestration, repositories own all Supabase queries. Routes should not query Supabase directly.

### Non-obvious design decisions

These were deliberate and are easy to "fix" wrongly:

- **We watch the user's changes feed, not the Raw folder.** Drive's per-file watch on a folder does not reliably fire for files added inside it. So `changes.watch` + `changes.list(pageToken)` is used, filtered to the Raw folder. This is why `drive_channels.page_token` exists and must be advanced after every sweep.
- **Drive authorization is a separate OAuth grant from Supabase login.** The pipeline runs while the user is absent, so it needs its own offline refresh token; Supabase does not durably hand one over. `/api/auth/google/*` implements that flow, with a signed+expiring `state` param instead of a session cookie.
- **Env loading is centralized in `config/env.js`, which calls `dotenv.config()` in its own module body.** ESM hoists imports, so calling `dotenv.config()` in an entrypoint body runs *after* imported modules have already read `process.env`. For the same reason `server.js` validates env and then `await import()`s the app — otherwise Supabase's constructor throws before the readable "you forgot these vars" error.
- **Idempotency lives in the database.** `processed_files` has `unique (user_id, file_id)`; claiming a file before processing is what makes Drive's duplicate/retried notifications safe. The in-memory `inFlight` set in the pipeline is only a cost optimization, not the correctness guarantee.
- **The webhook acks before processing.** Google retries on non-2xx and expects a fast response, so the sweep runs in `setImmediate` after `res.sendStatus(200)`.
- **The subscription gate fails closed** and is checked before any Gemini spend. A trial row is created on first Drive connect so onboarding works pre-billing.
- **Full `drive` scope is required**, not `drive.file` — the app must read files other people drop in the folder. This makes the app subject to Google restricted-scope verification; see the warning in ForDev.md.

## Commands

All commands run from `backend/`:

```bash
npm install                    # install dependencies
npm run dev                    # start with nodemon (auto-reload)
npm start                      # start without auto-reload
npm run test:gemini [path]     # classify a local image, print tags + target filename
npm run renew:channels         # renew expiring Drive watch channels (run hourly in prod)
```

Plus `npm run token -- <email> <password>` to mint a Supabase access token for curling the authed routes.

From `frontend/`: `npm run dev` (Vite), `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint).

`npm run test:gemini` and `npm run token` need only their own vars; the server needs the full `.env`. Requirements are listed in `backend/.env.example` and explained in ForDev.md. There is no automated test suite yet — verification so far is the manual probes above plus curl against a running server.

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
| GET | `/api/me` | Bearer |
| GET | `/api/activity` | Bearer |

## Conventions

- ESM throughout (`"type": "module"`); use `node:` prefixes for builtins.
- Secrets come from `config/env.js`, never `process.env` at a call site.
- Log with `utils/logger.js` (structured JSON, auto-redacts token/secret/key fields) rather than `console.log`. Never log image bytes.
- Repositories throw on Supabase errors with a contextual message; routes let Express 5 forward rejections to `errorHandler`.
