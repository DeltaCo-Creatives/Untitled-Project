# DriveTag AI — Frontend

React 19 + Vite 8 + Tailwind 4 + TypeScript, deployed to Vercel with Root Directory `frontend`. Project-wide state and next steps: [../Handover.md](../Handover.md).

## Status

This is a **designed UI shell**. Screens render and navigate, but nothing talks to real services yet:

- **Auth is mocked.** `src/contexts/AuthContext.tsx` → `signInWithGoogle` fabricates a user with `access_token: 'dummy-token'` instead of calling Supabase. The backend rejects that token with 401.
- **Onboarding is local-only.** Folder choices are hardcoded (`dummy_raw_id`, `dummy_dest_id`), with a `TODO` where the API call belongs.
- **No backend calls.** There's no `VITE_API_URL` and no `fetch` to `/api/*`.

What does work: routing, protected routes, the screens themselves, and Vercel Analytics.

## Commands

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # serve the production build locally
```

Build passes. Lint reports one pre-existing warning: `AuthContext.tsx` exports a non-component alongside its components, which limits fast refresh.

## Environment

Create `frontend/.env` (gitignored; `.env.local` also works). There's no template file in the repo right now.

```
VITE_SUPABASE_URL=https://ckskwjtjydaqewwojsfj.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_GOOGLE_CLIENT_ID=<Google OAuth client ID>
```

Every `VITE_*` value is compiled into the browser bundle, so all of these are public. **Never** put the Supabase `service_role` key or the Google client secret here. Without these values the Supabase client falls back to a placeholder URL and logs a warning; the app still builds and renders.

Once the frontend starts calling the backend it will also need `VITE_API_URL` (e.g. `http://localhost:3001`).

Where each value comes from: [../tutorial.md](../tutorial.md).

## Structure

```
src/
├── main.tsx                   React root (StrictMode)
├── App.tsx                    routes: / Login, /onboarding, /dashboard (protected)
├── contexts/AuthContext.tsx   session state — currently a dummy login
├── components/
│   ├── ProtectedRoute.tsx     redirects to / when signed out
│   └── RouteAnalytics.tsx     Vercel Analytics
├── lib/supabase.ts            Supabase client (anon key)
└── pages/                     Login, Onboarding, Dashboard
```

## Analytics

`src/components/RouteAnalytics.tsx` wraps `@vercel/analytics` with two deliberate changes — don't replace it with a bare `<Analytics />`:

- **Explicit routes.** Vercel's auto-tracking misses `<Navigate replace />` redirects, including login → dashboard, so the component reports a view on every route change.
- **URL redaction.** OAuth returns carry tokens and codes in the URL, so the hash and every query parameter except `utm_*` are stripped before a URL is reported.

Data only appears on Vercel deployments, and only once Analytics is enabled in the Vercel project. Locally it logs to the browser console instead.

## Animation

`gsap` and `@gsap/react` are installed but not used yet. In components, use the `useGSAP` hook so animations are cleaned up on unmount. GSAP guidance for Claude Code lives in `../.claude/skills/`.

## Still to build

1. Replace the dummy login with `supabase.auth.signInWithOAuth({ provider: 'google' })`.
2. Add `VITE_API_URL` and a helper that sends `Authorization: Bearer <supabase access token>`.
3. Onboarding: connect Drive (`POST /api/auth/google/start`), pick folders (`GET /api/drive/folders`, `POST /api/drive/config`), start watching (`POST /api/drive/watch`).
4. Dashboard from `GET /api/me`, activity from `GET /api/activity`, disconnect via `DELETE /api/auth/google`.

The full API table is in [../CLAUDE.md](../CLAUDE.md).
