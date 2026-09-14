# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DriveTag AI is a B2B micro-SaaS that automatically organizes visual assets for creative agencies and freelancers.

**Core mechanism:** the app listens for Google Drive webhooks fired when an image is dropped into a specific "Raw" folder, temporarily ingests the image into memory, sends it to the Gemini Flash API for visual classification, then renames and moves the file in Google Drive based on the AI's returned tags.

**Security posture — "Zero-Retention":** user images must never be persisted to the database or any third-party storage bucket. Images are processed in memory only and discarded immediately after the Drive rename/move completes. Any code path that writes an incoming image to disk, a database, or a storage bucket violates this design and should be flagged.

## Current State

Only the backend's Drive-webhook receiver and Gemini classification call are built and proven. **No auth, no Supabase, no frontend UI, and no live Drive `watch()` channel registration exist yet** — those come after this core loop is validated. `frontend/` is an empty placeholder (see [frontend/README.md](frontend/README.md)).

## Tech Stack & Hosting

- **Frontend:** React + Vite. Hosted on Vercel (Root Directory: `frontend`). *Not built yet.*
- **Backend:** Node.js + Express (ESM). Hosted on DigitalOcean App Platform (Source Directory: `/backend`).
- **Database & Auth:** Supabase (PostgreSQL) — will handle Google OAuth login and store subscription state/folder IDs. *Not integrated yet.*
- **AI Engine:** Gemini Flash API via the `@google/genai` SDK (Google AI Studio key).
- **Payments:** Lemon Squeezy or Paddle (Merchant of Record). *Not integrated yet.*

Both `frontend/` and `backend/` deploy from the same GitHub repo/branch (`main`) — do not split them into separate repos or branches.

## Core SaaS Loops

**Loop A — Onboarding & Auth** *(not implemented yet)*: Google login via Supabase → request Drive OAuth scopes → user picks a "Raw Assets" folder and a "Destination" folder.

**Loop B — Webhook & AI pipeline** *(the part currently being built)*:
1. Drive sends a push notification (POST, empty body, `X-Goog-*` headers) to the backend when a file lands in "Raw Assets".
2. Backend validates the notification and fetches the file buffer via the Drive API, in memory.
3. Backend sends the image buffer + system prompt to Gemini.
4. Gemini returns strict JSON: `{"genre": "...", "subject": "...", "style": "..."}`.
5. Backend renames the file (e.g. `genre_subject.jpg`) and moves it to the Destination folder via the Drive API.

Steps 1 and 3–4 are implemented; step 2 (real Drive file fetch) and step 5 (rename/move) are not — they depend on Loop A's OAuth credentials.

## Architecture

```
DriveTagAI/
├── frontend/                        placeholder only — React/Vite not scaffolded
├── backend/
│   ├── server.js                    Express entrypoint; mounts routes, /health check
│   ├── src/
│   │   ├── routes/
│   │   │   └── driveWebhook.routes.js   POST /webhook/drive — validates X-Goog-Channel-Token, logs the notification, acks 200
│   │   └── services/
│   │       └── gemini.service.js        classifyImage(buffer, mimeType) → {genre, subject, style} via Gemini
│   ├── scripts/
│   │   └── test-gemini.js           standalone Gemini pipeline test (npm run test:gemini)
│   ├── test-assets/                 drop a sample.jpg here for realistic test-gemini runs (gitignored)
│   └── .env.example
├── .gitignore
└── README.md                        quickstart + ngrok webhook testing walkthrough
```

- `backend/api` from the original blueprint is realized as `backend/src/routes` + `backend/src/services` — routes handle HTTP concerns, services own the external API integrations (Gemini today; Drive file-fetch/rename-move will follow the same pattern).
- The backend is the only component that should ever touch raw image bytes or Google Drive credentials; the frontend (once built) is a management/config UI and should not handle image data directly.
- Drive webhook auth is a shared-secret check today (`GOOGLE_DRIVE_WEBHOOK_TOKEN` compared against the `X-Goog-Channel-Token` header) — this is separate from and simpler than the Loop A user-facing OAuth that will come later.

## Commands

All commands run from `backend/`:

```bash
npm install              # install dependencies
npm run dev               # start Express with nodemon (auto-reload), reads .env (PORT defaults to 3001)
npm start                 # start Express without auto-reload
npm run test:gemini [path]  # send a local image (default: test-assets/sample.jpg, falls back to a placeholder pixel) to Gemini and print the {genre, subject, style} result
```

Requires `backend/.env` (copy from `.env.example`): `GEMINI_API_KEY` (from Google AI Studio), `GOOGLE_DRIVE_WEBHOOK_TOKEN` (self-chosen shared secret), optional `GEMINI_MODEL` override (defaults to `gemini-2.5-flash`) and `PORT`.

See [README.md](README.md) for the full ngrok-based walkthrough for exercising `POST /webhook/drive` locally.

There is no frontend build/lint/test yet, and no automated test suite for the backend beyond the manual Gemini script above — add real tests as the backend grows past this initial proof-of-concept stage.
