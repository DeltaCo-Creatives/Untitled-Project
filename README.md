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
| Backend | ✅ Built — Drive OAuth, work processes, watch channels, per-process Gemini routing, rename/move, plans and usage metering |
| Frontend | ✅ Built — real Supabase Google login, onboarding, process editor with folder browser, dashboard, plans page, all API-backed |
| Accounts | ✅ Supabase, Google OAuth and Gemini set up and live-verified — in one environment. `.env` files are gitignored, so each checkout needs its own |
| Domain | ⚠️ `drivetag-ai.com` purchased; `api` points at DigitalOcean, but `@` and `www` still resolve to a Namecheap host. Google domain verification not done |
| Deployment | ⚠️ Both platforms are live, but unfinished. At the last external check (2026-09-17) the backend's env vars still said `localhost` and the Vercel build had failed on a missing `VITE_API_URL` |
| Full Drive loop | ❌ Never run end to end with a real image |
| Payments | ❌ Plans, limits and credits built; no checkout — provider not chosen, plans set by hand (ForDev.md §2b) |
| Tests | ❌ No automated suite. Verification is manual probes, curl, browser checks and scratch harnesses |

**For the full current state and what to do next, read [Handover.md](Handover.md).** The task-by-task checklist is [task.md](task.md).

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
tests/       shared naming-template vectors both filename implementations must pass
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

Opens on `http://localhost:5173` (a strict port — a second dev server refuses to start rather than drifting to 5174, which used to break every API call with "Failed to fetch").

Create `frontend/.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_URL` — all public values, never a secret key. `npm run build` fails if any of the three is missing.

## Testing the full pipeline

Step-by-step, including connecting Drive, choosing folders, starting a watch and checking activity: [ForDev.md](ForDev.md) §7–§8.

Drive only delivers push notifications to a domain verified in your Google Cloud project, so a free ngrok URL can't receive them — see [domainguide.md](domainguide.md).
