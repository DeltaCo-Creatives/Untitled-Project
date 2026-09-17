# Handover.md — DriveTag AI

**Snapshot:** 2026-09-17 · `production` and `staging` both at `75abc96`, plus uncommitted production-login fixes (⚠️ 7) · repo `github.com/DeltaCo-Creatives/Untitled-Project`

The one-page answer to "what is true right now, and what do I do next". Read this first; it links out to the detailed docs. Update the snapshot line and the tables whenever the state changes.

## TL;DR

- **Backend** — feature-complete for onboarding (Loop A) and the webhook → Gemini → rename/move pipeline (Loop B), plus two additions (see ⚠️ 6):
  - a **polling fallback**, so automatic sorting works on localhost without a verified webhook domain;
  - **Organize now**, for images already in the Raw folder.
- **Production is deployed** — commit `75abc96`: Vercel at `https://drivetag-ai.com`, DigitalOcean at `https://api.drivetag-ai.com`, health 200. **Production login was broken** on 2026-09-17; see ⚠️ 7. The code fixes are made but uncommitted. The dashboard steps (Vercel, Supabase, DigitalOcean, Namecheap DNS) are in [domainguide.md](domainguide.md) §2–§7.
- **Local dev shares the production database** — `backend/.env` points at the production Supabase project. Local `AUTO_SYNC_INTERVAL_SECONDS` is now `0`, and channel renewal only runs with `NODE_ENV=production`, so a laptop can't sweep or renew production users' channels. Don't connect Drive locally with an account you also use in production unless `TOKEN_ENCRYPTION_KEY` matches DigitalOcean's.
- **Where the accounts stand** — as of 2026-09-17 **no account has connected Drive yet**, so the full loop (connect → pick folders → drop image → renamed) has still never run.
- **Frontend** — full **pastel "Lavender garden" redesign** (light theme, Fredoka + Nunito, GSAP animation on every page) across Landing `/`, `/login`, `/onboarding`, `/connect`, `/dashboard`, all wired to real Supabase auth and the backend API. Vercel Analytics is wired.
- **Accounts** — real credentials are in both `.env` files on this machine. Real Google sign-in has now been completed with more than one account.
- **"Failed to fetch"** — solved. It was a port mismatch, not an auth bug: see ⚠️ 5.
- **Google sign-in screen** — it still says `ckskwjtjydaqewwojsfj.supabase.co`. The fix (Supabase custom domain + Google brand verification) is written up in [domainguide.md](domainguide.md) §9 and is manual/dashboard work.
- **Domain** — `drivetag-ai.com` and `www` still point at a Namecheap host, not straight at Vercel, and `www` shows a parking page ([domainguide.md](domainguide.md) §2). Google domain verification is not done.
- **Biggest next task** — make production login work (⚠️ 7), then do the first real end-to-end run on `https://drivetag-ai.com`:
  1. Connect Drive.
  2. Pick folders, then Start organizing.
  3. Drop a real photo into Raw.
  4. Try **Organize now**.

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

**Polling fallback.** Google only delivers Drive webhooks to a public, verified domain, and locally `DRIVE_WEBHOOK_URL` is a placeholder. With `AUTO_SYNC_INTERVAL_SECONDS=60`:

> **Changed later on 2026-09-17:** the local `backend/.env` now sets this to `0`, because the local backend shares the production database (see TL;DR). Use `60` on DigitalOcean until Google accepts the webhook.
- **"Start organizing"** falls back to a polling channel. `backend` logs "Webhook registration failed; falling back to polling".
- **Every 60s** the backend sweeps the changes feed, exactly like a webhook would.
- **The dashboard** says "Checking your Raw folder every 60 seconds".
- **Pausing** the switch deletes the channel.

**Existing files.** Images already in Raw are never reported by the changes feed. The dashboard shows "N images waiting" with **Organize now**, and nothing moves until it's clicked. **Retry failed** re-attempts `failed` files.

**Before launch:** once the domain and webhook are real, set the interval to `0` in production (or keep it as a safety net) and re-register watches.

**Fixed in the same pass.** Folder names would have shown blank everywhere after setup: the backend returned snake_case config while the frontend reads camelCase. The config is now serialized in the routes.

### 7. Production login on drivetag-ai.com — diagnosed and fixed in code; dashboard steps remain

**Symptoms.**
- `https://drivetag-ai.com/login` showed Vercel's 404.
- After Google sign-in the browser landed on `http://localhost:5173/#access_token=…`, "refused to connect".

**Verified causes.** A diagnosis workflow with adversarial verification upheld each of these 2/2:
1. **No SPA rewrite on Vercel**, so every client route (`/login`, `/dashboard`, `/connect`) returns `X-Vercel-Error: NOT_FOUND`.
2. **Supabase Site URL still `http://localhost:5173`, and `https://drivetag-ai.com` not allowlisted.**
   - Supabase silently replaced `redirect_to=https://drivetag-ai.com/dashboard` with the localhost Site URL; a probe showed this directly.
   - A token came back, so Google sign-in itself succeeded. **Google test users were not the cause.**
3. **Vercel built without `VITE_API_URL`**, so the live bundle calls `http://localhost:3001`.

**Next in line, confirmed from outside.** DigitalOcean `CORS_ORIGINS` and `FRONTEND_URL` are still localhost; `NODE_ENV=production` is correctly set. DNS for `@` and `www` goes through a Namecheap host, with a parking page on `www`.

**Fixed in code** (uncommitted as of this snapshot):
- `frontend/vercel.json` adds the SPA rewrite.
- `vite build` fails without `VITE_API_URL` and the two Supabase vars, and a Vercel build fails if `VITE_API_URL` is localhost. `api.ts` falls back to localhost only in dev.
- The Supabase **PKCE** flow, verified live: the authorize URL carries `code_challenge=s256`. A misrouted sign-in now carries a one-time code bound to the browser, not a live token.
- The backend logs `"Production config problem"` at boot for localhost or placeholder URL vars.
- Refused CORS preflights return 204 instead of a misleading 401.
- **Watch channels** are requested for 6 days, not Google's 1-hour default, and renewed hourly in-process in production. Renewal overlaps and keeps the page token; a pause can't lose a race with it.
- **Claims:** a claim orphaned by a crash or redeploy is recovered after 15 minutes and fenced by `claimed_at`, so a stalled worker can't overwrite the result or move the file twice. The activity feed shows such a claim as failed ("Interrupted while processing") instead of "Processing" forever.
- **Disconnect never revoked at Google (pre-existing bug).** It called `revokeCredentials()` on a client holding no access token, which always threw, so the grant stayed live in the user's Google account. `revokeAccess` now revokes the refresh token itself.
- **Watch races:** start, pause, renew and disconnect for one user now run one at a time (a per-user lock in `driveWatch.service.js`). A channel registered at Google but not saved is stopped again. Before this, a disconnect or pause during a renewal or start could leave a live channel nobody could stop.
- **Timeouts:** Drive calls time out after 60s (downloads 120s) and Gemini after 90s. Before, a hung request stalled that user's sorting indefinitely.
- **Local safety:** `AUTO_SYNC_INTERVAL_SECONDS=0` in the local `.env`.

**Your steps, in order** ([domainguide.md](domainguide.md) has exact values and a check for each):
1. **Vercel:** set `VITE_API_URL=https://api.drivetag-ai.com`, then commit and push these changes and redeploy with the build cache off (§2b).
2. **DigitalOcean:**
   - Set `CORS_ORIGINS` and `FRONTEND_URL` to `https://drivetag-ai.com`, `GOOGLE_OAUTH_REDIRECT_URI` and `DRIVE_WEBHOOK_URL` to the `api.drivetag-ai.com` values, and `AUTO_SYNC_INTERVAL_SECONDS=60`.
   - Redeploy, and confirm no `"Production config problem"` log (§6).
3. **Supabase → URL Configuration:** set Site URL to `https://drivetag-ai.com` and add `https://drivetag-ai.com/**`. Keep the localhost entry (§7).
4. **Google Cloud:** add `https://api.drivetag-ai.com/api/auth/google/callback` to the OAuth client (§5). While the app is in Testing, add every account that will connect Drive as a test user.
5. **Namecheap DNS:** point `@` and `www` at Vercel's records, keeping the `api` CNAME, MX and SPF (§2).

**Known follow-ups, not fixed.** From the completeness critic:
- **Google Testing mode** expires Drive refresh tokens after 7 days, and there's no "reconnect Drive" prompt when that happens.
- **The 14-day trial** stops organizing with no way to pay: set your own `subscriptions` row to `active` meanwhile.
- **Supabase is retiring legacy anon/service_role keys by end of 2026** — migrate to publishable/secret keys.
- **Image limits:** GIF/TIFF and images over ~14 MB may exceed what Gemini accepts inline.
- **Shared folders:** a Raw folder from "Shared with me" isn't swept automatically; "Organize now" still works.
- **Notifications during a sweep:** a webhook that arrives while that user's sweep is running is skipped rather than queued. The change isn't lost, because the stored page token still covers it. But in live mode it waits for the *next* Drive notification (a polling channel catches it on the next tick), so one image can sit in Raw until something else changes in that Drive.
- **Single instance:** the per-user watch lock and the `inFlight` set live in process memory. Scaling DigitalOcean past one instance needs a database lock first.

---

## What's verified

| Check | Result | Where verified |
|---|---|---|
| Backend syntax, all 26 JS files | ✅ pass | this machine |
| Backend route guards (403 bad webhook token, 401 unauthenticated, 302 tampered OAuth state, 404) | ✅ pass | this machine |
| Token encryption round-trip, OAuth state tamper rejection, filename slugging | ✅ pass | this machine |
| Frontend `npm run build` and `npm run lint` | ✅ pass (3 pre-existing warnings, no errors) | this machine, 2026-09-17, after the production-login fixes |
| Build guards: missing `VITE_API_URL` fails; a Vercel build (`VERCEL=1`) with a localhost or 127.0.0.1 API URL fails; with `https://api.drivetag-ai.com` it builds and the bundle has no `localhost:3001` | ✅ pass | this machine, 2026-09-17 |
| Watch-lifecycle races (renew/start vs pause/disconnect, concurrent starts, a failed save after registration, lock recovery), replayed against the real `driveWatch.service.js` with mocked Google and database | ✅ 7/7 pass. With the lock disabled, 3 of 7 fail, so the checks detect the races | this machine, 2026-09-17 (scratch scripts, not in the repo) |
| Production config warnings, stale-claim detection, `revokeAccess` hits Google's revoke endpoint, `claimed_at` filter URL-encodes `+` | ✅ pass | this machine, 2026-09-17 |
| Supabase sign-in uses PKCE: the live authorize URL carries `code_challenge` with method `s256` | ✅ pass | this machine, 2026-09-17 |
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
