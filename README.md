# DriveTag AI

Automated visual-asset sorting for creative agencies and freelancers.

- **Work processes:** you set up AI work processes in Google Drive. Each watches a "Raw" folder and sorts new images into a Master folder's destination folders.
- **Routing:** you describe each destination, e.g. Logos: "brand marks, wordmarks, app icons". Gemini Flash picks the best fit for every image, and anything that fits none goes to Unsorted.
- **Naming and tags:** each image is renamed with your template (e.g. `logos_acme-wordmark_2026-09-17.png`) and tagged with your own fields.

Plans limit how many processes you can run and how many images are sorted: Free gives 100 images with no time limit.

**Zero-Retention:** images are processed in memory only — never written to disk, a database, or a storage bucket.

## Status

| Area | State |
|---|---|
| Backend | Built — Drive OAuth, work processes, watch channels, per-process Gemini routing, rename/move, plans and usage metering |
| Frontend | Built — Supabase login, onboarding, process editor with folder browser, dashboard, plans page |
| Accounts | Supabase, Google OAuth and Gemini set up in one environment; `.env` files must be copied to each machine |
| Domain | `drivetag-ai.com` purchased, not yet wired |
| Deployment | Not confirmed |
| Payments | Plans, limits and credits built; checkout provider not chosen (plans set by hand, see ForDev.md §2b) |

**For the full current state and what to do next, read [Handover.md](Handover.md).**

## Documentation

| Doc | Purpose |
|---|---|
| [Handover.md](Handover.md) | Current state, known issues, next steps — start here |
| [CLAUDE.md](CLAUDE.md) | Architecture, design decisions, conventions, API surface |
| [task.md](task.md) | Full scope checklist by phase |
| [ForDev.md](ForDev.md) | Ordered setup runbook, including the database SQL |
| [tutorial.md](tutorial.md) | How to obtain each credential, and every env var |
| [domainguide.md](domainguide.md) | Wiring `drivetag-ai.com` to Vercel, DigitalOcean and Google |
| [frontend/README.md](frontend/README.md) | Frontend specifics |

## Repository layout

```
backend/     Node.js + Express 5 API — deploys to DigitalOcean App Platform
frontend/    React 19 + Vite + Tailwind 4 — deploys to Vercel
supabase/    database migrations (schema + row-level security)
```

Both apps deploy from the `production` branch.

## Quickstart

Requires Node.js 18+.

### Backend

```bash
cd backend && npm install
```

Create `backend/.env`. There's no template file in the repo right now — every variable, where to get it, and which are secret is listed in [tutorial.md](tutorial.md). Then:

```bash
npm run dev
```

The server starts on `http://localhost:3001`. If any required variable is missing it refuses to start and names them.

```bash
curl -s http://localhost:3001/health
```

Expect `{"status":"ok"}`.

Useful backend scripts:

```bash
npm run test:gemini
```

Classifies `test-assets/sample.jpg` (or a placeholder pixel) and prints the tags plus the filename it would rename to. Needs only `GEMINI_API_KEY`.

```bash
npm run token -- you@example.com yourpassword
```

Prints a Supabase access token for a test user, for calling the authenticated API with curl.

### Frontend

```bash
cd frontend && npm install && npm run dev
```

Opens on `http://localhost:5173`. Create `frontend/.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID` — all public values, never a secret key.

## Testing the full pipeline

Step-by-step, including connecting Drive, choosing folders, starting a watch and checking activity: [ForDev.md](ForDev.md) §7–§8.

Drive only delivers push notifications to a domain verified in your Google Cloud project, so a free ngrok URL can't receive them — see [domainguide.md](domainguide.md).
