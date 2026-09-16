# Handover.md — DriveTag AI

**Snapshot:** 2026-09-16 · branch `production` @ `0fa54cd` · repo `github.com/DeltaCo-Creatives/Untitled-Project`

The one-page answer to "what is true right now, and what do I do next". Read this first; it links out to the detailed docs. Update the snapshot line and the tables whenever the state changes.

## TL;DR

- **Backend** — feature-complete for onboarding (Loop A) and the webhook → Gemini → rename/move pipeline (Loop B). Never yet run end to end against a real Google Drive.
- **Frontend** — designed UI shell (Login, Onboarding, Dashboard) with **mocked auth and no calls to the backend**. Vercel Analytics is wired; GSAP is installed but unused.
- **Accounts** — Supabase, the Google OAuth client, the Gemini key and Supabase's Google login were set up and live-verified, **but in a different working copy**. This machine doesn't have those secrets (see ⚠️ 1).
- **Domain** — `drivetag-ai.com` is bought. DNS, Google verification and deployments are not done.
- **Biggest next task** — make frontend auth real and wire the frontend to the API.

---

## ⚠️ Read before doing anything

### 1. The credentials aren't on this machine

ForDev.md §4–§6b and §13 record setup as done and verified: backend booted, Gemini classified an image, Supabase tables reachable, Google login working. That work happened in another environment. `.env` files are gitignored, so they never came through git.

Verified in this working copy on 2026-09-16:
- `backend/.env` exists, but `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` and `DRIVE_WEBHOOK_URL` are blank. `npm run dev` refuses to start and names the missing ones.
- `frontend/.env` does not exist.

**Fix:** copy both `.env` files over from the environment where setup was done — through a password manager or direct file transfer, never chat or git — or refill them using [tutorial.md](tutorial.md). The generated secrets in this copy's `backend/.env` (`TOKEN_ENCRYPTION_KEY` and friends) differ from the other environment's; use **one** set consistently, because refresh tokens encrypted with one `TOKEN_ENCRYPTION_KEY` can't be decrypted with another.

### 2. Both `.env.example` templates were deleted

Commit `0bdd63d` removed `backend/.env.example` and `frontend/.env.example`. Old instructions saying `cp .env.example .env` no longer work, and the error in `backend/src/config/env.js` still tells you to do that. Until the templates return, [tutorial.md](tutorial.md)'s quick-reference table is the list of variables.

Recommended: restore them. They hold no secrets and are the only in-repo record of which variables exist.

### 3. The local `GEMINI_MODEL` will fail

Google retired `gemini-2.5-flash` for new users — it now returns 404 pointing at `gemini-3.6-flash`, which was discovered from a live API error. The code default in `config/env.js` was updated to `gemini-3.6-flash`, but this machine's `backend/.env` still sets `GEMINI_MODEL=gemini-2.5-flash`, which overrides it. Change that line or delete it.

### 4. Security follow-ups — unconfirmed whether done

- The Supabase Postgres password was pasted into a chat. **Reset it** (Supabase → Project Settings → Database). The app never uses it, so nothing breaks.
- A Gemini API key was pasted into a chat. If the key currently in use is that one, **rotate it** in AI Studio.

---

## What's verified

| Check | Result | Where verified |
|---|---|---|
| Backend syntax, all 26 JS files | ✅ pass | this machine, 2026-09-16 |
| Backend route guards (403 bad webhook token, 401 unauthenticated, 302 tampered OAuth state, 404) | ✅ pass (dummy env) | this machine |
| Token encryption round-trip, OAuth state tamper rejection, filename slugging | ✅ pass | this machine |
| Frontend `npm run build` | ✅ pass | this machine, 2026-09-16 |
| Frontend `npm run lint` | ✅ 1 known warning (`AuthContext.tsx` fast refresh) | this machine, 2026-09-16 |
| Vercel Analytics: dev detection, credential redaction, redirect tracking, one view per load in the production build | ✅ pass | this machine, in browser |
| Backend full boot + `/health` with real credentials | ✅ pass | other environment (ForDev §6) |
| Gemini classification | ✅ pass — **1×1 placeholder image only** | other environment (ForDev §4) |
| Supabase: all 5 tables reachable | ✅ pass | other environment (ForDev §13) |
| Supabase Google login, protocol level | ✅ pass | other environment (ForDev §3b) |
| **Full Drive loop** — connect → watch → drop image → renamed and moved | ❌ **never run** | — |

---

## What's built

### Backend — `backend/` (Node.js, Express 5, ESM)

- **Loop A (onboarding):** separate offline Drive OAuth grant with signed `state`; refresh tokens AES-256-GCM encrypted; folder listing and config; watch start/stop; disconnect; `/api/me`; `/api/activity`.
- **Loop B (pipeline):** webhook with shared-secret check and fast ack → changes-feed sweep → filter to Raw folder → Gemini with inline image and strict JSON → rename to `genre_subject.ext` and move → `processed_files` ledger for idempotency.
- **Billing gate:** fails closed; a trial row is created on first Drive connect. No payment provider yet.
- **Scripts:** `npm run test:gemini`, `npm run renew:channels`, `npm run token`.
- **Schema:** `supabase/migrations/0001_init.sql` — 5 tables, RLS on all.

Architecture, design decisions and the API table: [CLAUDE.md](CLAUDE.md).

### Frontend — `frontend/` (React 19, Vite 8, Tailwind 4, TypeScript)

- Routes: `/` Login, `/onboarding`, `/dashboard` (protected).
- **Mocked:** `AuthContext.signInWithGoogle` fabricates a user with `access_token: 'dummy-token'`. The backend would reject it with 401.
- **Mocked:** Onboarding folder choices are hardcoded (`dummy_raw_id`, `dummy_dest_id`) with a `TODO` where the API call belongs.
- **Not present:** `VITE_API_URL`, any `fetch` to `/api/*`.
- **Working:** `src/components/RouteAnalytics.tsx` — Vercel Analytics with redirect tracking and OAuth-credential stripping.
- **Installed, unused:** `gsap` 3.15 and `@gsap/react` 2.1. GSAP agent skills live in `.claude/skills/`.

Details: [frontend/README.md](frontend/README.md).

### Accounts and infrastructure

| Service | State |
|---|---|
| GitHub | Branches: `production` (default, deploys from here), `staging` (identical to production today), `prod` (stale local branch, 10 commits behind) |
| Supabase | Project `ckskwjtjydaqewwojsfj`. Migration run, Google provider enabled, Site URL set — in the other environment |
| Google Cloud | OAuth client with `localhost:3001` and Supabase redirect URIs ✅. Consent-screen test user unconfirmed. Domain verification not done. Restricted-scope app verification not started |
| Gemini | Key created (other environment). Model `gemini-3.6-flash` |
| Domain | `drivetag-ai.com` on Namecheap. DNS, SSL, Google verification not started → [domainguide.md](domainguide.md) |
| DigitalOcean | **Unconfirmed** — no live backend URL recorded anywhere |
| Vercel | **Unconfirmed** — no live frontend URL recorded. Analytics must still be enabled in the dashboard |
| ngrok | CLI installed, not authenticated |
| Payments | Lemon Squeezy vs Paddle not chosen |

---

## What's next, in priority order

1. **Restore a working local environment** — bring the `.env` files over (⚠️ 1), fix `GEMINI_MODEL` (⚠️ 3), ideally restore the `.env.example` templates (⚠️ 2).
2. **Security follow-ups** (⚠️ 4).
3. **Real frontend auth** — replace the dummy `signInWithGoogle` with `supabase.auth.signInWithOAuth({ provider: 'google' })`.
4. **Wire frontend to API** — `VITE_API_URL`, a helper sending `Authorization: Bearer <supabase token>`, then connect-Drive, folder pickers, watch toggle, dashboard from `/api/me`, activity from `/api/activity`.
5. **Domain** — work through [domainguide.md](domainguide.md). This unblocks Drive webhook delivery.
6. **Deploy** — backend to DigitalOcean, frontend to Vercel; enable Vercel Analytics; record the live URLs here.
7. **First full Drive loop** — [ForDev.md](ForDev.md) §8, ideally with a real photo, not the placeholder.
8. **Schedule `npm run renew:channels` hourly** — without it, watch channels expire and tagging silently stops. Required before real users.
9. **Legal and Google verification** — privacy policy and ToS (disclose Vercel Analytics), then decide whether to pursue restricted-scope verification or stay on a test-user allowlist.
10. **Payments** — choose a provider, then build its webhook.

The full checklist is [task.md](task.md).

---

## Known issues and housekeeping

- `backend/src/config/env.js` error message references the deleted `backend/.env.example`.
- `.claude/settings.local.json` is committed; it's meant to be a personal, untracked file.
- Local `prod` branch is stale.
- `frontend/package.json` name is still the template's `temp-front`.
- One pre-existing lint warning: `AuthContext.tsx` exports a non-component alongside components (fast refresh).
- `backend/test-assets/` has no real sample image.
- By design and not yet addressed: duplicate output filenames are allowed; Shared Drives aren't supported.
- No automated test suite — verification has been manual probes, curl, and browser checks.

---

## Documentation map

| Doc | Use it for |
|---|---|
| **Handover.md** | Current state and next steps (this file) |
| [CLAUDE.md](CLAUDE.md) | Architecture, non-obvious design decisions, conventions, commands, API surface. Loaded automatically by Claude Code |
| [task.md](task.md) | Full scope checklist by phase |
| [ForDev.md](ForDev.md) | Ordered setup runbook, including the database SQL |
| [tutorial.md](tutorial.md) | Obtaining and rotating each credential; the list of every env var |
| [domainguide.md](domainguide.md) | Wiring `drivetag-ai.com` to Vercel, DigitalOcean and Google |
| [README.md](README.md) | Project introduction and quickstart |
| [frontend/README.md](frontend/README.md) | Frontend specifics |
| [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) | Database schema source of truth |

`.claude/skills/gsap-*/SKILL.md` are third-party GSAP skill files pinned by `skills-lock.json` — don't hand-edit them.

---

## Fresh machine quickstart

```bash
git clone https://github.com/DeltaCo-Creatives/Untitled-Project.git
```

```bash
cd Untitled-Project/backend && npm install
```

Create `backend/.env` — every variable is listed in [tutorial.md](tutorial.md). Then:

```bash
npm run dev
```

In a second terminal:

```bash
cd Untitled-Project/frontend && npm install && npm run dev
```

Create `frontend/.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_CLIENT_ID` for the frontend to reach Supabase.
