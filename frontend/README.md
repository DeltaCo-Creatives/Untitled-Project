# DriveTag AI — Frontend

React 19 + Vite 8 + Tailwind 4 + TypeScript, deployed to Vercel with Root Directory `frontend`. Project-wide state and next steps: [../Handover.md](../Handover.md).

## Status

**Built and wired to the real backend.** Every screen reads and writes through `src/lib/api.ts`, and sign-in is real Supabase Google OAuth (PKCE).

| Area | State |
|---|---|
| Auth | ✅ Real — `supabase.auth.signInWithOAuth({ provider: 'google' })`, PKCE flow |
| API client | ✅ Real — `src/lib/api.ts` sends `Authorization: Bearer <supabase access token>` to `VITE_API_URL` |
| Pages | ✅ All seven built: Landing, Login, Plans, Onboarding, Connect, Dashboard, ProcessEditor |
| Design system | ✅ "Lavender garden" pastel tokens in `src/index.css` |
| Animation | ✅ GSAP throughout (37 modules import from `src/lib/gsap.ts`), all gated on `prefers-reduced-motion` |
| Analytics | ✅ Vercel Analytics with redirect tracking and URL redaction |
| Deploy config | ✅ `vercel.json` SPA rewrite + build-time env guards in `vite.config.ts` |
| Checkout | ❌ Not built — plan and pack buttons show "Coming soon" until a payment provider is chosen |
| Legal pages | ❌ `/privacy` and `/terms` don't exist; Google brand verification needs them |

> The earlier version of this file described a "designed UI shell" with a mocked `dummy-token` login and no backend calls. That is long out of date — none of it is true as of commit `3f4f554`.

## Commands

```bash
npm install
npm run dev       # http://localhost:5173 (strictPort — a second server refuses to start)
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview   # serve the production build on :4173 (strictPort)
```

`npm run build` last verified passing on 2026-09-17, with one pre-existing lint warning: `AuthContext.tsx` exports a non-component alongside its components, which limits fast refresh.

## Environment

Create `frontend/.env` (gitignored; `.env.local` also works). There is no template file in the repo — it was deleted in commit `f018f23`, deliberately.

```
VITE_SUPABASE_URL=https://ckskwjtjydaqewwojsfj.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_URL=http://localhost:3001
```

- **All three are required at build time.** `vite.config.ts` throws `Missing VITE_… for this build` rather than let a deploy silently ship the wrong API address. `npm run dev` still falls back to `http://localhost:3001`.
- **A Vercel build (`VERCEL=1`) additionally fails** if `VITE_API_URL` points at `localhost` or `127.0.0.1`. That mistake once shipped to production.
- **Values are baked in at build time.** Changing one on Vercel does nothing until you redeploy with the build cache off.
- Every `VITE_*` value is compiled into the browser bundle, so all of these are public. **Never** put the Supabase `service_role` key or the Google client secret here.
- **`VITE_GOOGLE_CLIENT_ID` is not read by this app.** Google sign-in goes through Supabase's provider config, so an old `.env` can drop it.

Where each value comes from: [../tutorial.md](../tutorial.md).

## Structure

```
src/
├── main.tsx                   React root (StrictMode)
├── App.tsx                    routes — see below
├── index.css                  Tailwind 4 @theme design tokens
├── contexts/AuthContext.tsx   Supabase session + Google sign-in/out
├── components/
│   ├── ProtectedRoute.tsx     redirects to /login when signed out
│   ├── RouteAnalytics.tsx     Vercel Analytics + URL redaction
│   ├── TagFlowIllustration.tsx, MemoryDemo.tsx   animated marketing illustrations
│   ├── ui/                    Button/ButtonLink, Card, Modal, ConfirmDialog, TextField/TextArea,
│   │                          Switch, SegmentedControl, ProgressBar, Logo, Skeleton/PageLoader,
│   │                          AnimatedNumber, BlobBackground
│   ├── drive/                 FolderBrowser (breadcrumbs, search, new folder), FolderPickerField
│   ├── processes/             ProcessForm + destination, naming-template, tag-field and instruction editors
│   ├── billing/               UsageMeter, PlanGrid/PlanCard, TopupPacks, planFeatures
│   └── dashboard/             useDashboardData polling + Sorting/Usage/Process/Connection/Stats/Activity cards
├── hooks/                     usePressMotion, useReveal, usePlans
├── lib/
│   ├── supabase.ts            anon-key client (PKCE flow)
│   ├── api.ts                 typed backend client
│   ├── filename.ts            naming-template mirror of backend/src/utils/filename.js
│   ├── gsap.ts                plugin registration + reduced-motion queries
│   ├── format.ts, messages.ts, confetti.ts
└── pages/                     Landing, Login, Plans, Onboarding, Connect, Dashboard, ProcessEditor
```

### Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | public | Landing, including pricing |
| `/login` | public | Google sign-in |
| `/plans` | public | Plan and top-up pack comparison |
| `/onboarding` | protected | Four-step stepper that creates the first work process |
| `/dashboard` | protected | Per-process cards, usage meter, activity feed |
| `/connect` | protected | Where the backend's Drive OAuth callback lands; claims the parked grant |
| `/processes/new`, `/processes/:id` | protected | Full process editor |

`vercel.json` rewrites every path to `index.html`. Without it each of these 404s on Vercel — that is exactly what broke production login on 2026-09-17.

## Design system

Tokens live in `src/index.css` under Tailwind 4's `@theme`. Use these rather than raw Tailwind palette colors:

- **Neutrals:** `canvas` `#faf8ff`, `ink` `#25204a`, `ink-soft` `#6b6590`, `line` `#e9e3ff`
- **Accents,** each with a `-soft` tint: `lavender` (+ `lavender-deep`), `periwinkle`, `butter`, `sage` (+ `sage-deep`), `rose` (+ `rose-ink`)
- **Shadows:** `shadow-soft`, `shadow-lift`
- **Fonts:** Fredoka for headings (`font-display`), Nunito for body (`font-sans`), both from Google Fonts in `index.html`

Buttons put `ink` text on lavender rather than white, for contrast.

## Animation

GSAP, imported from **`src/lib/gsap.ts`** — never from `gsap` directly. That module registers `useGSAP`, ScrollTrigger, SplitText, Flip and DrawSVGPlugin exactly once, sets project defaults (`ease: 'power3.out'`, `duration: 0.6`), and exports the `MOTION_OK` / `REDUCED_MOTION` media queries.

Two rules the existing code follows:

- **Every animation lives inside `gsap.matchMedia()`,** so users who prefer reduced motion get the final state instantly instead of a tween.
- **`@gsap/react` does not revert between dependency changes by default.** Pass `revertOnUpdate: true` to `useGSAP` for any dependency-driven or looping animation, or the tweens stack up.

GSAP guidance for Claude Code lives in `../.claude/skills/gsap-*` — third-party files pinned by `skills-lock.json`; update with `npx skills update` rather than editing them.

## Analytics

`src/components/RouteAnalytics.tsx` wraps `@vercel/analytics` with two deliberate changes — don't replace it with a bare `<Analytics />`:

- **Explicit routes.** Vercel's auto-tracking only hooks `history.pushState`, so it misses `<Navigate replace />` redirects, including login → dashboard. The component reports a view on every route change.
- **URL redaction.** OAuth returns carry Supabase tokens and `code`/`state` in the URL, so the hash and every query parameter except `utm_*` are stripped before a URL is reported.

Data only appears on Vercel deployments, and only once Analytics is enabled in the Vercel project dashboard. Locally it logs to the browser console; in dev, StrictMode logs the first view twice, while a production build sends one.

## Still to build

1. **Checkout** — plan and top-up purchase redirects, plus a billing portal link. Blocked on the Lemon Squeezy vs Paddle decision.
2. **`/privacy` and `/terms`** — they need real legal text and are a prerequisite for Google brand verification ([../domainguide.md](../domainguide.md) §9d).
3. **Google Drive Picker widget** — optional upgrade over the current searchable folder list.
4. **Unsaved-changes guard on browser Back** in the process editor. `BrowserRouter` has no `useBlocker`; Cancel, the header link and closing the tab are already guarded.
5. **Rename the package** — `package.json` still says `temp-front`.

The full API table is in [../CLAUDE.md](../CLAUDE.md); the full scope checklist is [../task.md](../task.md).
