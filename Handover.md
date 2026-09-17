# Handover.md — DriveTag AI

**Snapshot:** 2026-09-17 · branch `staging` · repo `github.com/DeltaCo-Creatives/Untitled-Project`

The one-page answer to "what is true right now, and what do I do next". Read this first; it links out to the detailed docs. Update the snapshot line and the tables whenever the state changes.

## TL;DR

- **Backend** — feature-complete for onboarding (Loop A) and the webhook → Gemini → rename/move pipeline (Loop B), plus two additions (see ⚠️ 6):
  - a **polling fallback**, so automatic sorting works on localhost without a verified webhook domain;
  - **Organize now**, for images already in the Raw folder.
- **Run it locally** — run `backend` from `.claude/launch.json` (nodemon on 3001), plus the frontend dev server.
- **Where the accounts stand** — as of 2026-09-17 **no account has connected Drive yet**, so the full loop (connect → pick folders → drop image → renamed) has still never run.
- **Frontend** — full **pastel "Lavender garden" redesign** (light theme, Fredoka + Nunito, GSAP animation on every page) across Landing `/`, `/login`, `/onboarding`, `/connect`, `/dashboard`, all wired to real Supabase auth and the backend API. Vercel Analytics is wired.
- **Accounts** — real credentials are in both `.env` files on this machine. Real Google sign-in has now been completed with more than one account.
- **"Failed to fetch"** — solved. It was a port mismatch, not an auth bug: see ⚠️ 5.
- **Google sign-in screen** — it still says `ckskwjtjydaqewwojsfj.supabase.co`. The fix (Supabase custom domain + Google brand verification) is written up in [domainguide.md](domainguide.md) §9 and is manual/dashboard work.
- **Domain** — `drivetag-ai.com` is bought. DNS, Google verification and deployments are not done.
- **Biggest next task** — the first real end-to-end run:
  1. Connect Drive.
  2. Pick real folders, then Start organizing. This should land in polling mode locally.
  3. Drop a real photo into Raw. Within about 60s it should be renamed and moved.
  4. Try **Organize now** on images that were already there.

---

## ⚠️ Read before doing anything

### 1. Credentials landed on this machine on 2026-09-17

Both `backend/.env` and `frontend/.env` now have every required variable filled in (confirmed by presence-checking, never by reading the actual values). This is the first time this working copy has had real secrets. The backend boots (`/health` → 200) and the OAuth chain reaches Google's real sign-in page — see "What's verified" below.

If you're on a *different* machine and still see blank values: `.env` files are gitignored and never travel through git, so each working copy needs its own copy — see [tutorial.md](tutorial.md) for how to obtain each one. If you deliberately keep multiple working copies, keep `TOKEN_ENCRYPTION_KEY` identical across all of them — refresh tokens encrypted with one copy's key can't be decrypted with another's.

### 2. `.env.example` templates

`frontend/.env.example` was restored, then deliberately deleted again (commit `f018f23`) — treat that as intentional, not something to re-add. `backend/.env.example` has never existed in this repo; [tutorial.md](tutorial.md)'s quick-reference table is the list of every variable.

### 3. The local `GEMINI_MODEL` will fail

Google retired `gemini-2.5-flash` for new users — it now returns 404 pointing at `gemini-3.6-flash`, which was discovered from a live API error. This machine's `backend/.env` already sets `GEMINI_MODEL=gemini-3.6-flash` correctly (checked — this value isn't a secret, see tutorial.md). If you copy `.env` from elsewhere, double check this line didn't come along set to the retired name.

### 4. Security follow-ups — unconfirmed whether done

- The Supabase Postgres password was pasted into a chat. **Reset it** (Supabase → Project Settings → Database). The app never uses it, so nothing breaks.
- A Gemini API key was pasted into a chat. If the key currently in use is that one, **rotate it** in AI Studio.

### 5. "Failed to fetch" means the frontend is on the wrong port

Root cause, confirmed on 2026-09-17:
- A second `npm run dev` found 5173 busy and silently moved to **5174**.
- `CORS_ORIGINS` in `backend/.env` only allows `http://localhost:5173`. A curl preflight from `:5174` gets no `Access-Control-Allow-Origin` header, so the browser blocks the response and `fetch` throws "Failed to fetch".
- It looked like a first-sign-up bug only because of which port each sign-in happened on.

Fixed so it can't recur silently:
- `vite.config.ts` now sets `strictPort`. A second dev server exits with "Port 5173 is already in use" instead of drifting.
- `lib/api.ts` turns network/CORS failures into a readable message that names the page's origin.
- Dashboard and Onboarding show an error card with **Try again**. Previously they showed a misleading "Connect your Drive" card or an endless spinner.

**Update, later on 2026-09-17:** the same error came back on 5174 for two reasons:
- The backend wasn't running at all.
- Dev CORS still only allowed 5173.

Now:
- Outside production, the backend accepts **any `http://localhost` port**.
- Drive-connect returns to whichever origin started it.
- The backend runs as the `backend` config in `.claude/launch.json`, so it's visible and stoppable.

Production is unchanged: `CORS_ORIGINS` only, which requires `NODE_ENV=production`.

### 6. Local automatic sorting uses polling; existing files wait for "Organize now"

**Polling fallback.** Google only delivers Drive webhooks to a public, verified domain, and `DRIVE_WEBHOOK_URL` is still a placeholder. With `AUTO_SYNC_INTERVAL_SECONDS=60` (set in this machine's `backend/.env`):
- **"Start organizing"** falls back to a polling channel. `backend` logs "Webhook registration failed; falling back to polling".
- **Every 60s** the backend sweeps the changes feed, exactly like a webhook would.
- **The dashboard** says "Checking your Raw folder every 60 seconds".
- **Pausing** the switch deletes the channel.

**Existing files.** Images already in Raw are never reported by the changes feed. The dashboard shows "N images waiting" with **Organize now**, and nothing moves until it's clicked. **Retry failed** re-attempts `failed` files.

**Before launch:** once the domain and webhook are real, set the interval to `0` in production (or keep it as a safety net) and re-register watches.

**Fixed in the same pass.** Folder names would have shown blank everywhere after setup: the backend returned snake_case config while the frontend reads camelCase. The config is now serialized in the routes.

---

## What's verified

| Check | Result | Where verified |
|---|---|---|
| Backend syntax, all 26 JS files | ✅ pass | this machine |
| Backend route guards (403 bad webhook token, 401 unauthenticated, 302 tampered OAuth state, 404) | ✅ pass | this machine |
| Token encryption round-trip, OAuth state tamper rejection, filename slugging | ✅ pass | this machine |
| Frontend `npm run build` and `npm run lint` | ✅ pass (3 pre-existing warnings, no errors) | this machine, 2026-09-17, after the redesign |
| **Real Google sign-in through Supabase** | ✅ completed by the user with multiple accounts | this machine, 2026-09-17 |
| `strictPort`: a second dev server refuses 5173 instead of drifting to 5174 | ✅ pass | this machine, 2026-09-17 |
| CORS failure from `:5174` shows the readable "Couldn't reach the DriveTag server… add this origin to CORS_ORIGINS" card, not "Failed to fetch" | ✅ pass, reproduced in browser | this machine, 2026-09-17 |
| Error + Try again states on Dashboard and Onboarding; Connect page success/`access_denied` variants | ✅ pass, in browser | this machine, 2026-09-17 |
| Pastel redesign: Landing at desktop (screenshots of every section) and 375px; Dashboard's configured state rendered with sample data (watch toggle, activity rows, tags, trial) at desktop and 375px; no horizontal overflow on any page | ✅ pass, in browser | this machine, 2026-09-17 |
| Vercel Analytics: dev detection, credential redaction, redirect tracking, one view per load in the production build | ✅ pass | this machine, in browser |
| **Backend full boot + `/health` with real credentials** | ✅ pass — **first time on this machine** | this machine, 2026-09-17 |
| **`GET /api/me` correctly 401s with no token, and correctly calls Supabase to reject a garbage token** (proves live Supabase wiring, not just presence checks) | ✅ pass | this machine, 2026-09-17 |
| **Login → real `supabase.auth.signInWithOAuth` → real Google sign-in page** for `ckskwjtjydaqewwojsfj.supabase.co` | ✅ pass, up to the point a human must type their own Google credentials | this machine, 2026-09-17, in browser |
| Landing page renders, routes correctly (`/` public, `/login`, unauthenticated `/dashboard`+`/onboarding` redirect to `/login`) | ✅ pass | this machine, 2026-09-17, in browser |
| GSAP animations play at real speed | ✅ ~90 fps measured while the preview pane was visible; Landing's entrance timeline, scroll reveals, tag-flow loop and Zero-Retention dissolve all seen in screenshots | this machine, 2026-09-17 |
| Gemini classification | ✅ pass — **1×1 placeholder image only, and not re-verified since new credentials landed** | other environment (ForDev §4) |
| Supabase: all 5 tables reachable | ✅ pass (other environment) — not re-checked this session | other environment (ForDev §13) |
| Dev CORS: `:5174` and `:5173` allowed, a foreign origin refused; production refuses localhost | ✅ curl + scripted checks | this machine, 2026-09-17 |
| OAuth `state` carries a signed `returnTo`; a forged `returnTo` is rejected; a tampered callback falls back to `FRONTEND_URL` | ✅ scripted checks + curl | this machine, 2026-09-17 |
| `serializeFolderConfig` camelCase shape; `AUTO_SYNC_INTERVAL_SECONDS` parsed; backend logs "Auto-sync enabled"; `/api/drive/raw-status` and `/api/drive/organize` require auth | ✅ pass | this machine, 2026-09-17 |
| Dashboard against a simulated backend in the browser, at desktop and 375px with no overflow | ✅ pass | this machine, 2026-09-17 |

The simulated-backend Dashboard run covered:
- Polling, live, expired and paused copy.
- Waiting/failed counts with **Organize now** and **Retry**.
- A live run: 3s refreshes while organizing, back to 30s when done, ending "all clear".
- Tag display.
- Onboarding notice banner, cleared from history.
- Disconnect dialog: focus lands on Cancel; Esc closes it; Confirm returns to setup.

| Check | Result | Where verified |
|---|---|---|
| **Full Drive loop**: connect → polling watch → drop image → renamed and moved | ❌ **still never run**. The backend pieces (Drive listing, Gemini, rename/move, polling channel creation) need a real Drive connection, and only a human can complete Google's consent screen | — |

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

- Routes: `/` Landing (public), `/login`, and protected `/onboarding`, `/dashboard`, `/connect` (where the backend's `GET /api/auth/google/callback` redirects).
- **Design system** (`src/index.css`, Tailwind 4 `@theme`) — "Lavender garden" palette: `canvas`, `ink`, `ink-soft`, `line`, `lavender`/`lavender-deep`, `periwinkle`, `butter`, `sage`/`sage-deep`, `rose`/`rose-ink`, each with a `-soft` tint. Buttons put `ink` text on lavender for contrast. Headings use **Fredoka**, body text **Nunito** (Google Fonts, `index.html`). New tag favicon.
- **Animation layer:**
  - `src/lib/gsap.ts` registers GSAP plugins once (`useGSAP`, ScrollTrigger, SplitText, Flip, DrawSVG) and exports `MOTION_OK` / `REDUCED_MOTION`. Import GSAP from here, not from `gsap` directly.
  - Every animation lives inside `gsap.matchMedia()`, so reduced-motion users get the final state instantly.
  - `@gsap/react` gotcha: with a non-empty `dependencies` array the context is **not** reverted between runs unless you pass `revertOnUpdate: true`, so looping animations would stack. The existing hooks show the pattern.
- **Shared UI:**
  - `components/ui/`: `Button`/`ButtonLink` (hover lift, press squish, optional magnetic pull), `Card` (hover tilt), `Logo`, `Skeleton`/`PageLoader`, `AnimatedNumber`, `BlobBackground` (global drifting blobs).
  - `hooks/`: `usePressMotion`, `useReveal` (`[data-reveal]` scroll reveals).
  - `lib/confetti.ts`.
  - Illustrations: `components/TagFlowIllustration.tsx` (looping drop → tag → rename → sort demo, using the backend's real `genre_subject.ext` naming) and `components/MemoryDemo.tsx` (the Zero-Retention dissolve).
- **Real, API-backed flows:**
  - **Auth:** real `supabase.auth.signInWithOAuth` / `signOut`.
  - **API client:** `src/lib/api.ts` sends `Authorization: Bearer <token>` to `VITE_API_URL`.
  - **Onboarding:** 4-step Flip-animated stepper — Connect Drive → folder search → save config → start watch, with a confetti burst on finish.
  - **Dashboard:** built from `/api/me` + `/api/activity`: animated watch switch, Raw → Destination flow, latest organized file, status counts, activity rows with tag chips and relative times, trial countdown, honest "Billing — coming soon".
- **Fixed this session:** `ActivityEntry` in `api.ts` claimed `id` and `created_at`, but `listRecent` never selects either. The Dashboard used `entry.id` as the React key, which was always `undefined`. The type now matches the real columns, and rows key on `file_id`.
- **Not yet built:** a Google Picker widget (folder selection is a searchable list from `/api/drive/folders`); `/privacy` and `/terms` pages (they need your legal text and are required for Google brand verification).
- **Working:** `src/components/RouteAnalytics.tsx` — Vercel Analytics with redirect tracking and OAuth-credential stripping.

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

1. **First real end-to-end run** (⚠️ 6), with the `backend` launch config running:
   1. Connect Drive. If Google says "Access blocked", add the account as a **test user** on the OAuth consent screen, since the `drive` scope is restricted.
   2. Pick folders, then **Start organizing**. Expect polling mode.
   3. Drop a real photo into Raw. It should be renamed and moved within about 60s.
   4. Click **Organize now** for images that were already there.
2. **Security follow-ups** (⚠️ 4).
3. **Domain** — work through [domainguide.md](domainguide.md). This unblocks Drive webhook delivery.
4. **Deploy** — backend to DigitalOcean, frontend to Vercel; enable Vercel Analytics; record the live URLs here.
5. **First full Drive loop** — [ForDev.md](ForDev.md) §8, ideally with a real photo, not the placeholder.
6. **Legal pages, then branded Google sign-in** — write the privacy policy and ToS (disclose Vercel Analytics), then [domainguide.md](domainguide.md) §9: Supabase custom domain `auth.drivetag-ai.com` (paid add-on) plus Google brand verification, so the sign-in screen says "DriveTag AI". Also decide whether to pursue restricted-scope app verification or stay on a test-user allowlist.
7. **Schedule `npm run renew:channels` hourly** — without it, watch channels expire and tagging silently stops. Required before real users.
8. **Google Drive folder picker** — optional upgrade over the current searchable list.
9. **Payments** — choose a provider, then build its webhook.

The full checklist is [task.md](task.md).

---

## Known issues and housekeeping

- `backend/src/config/env.js` error message references a `backend/.env.example` that has never existed in this repo.
- `.claude/settings.local.json` is committed; it's meant to be a personal, untracked file.
- Local `prod` branch is stale.
- `frontend/package.json` name is still the template's `temp-front`.
- Three lint warnings, no errors:
  - `AuthContext.tsx` exports a non-component alongside components (fast refresh).
  - `Dashboard.tsx` and `Onboarding.tsx` start async loads inside a `useEffect` (oxlint's `set-state-in-effect`). Harmless here: state is set after awaited API calls, not in a render loop.
- The Dashboard's "At a glance" counts cover the latest 50 activity rows (`ACTIVITY_LIMIT`), not all-time totals; the card says so.
- The Google sign-in screen shows `ckskwjtjydaqewwojsfj.supabase.co` until [domainguide.md](domainguide.md) §9 is done.
- `backend/test-assets/` has no real sample image.
- By design and not yet addressed: duplicate output filenames are allowed; Shared Drives aren't supported.
- No automated test suite — verification has been manual probes, curl, and browser checks.
- **For AI-assisted sessions:** Claude's Browser preview pane suspends `requestAnimationFrame` while hidden. The GSAP ticker advanced 0 frames in 500ms while hidden, and ran at ~90 fps while visible.
  - While hidden, animations freeze mid-tween; elements that animate in from `autoAlpha: 0` stay invisible; screenshots come out black or half-drawn.
  - Not a code bug — keep the pane visible when checking animations.
  - Also stop the preview dev server when done, so it doesn't hold port 5173 (that's how ⚠️ 5 started).

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
