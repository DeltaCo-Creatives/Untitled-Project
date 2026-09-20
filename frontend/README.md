# DriveTag AI — Frontend

React 19 + Vite 8 + Tailwind 4 + TypeScript. Deployed to Vercel (Root Directory `frontend`) at **https://drivetag-ai.com** — production-ready, live end to end against the real backend.

DriveTag sorts two **kinds** of work process, chosen when a process is created and fixed afterwards: `image` and `document` (PDF, Word, Google Docs/Sheets/Slides, text — added in this release). Plans come in three **families** that share the same three tiers — Images, Documents, and Images + Documents — see [Pricing UI](#pricing-ui-cookie-consent--analytics-legal-pages).

- **[../README.md](../README.md)** — product overview, plans and pricing, the document-sorting cost strategy.
- **[../CLAUDE.md](../CLAUDE.md)** — architecture and the non-obvious design decisions for the whole repo; this doc doesn't repeat that reasoning.
- **[../backend/README.md](../backend/README.md)** — API setup, env vars, database, deployment, operations.

### Where this code actually is (2026-09-20)

**Everything described below is live.** `production` now carries the whole closed-beta + Lemon Squeezy + VAT release (`540af6b` → merge `f851715` → `392236b`) and Vercel builds `drivetag-ai.com` from `production`. `staging` is three commits behind `production` with an identical tree. Verified: the live bundle contains the `/beta` page, the live backend's `GET /api/plans` returns `pricesIncludeTax` and `merchantOfRecord`, and `POST /api/beta/signups` answers `{"received":true}`. Migration `0005_beta.sql` has been run, so `0001`–`0005` are all applied. The five accidental debug `*.json` files are deleted, and `.claude/settings.local.json` is no longer tracked.

**One DNS fault briefly broke the site for a share of visitors on 2026-09-20, and it wasn't in this code:** the apex `A` record pointed at Lemon Squeezy as well as Vercel. It was fixed the same day. See [DNS (Namecheap → Vercel)](#dns-namecheap--vercel).

**Uncommitted in the working tree: the Lemon Squeezy checkout release — built, not committed, not deployed.** The live site still serves the previous release, so every "Coming soon" button described below is still what a visitor sees today. On the frontend it adds `lib/lemonSqueezy.ts` (the overlay loader), `components/billing/ReceiptPrint.tsx`, the protected `/checkout/success` page, and `purchasable`/`checkoutEnabled` gating on every buy button — see [Checkout](#checkout-what-the-frontend-owns). **No real purchase has ever been made**: link building, the overlay fallback and the success screen are unit-tested and checked in a browser, but nothing has been through a live store. Also uncommitted: AI workers per process drop to Creator 2 / Studio 3 / Enterprise 10 in `backend/src/config/plans.js` (Free stays 1). **The frontend needs no change for that one** — every worker number on screen is rendered from `plan.aiPerProcess` in the API payload, never hard-coded. It takes effect on the next backend deploy. See [State & next steps](#state--next-steps).

---

## Quickstart & environment

```bash
cd frontend && npm install
```

Create `frontend/.env` by hand (gitignored; `.env.local` also works — there's no template file in the repo):

```
VITE_SUPABASE_URL=https://ckskwjtjydaqewwojsfj.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_URL=http://localhost:3001
```

| Variable | Required at build? | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase project URL, used by `src/lib/supabase.ts` |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase publishable (public) key. **This is now an `sb_publishable_…` key, not a legacy `eyJ…` JWT** — the project has migrated to Supabase's new API keys. Judge it by prefix, never by length |
| `VITE_API_URL` | yes | Backend base URL, no trailing slash — `src/lib/api.ts` sends every request here |

**All three are required at build time, and an empty value fails exactly like a missing one.** `vite.config.ts` filters `REQUIRED_AT_BUILD` with `!env[name]`, so `VITE_API_URL=` is as fatal as leaving the line out, and throws `Missing VITE_… for this build`. Deliberate: a deploy must never silently ship the wrong API address. `npm run dev` is the exception — it falls back to `VITE_API_URL=http://localhost:3001` when unset, so local dev works with only the two Supabase vars.

**Public by design.** Every `VITE_*` value is compiled into the browser bundle. Never put the Supabase `service_role`/`sb_secret_` key or the Google client secret in this file. `VITE_GOOGLE_CLIENT_ID` still appears in some local `.env` files but **nothing in `src` reads it** (verified 2026-09-20: the only hit in the whole frontend outside `.env` is this README). Google sign-in goes through Supabase's provider config, so it is stale and can be deleted.

Where each value comes from: Supabase dashboard → Project Settings → API (URL and anon key); `VITE_API_URL` is the backend address (local `http://localhost:3001`, production `https://api.drivetag-ai.com`). Backend credentials are covered in [../backend/README.md](../backend/README.md#getting-each-credential).

### Commands

Run from `frontend/`:

```bash
npm run dev
```
Starts Vite on `http://localhost:5173` (`strictPort` — a second instance refuses to start rather than drift to 5174).

```bash
npm run build
```
`tsc -b && vite build`. Fails without the three `VITE_*` vars above.

```bash
npm run lint
```
`oxlint`.

```bash
npm run preview
```
Serves the production build on `http://localhost:4173` (`strictPort`).

---

## Deploying to Vercel

- **Root Directory:** `frontend`.
- **Environment Variables** (Settings → Environment Variables): the same three `VITE_*` vars as local dev, with `VITE_API_URL=https://api.drivetag-ai.com`. **Tick both the Production *and* Preview environments for all three.** A variable scoped to Production only builds the production domain fine and then fails every branch/PR preview build with `Missing VITE_API_URL for this build` — exactly what happened on 2026-09-20, since fixed. Preview builds are how a `staging` branch gets checked before it's merged, so they need the vars too.
- **Build guard:** on Vercel (`VERCEL=1`), `vite.config.ts` additionally refuses to build if `VITE_API_URL` points at `localhost`/`127.0.0.1` — a mistake that once shipped to production.
- **`vercel.json`** rewrites every path to `/index.html`. Without it, every client route (`/login`, `/dashboard`, `/connect`, …) 404s on Vercel — this is exactly what broke production login on 2026-09-17, since fixed.
- **Values are baked in at build time.** Changing a variable in the Vercel dashboard does nothing until you redeploy with **"Use existing build cache" turned off**.
- **Vercel Analytics is enabled** in the Vercel project dashboard — the code (`@vercel/analytics`) is wired in and consent-gated (see [Pricing UI, cookie consent & analytics, legal pages](#pricing-ui-cookie-consent--analytics-legal-pages)).

---

## DNS (Namecheap → Vercel)

> ✅ **Resolved (2026-09-20): the apex briefly had a second `A` record pointing at Lemon Squeezy** — `@` → `3.33.255.208` alongside Vercel's `216.198.79.1`. Google's resolver returned the Lemon Squeezy address first, and it answered **HTTP 403** for this domain, so a large share of visitors got an error page instead of the app for part of the day. The owner deleted that record the same day it appeared; `nslookup drivetag-ai.com 8.8.8.8` now returns only `216.198.79.1`. Full detail and the standing rule it left behind (never let anything, including a Lemon Squeezy setup step, add a second apex `A` record): DeveloperToDo.md §2.1. `www` and `api` were unaffected.

The whole Namecheap configuration, including the apex, is **settled as of 2026-09-20** — DeveloperToDo.md §7 lists those records as done. Kept as a record of what was wrong, because it is easy to re-break: until 2026-09-19 Vercel showed **"Invalid Configuration"** because Namecheap's **HTTPS toggle** on the `@` A record was **ON**, which routed traffic through Namecheap's SSL proxy so DNS answered `159.198.67.67` instead of the `216.198.79.1` the record said, and Vercel's domain check never saw its own IP. The steps below are the configuration to keep, not a fix still to apply.

Fix in Namecheap → **Domain List → drivetag-ai.com → Advanced DNS**:

1. **`A` record, host `@`** → value `216.198.79.1` (the value Vercel's Domains card shows for this project; the legacy `76.76.21.21` also works) → switch **HTTPS OFF**. **Exactly one `A` record on `@`.** Two `A` records means DNS round-robins between them and roughly half of all visits land on whatever else you added — which is exactly what happened on 2026-09-20, resolved above.
2. In Vercel → Project → Settings → Domains → **Add Existing** → `www.drivetag-ai.com` → choose **Redirect to drivetag-ai.com** (308). Vercel then shows the CNAME target for `www` — it's project-specific (e.g. `…vercel-dns-0xx.com`); use exactly what the card shows. In Namecheap, edit the **`CNAME` record, host `www`**: replace `parkingpage.namecheap.com` with that target, **HTTPS OFF**.
3. The **`TXT` record with host `google`** verifies nothing on its own: a Search Console **Domain** property needs the TXT on host `@`. Change that record's host from `google` to `@` (keep the same `google-site-verification=…` value). The existing SPF TXT record on `@` (used for email forwarding) stays — multiple TXT records on `@` are fine. Then click **Verify** in Search Console.
4. Keep the **`CNAME` record, host `api`** → `drivetag-ai-geirr.ondigitalocean.app` (the backend) unchanged.
5. The **`CNAME` record `_nnde10il…` → `dcv.ssl.com.`** is domain validation for the SSL certificate bought at Namecheap. Vercel issues its own certificate, so this record is unrelated to the fix — harmless to keep, safe to delete if that purchased certificate isn't in use.
6. Keep **Mail Settings → Email Forwarding** (the `eforward*` MX records), and add forwards for `support@drivetag-ai.com` and `privacy@drivetag-ai.com` to your inbox — the legal pages ([Pricing UI, cookie consent & analytics, legal pages](#pricing-ui-cookie-consent--analytics-legal-pages)) publish both addresses.
7. **Don't** switch to Vercel's nameservers (the "Vercel DNS" tab) — you'd have to recreate the `api` CNAME, the MX records and the TXT record there too. Not needed.

**Check afterwards** (propagation is usually minutes, worst case the record TTL, up to 48h):

```bash
nslookup drivetag-ai.com 8.8.8.8
```
Expect `216.198.79.1`, and **only** that. Any second address (the 2026-09-20 incident added `3.33.255.208`) is a record that must be deleted. Ask a public resolver, not your own — a cached local answer hides the fault.

```bash
nslookup www.drivetag-ai.com 8.8.8.8
```
Expect the vercel-dns CNAME target from step 2.

Then Vercel → Domains → **Refresh** → "Valid Configuration", certificate issued automatically. No Supabase or CORS change is needed, because `www` redirects to the apex at Vercel's edge.

---

## Supabase Auth URL configuration

Supabase dashboard → **Authentication → URL Configuration**:

| Setting | Value |
|---|---|
| Site URL | `https://drivetag-ai.com` |
| Redirect URLs | `https://drivetag-ai.com/**` and `http://localhost:5173/**` |

If a signed-in page's address isn't on the redirect allowlist, Supabase silently sends the finished sign-in to the Site URL instead (and drops the path) — keep both entries in sync with wherever the app is actually reachable. Add `http://localhost:4173/**` too if you use `npm run preview`.

Auth uses the **PKCE** flow (`src/lib/supabase.ts`, `{ auth: { flowType: 'pkce' } }`): a redirect to the wrong address carries a one-time code bound to that browser instance, not a live access/refresh token sitting in the URL.

---

## Google OAuth branding & verification

Google Cloud → **Google Auth Platform → Branding**:

| Field | Value |
|---|---|
| Application home page | `https://drivetag-ai.com/` |
| Privacy policy | `https://drivetag-ai.com/privacy` |
| Terms of service | `https://drivetag-ai.com/terms` |
| Authorized domains | `drivetag-ai.com` (requires the Search Console verification in [DNS (Namecheap → Vercel)](#dns-namecheap--vercel), done by an account that's an owner of the Cloud project) |

Then submit for **brand verification**. Because the app requests the restricted `drive` scope (not `drive.file`), serving users beyond the OAuth consent screen's test-user list also needs Google's separate **restricted-scope verification** plus an annual **CASA** security assessment — see [../backend/README.md](../backend/README.md#7-operations).

### Branded sign-in (make the consent screen say "DriveTag AI", not the Supabase domain)

"Continue with Google" goes through Supabase's own domain, so Google's consent screen shows *that* domain until both the domain and the brand are verified. The Drive-permission screen (the second Google prompt, for Drive access) already goes through the backend at `api.drivetag-ai.com`, so it's unaffected.

1. **Supabase custom domain.** Requires a paid Supabase plan plus the Custom Domain add-on. Supabase dashboard → Project Settings → Custom Domains → enter `auth.drivetag-ai.com`; it shows the exact `CNAME` (host `auth`) and `TXT` (host `_acme-challenge.auth`) records to add in Namecheap. Then verify and activate — the old `ckskwjtjydaqewwojsfj.supabase.co` address keeps working through the switch.
2. **Register the new callback with Google.** Cloud Console → Credentials → the OAuth client → Authorized redirect URIs → add `https://auth.drivetag-ai.com/auth/v1/callback` (keep the existing Supabase-domain one too, until the cutover is confirmed).
3. **Point the frontend at it.** Set `VITE_SUPABASE_URL=https://auth.drivetag-ai.com` in `frontend/.env` and in Vercel's Production environment variables, then redeploy. No code change is needed — `src/lib/supabase.ts` already reads `VITE_SUPABASE_URL` (verified: `createClient(supabaseUrl?.startsWith('http') ? supabaseUrl : 'https://placeholder.supabase.co', ...)`).
4. Submit for brand verification per [above](#google-oauth-branding--verification) — until approved, Google keeps showing the domain instead of the app name and logo.

---

## Routes & project structure

### Routes

| Path | Access | Purpose |
|---|---|---|
| `/` | public | Landing — product, pricing |
| `/login` | public | Google sign-in |
| `/plans` | public | Family and plan comparison. `?family=images\|documents\|complete` deep-links a family (`FamilyPicker`); the legacy `#documents` anchor still works and pre-selects Documents |
| `/beta` | public | Closed-beta sign-up. `POST /api/beta/signups` — name, the Google account email they'll sign in with, optional work type and weekly volume, and an **unticked** consent box. States the two things testers must know up front: the "Google hasn't verified this app" screen, and the weekly Drive reconnect. Free-plan numbers come from `GET /api/plans`, never hard-coded |
| `/privacy`, `/terms`, `/refunds`, `/cookies`, `/data-deletion` | public | Legal pages ([Pricing UI, cookie consent & analytics, legal pages](#pricing-ui-cookie-consent--analytics-legal-pages)) |
| `/onboarding` | protected | 5-step stepper (Connect Drive → What to sort → Raw folder → Sorting → Go live) that creates the first work process, of either kind |
| `/dashboard` | protected | Per-process cards (with a kind badge), per-kind usage meter, activity feed, account |
| `/connect` | protected | Where the backend's `GET /api/auth/google/callback` redirects; claims the parked Drive grant |
| `/processes/new`, `/processes/:id` | protected | Work process editor. `/processes/new` opens with an images-or-documents kind picker (`ProcessKindPicker`); once a process is saved, its kind is fixed and the editor shows it as a read-only badge (`ProcessKindBadge`) instead |
| `/checkout/success` | protected | Where Lemon Squeezy returns a buyer after payment. Confirms the purchase from `GET /api/me` and prints [the receipt](#the-printed-receipt) — it **never reads the query string** ([Checkout](#checkout-what-the-frontend-owns)) |

`ProtectedRoute` (`src/components/ProtectedRoute.tsx`) redirects signed-out visitors to `/login`. Auth state comes from `AuthContext` (`src/contexts/AuthContext.tsx`), backed by real `supabase.auth.signInWithOAuth({ provider: 'google' })` / `signOut()`.

### Structure

```
src/
├── main.tsx                     React root (StrictMode); imports self-hosted font CSS
├── App.tsx                      routes, skip-to-content link, RouteAnalytics, BlobBackground, SiteFooter
├── index.css                    Tailwind 4 @theme design tokens
├── contexts/AuthContext.tsx     Supabase session + Google sign-in/out
├── components/
│   ├── ProtectedRoute.tsx
│   ├── RouteAnalytics.tsx       Vercel Analytics: explicit route tracking, URL redaction, consent gate
│   ├── CookieConsent.tsx        bottom consent banner
│   ├── SiteFooter.tsx           legal links, "Cookie settings", support email
│   ├── TagFlowIllustration.tsx, DocumentFlowIllustration.tsx, PageCapIllustration.tsx, MemoryDemo.tsx
│   │                            animated marketing illustrations (MemoryDemo alternates an image and a document each loop)
│   ├── ui/                      Button/ButtonLink, Card, Modal, ConfirmDialog, TextField/TextArea, Switch,
│   │                            ProgressBar, Logo, Skeleton/PageLoader, AnimatedNumber, BlobBackground
│   ├── drive/                   FolderBrowser (breadcrumbs, search, new folder), FolderPickerField
│   ├── processes/               ProcessForm, ProcessKindPicker/ProcessKindBadge, processDraft (per-kind defaults,
│   │                            reserved tag keys, template validation) + destination, naming-template, tag-field
│   │                            and instruction editors
│   ├── billing/                 FamilyPicker, PlanGrid/PlanCard, TopupPacks (image + document packs),
│   │                            DocumentsExplainer, LandingPricingSection, TransparencyNote, UsageMeter, planFeatures,
│   │                            ReceiptPrint (the printed receipt on /checkout/success)
│   └── dashboard/                useDashboardData polling + Account/Sorting/Usage/Process/Connection/Stats/Activity
│                                 cards, each kind-aware (badges, per-kind credits, activity kind filter)
├── hooks/                       usePressMotion, useReveal, usePlans, useDocumentTitle
├── lib/
│   ├── supabase.ts               anon-key client (PKCE flow)
│   ├── api.ts                    typed backend client (Bearer token, readable network/CORS errors, field-level error details)
│   ├── consent.ts                 analytics consent storage + change events
│   ├── lemonSqueezy.ts            lazy lemon.js overlay loader + the pending-checkout sessionStorage marker
│   ├── filename.ts                naming-template mirror of backend/src/utils/filename.js for the live preview
│   ├── gsap.ts                    plugin registration + reduced-motion queries
│   └── format.ts, messages.ts, confetti.ts
└── pages/
    ├── Landing, Login, Plans, Beta, Onboarding, Dashboard, Connect, ProcessEditor, CheckoutSuccess
    └── legal/                    Privacy, Terms, Refunds, Cookies, DataDeletion, LegalPage (shared layout), links.ts
```

---

## Rolling deploys: tolerating an older backend

Vercel and this backend deploy from the same push but as two separate services, and Vercel usually finishes first — so for a few minutes after every push, the new frontend can be talking to the *previous* backend. `src/lib/api.ts` normalizes around that gap instead of crashing or showing broken UI:

- `withKind()` defaults a process's `kind` to `'image'` when a `GET /api/processes` response omits it.
- `withKindUsage()` fills in `usage.images`/`usage.documents` from the legacy flat fields (`freeUsed`/`freeLimit`/…) when `GET /api/me` doesn't return them yet, and defaults `plan.family`/`freeDocuments`/`monthlyDocuments`.
- `withPlanFamilies()` does the same for `GET /api/plans`: empty `families`/`documentPacks` arrays and sensible `fileLimits` defaults when the backend predates them, derives `plan.family`/`plan.tier` from the plan id when they're missing, and defaults `pricesIncludeTax` to `false` and `merchantOfRecord` to `null`.
- The checkout release's `GET /api/plans` additions normalize the same way, and **both default to `false` on purpose**: `checkoutEnabled` → `false`, and every plan's and pack's `purchasable` → `false`. A backend that predates checkout therefore keeps every buy button on "Coming soon" rather than offering a purchase it can't fulfil. Fail closed, always, for anything involving money.
- The same rule covers the beta release's `/api/me` additions: `admin` → `false`, `beta` → `{tester: false, discountPercent: 0, discountCode: null}`, `googleAppTesting` → `false`, `driveConnectedAt` → `null`. The live backend serves all of them now, so these fallbacks are dormant — they exist for the next few minutes of the *next* deploy, when a backend without them is briefly the one answering.
- `lib/messages.ts`'s `errorMessage()` catches the sharper failure mode too — a route that doesn't exist at all yet (a 404 whose message starts with `"No route for"`) — and shows "DriveTag is updating. Refresh in a minute." instead of a raw error.

**The public beta sign-up is a special case, because on an older backend it doesn't 404.** `POST /api/beta/signups` is a *public* route mounted before `accountRouter`; a backend that predates it has nothing there, so the request falls through to `accountRouter`'s `router.use(requireAuth)` and comes back **401 `Missing bearer token`** — an auth error for a form that was never meant to need auth. Observed against the then-deployed backend on 2026-09-20, before this release went out. So `pages/Beta.tsx` keeps `const AUTH_SHAPED = new Set([401, 403, 404, 405])` and treats any of those statuses from that endpoint as "this server predates the route", showing:

> Beta sign-up isn't live on this server yet. Try again in a few minutes, or email support@drivetag-ai.com and we'll add you by hand.

Never let the raw "Missing bearer token" reach a signed-out visitor on a public form — it reads as "you're logged out", which is wrong and unactionable. Keep the fallback naming a human address, so a tester who hits the gap is still reachable. `production` now carries the route, so the path is dormant — but keep it: the same gap reopens on every future deploy of a new public endpoint. The Lemon Squeezy release adds none — `POST /api/checkout` is behind `requireAuth`, and the webhook is server-to-server — so this remains specific to `/beta`.

Every normalizer's fallback is the literal shape the previous release's API actually served, not a guess — keep these when adding the next new field for the same reason.

---

## Work processes

A work process's **kind** — `image` or `document` — is chosen once, when it's created, and never changes afterwards; the backend rejects a `PUT` that tries to change it.

- **`ProcessKindPicker`** (`components/processes/ProcessKindPicker.tsx`) is two large radio cards ("Images" / "Documents", each with its supported-file-types blurb), shown on `/processes/new` and in onboarding's "What to sort" step. **`ProcessKindBadge`**, exported from the same file, replaces it once a process exists: a read-only pill plus a note that a process can't switch kinds.
- **Per-kind defaults and tokens** live in `components/processes/processDraft.ts`, mirroring `backend/src/utils/processValidation.js` and `backend/src/utils/filename.js`:
  - `DEFAULT_TEMPLATE_BY_KIND`: `{destination}_{subject}` for images, `{type}_{organization}_{topic}` for documents.
  - `TEMPLATE_TOKENS_BY_KIND` (from `lib/filename.ts`) gates which `{token}` the naming-template editor and its live preview accept; a token from the other kind is rejected with a hint naming that kind's own tokens.
  - `DESTINATION_IDEAS_BY_KIND` and `TAG_FIELD_IDEAS_BY_KIND` give the destination list and tag-field list different one-click starting points per kind (e.g. images suggest "Logos"/"Product shots"; documents suggest "Invoices"/"Contracts").
  - `RESERVED_TAG_KEYS_BY_KIND` reserves a tag key only against the process's **own** kind's tokens (plus `tag`, `tags`, `ext`, `unsorted`, `fields`) — not the union of both kinds', so an existing image process that already has a tag keyed `type` or `topic` isn't locked out.
- **Onboarding** (`pages/Onboarding.tsx`) is a 5-step stepper: **Connect Drive → What to sort → Raw folder → Sorting → Go live**. "What to sort" is the new step, showing `ProcessKindPicker`; the destination-row examples and plan-note copy on later steps switch with the chosen kind (`EXAMPLES_BY_KIND`, `kindWord()`).
- **`ProcessForm`** (`components/processes/ProcessForm.tsx`) shows `ProcessKindPicker` only while creating (`draft.kind` still unset); an existing process shows `ProcessKindBadge` instead, and every label on the page (naming hints, destination examples, tag-field suggestions) reads from the process's own kind.

---

## Dashboard

- **Per-process kind badge.** `ProcessCard` (`components/dashboard/ProcessCard.tsx`) always shows a first badge for the process's kind ("Images" or "Documents"), alongside Paused/Over plan limit/Busy badges as they apply.
- **Per-kind credits.** Every dashboard surface that talks about "how many images/documents are left" reads the process's own kind's balance (`kindUsageOf(usage, process.kind)` from `lib/messages.ts`), not a flat image count: the "Organize now" confirm dialog when the waiting count exceeds the remaining balance, the "Out of ⟨kind⟩ credits" note under a card, and `UsageCard`/`UsageMeter` on the dashboard header.
- **Exhausted-kind notes.** `UsageCard` and `UsageMeter` compute `anyKindExhausted(plan, usage)` (`components/billing/planFeatures.ts`) and show a rose-toned banner the moment either balance hits zero — a mixed account (e.g. out of images, plenty of documents left) still sorts the kind that has credits; the banner and the per-process note both say so.
- **Activity feed.** `ActivityList` (`components/dashboard/ActivityList.tsx`) shows a kind icon (image/document) next to each filename, renders document rows' chips from `type`/`topic`/`organization`/`document_date` instead of images' `genre`/`subject`/`style`, and — once an account's activity actually mixes both kinds — adds an "All kinds / Images / Documents" filter row alongside the existing per-process filter.
- **Account.** `AccountCard` → **"Delete account"**: typed `DELETE` confirmation → `api.deleteAccount()` → `DELETE /api/me` → signs out (falling back to a local-only sign-out if the server call fails, since the account is already gone by then).
- Each process card shows live **"N AI sorting"**, from `status.workers[processId]`, and **"Up to N AI at once on your plan"** from `plan.aiPerProcess`.
- **Drive-expiry warning.** While `me.googleAppTesting` is true (the Google OAuth app is in Testing status), Google expires Drive refresh tokens after 7 days. From day 5 after `me.driveConnectedAt`, a warning card sits above the fold with a **Reconnect Drive** link to `/connect`; before that the fact is stated quietly in `ConnectionCard`. A null `driveConnectedAt` renders nothing. Set `GOOGLE_APP_TESTING=false` on the backend once verification is granted, or every user is warned about an expiry that no longer applies.
- **Admin only.** `BetaSignupsCard` renders solely when `me.admin` is true: the closed-beta sign-up list, **Copy pending emails** (for pasting into Google Auth Platform → Audience → Test users), a per-row "Added" toggle, a CSV download and a counter against Google's 100-tester cap. `me.admin` decides *rendering* only — every `/api/beta/signups*` route re-checks `ADMIN_EMAILS` server-side, so hiding the card is never the security boundary.

---

## Design system, animation, accessibility

### Design system

Tokens live in `src/index.css` under Tailwind 4's `@theme` — use these rather than raw Tailwind palette colors:

- **Neutrals:** `canvas` `#faf8ff`, `ink` `#25204a`, `ink-soft` `#6b6590`, `line` `#e9e3ff`
- **Accents,** each with a `-soft` tint: `lavender` (+ `lavender-deep`), `periwinkle`, `butter`, `sage` (+ `sage-deep`), `rose` (+ `rose-ink`)
- **Shadows:** `shadow-soft`, `shadow-lift`
- **Fonts:** Fredoka (`font-display`, headings) and Nunito (`font-sans`, body) — see [Pricing UI, cookie consent & analytics, legal pages](#pricing-ui-cookie-consent--analytics-legal-pages) for how they're loaded

Full rationale: [../CLAUDE.md](../CLAUDE.md).

### Animation

GSAP, imported from **`src/lib/gsap.ts`** — never from `gsap` directly. That module registers `useGSAP`, ScrollTrigger, SplitText, Flip and DrawSVGPlugin exactly once, sets project defaults (`ease: 'power3.out'`, `duration: 0.6`), and exports `MOTION_OK` / `REDUCED_MOTION`.

- **Every animation lives inside `gsap.matchMedia()`** so `prefers-reduced-motion` users get the final state instantly instead of a tween.
- **`@gsap/react` doesn't revert between dependency changes by default.** Pass `revertOnUpdate: true` to `useGSAP` whenever a dependency-driven effect starts looping or stateful animations stack up.

GSAP guidance for Claude Code lives in `../.claude/skills/gsap-*` — third-party files pinned by `skills-lock.json`; update with `npx skills update`, don't hand-edit.

### The printed receipt

**Built** (`components/billing/ReceiptPrint.tsx`), as part of the uncommitted checkout release. The owner asked for the checkout moment to feel like a real receipt printing — fully animated, fully playful, still in the Lavender-garden language. Everything below is what the component does today, and the rules at the end are the contract it must keep.

**Where it goes.** Payment itself happens on Lemon Squeezy's page or in the `lemon.js` overlay — we own no payment screen, and the plan card is the pre-payment summary. The receipt lives on the **return screen after payment succeeds** (`/checkout/success`, which the owner must set as each product's redirect URL in Lemon Squeezy — nothing in this repo sets it, and without it a buyer lands on Lemon Squeezy's own thank-you page and never sees the receipt) — a receipt that prints *before* you have paid would be a lie. It renders only once `CheckoutSuccess` has confirmed the purchase from `GET /api/me`; the "confirming" and "still confirming" states show no receipt at all.

**Props are pre-formatted, always.** `title`, `lines` (label/value pairs), `total`, optional `note` — `ReceiptPrint` never computes or formats a currency value. `CheckoutSuccess`'s `buildReceipt()` does that from `GET /api/plans` (`formatPrice()`), so there is exactly one place where money is turned into text.

**The object:**

- A printer slot: a squat rounded bar in `bg-periwinkle-soft` with an inner `shadow-soft` lip, the paper emerging from under it.
- The paper: `bg-white`, `rounded-t-2xl`, a torn bottom edge drawn as an SVG zig-zag path filled `canvas`, so it reads as paper against the page rather than a rectangle with a notch.
- Contents are **real semantic HTML**, not artwork: a `<dl>` of billing period, subtotal, the "VAT/sales tax — added by Lemon Squeezy" line, and the total. `tabular-nums` so the columns line up like a real till roll.
- A stamp: the DriveTag tag mark with "PAID" beneath it, in `sage` on `sage-soft`, set at a jaunty −8° (`rotate-[-8deg]`).
- **The stamp sits in a reserved gutter, not on top of the paper.** It lives inside the footer row, which carries `pr-24` for it, and is `absolute` only *within that row*. It was originally positioned over the whole sheet and landed squarely on the right-hand value column — a decorative graphic covering the subtotal figure. A gutter cannot overlap a value however long the numbers or the note get; a z-index or an offset would only move the collision. Checked at 375px too.

**The timeline.** One `gsap.timeline({ paused: true })`, stored in a ref so the "Print again" button can `restart()` it:

1. **Slot judder** — `scaleY: 1.08` on the slot, `duration: 0.12`, `yoyo: true`, `repeat: 1`. The machine waking up.
2. **Feed** — the paper reveals downward via `clipPath: 'inset(0 0 100% 0)'` → `'inset(0 0 0% 0)'`, `duration: 1.1`, **`ease: 'none'`**. Linear is not laziness here: a real printer feeds at constant speed, and easing it makes it read as a slide-in rather than a print. `clipPath` is compositor-friendly, so this is not the layout-thrashing that animating `height` would be.
3. **Lines** — each `<dl>` row `gsap.from({ autoAlpha: 0, y: -4 })` with `stagger: 0.08`, timed `'<0.1'` so rows appear as the paper passes them. A 1px `x` jitter per row, derived from the row index rather than randomness, gives it the mechanical wobble without breaking determinism.
4. **Total** — a beat, then the total row scales from `0.94` with `back.out(1.7)`.
5. **Stamp** — `scale: 2.2 → 1`, `rotation: -12 → 0`, `autoAlpha: 0 → 1`, `back.out(1.7)`, `duration: 0.35`; a soft ink-spread underneath (`scale: 0.8 → 1.15`, `autoAlpha: 0.5 → 0`) sold as one beat.
   **Why it lands on `0` and not on `-8`:** Tailwind v4 emits a *standalone* `rotate` CSS property for `rotate-[-8deg]`, not a `transform: rotate(...)`. A standalone `rotate` **composes** with the `transform` GSAP writes instead of being replaced by it, so a GSAP `rotation` value here is **relative to the class's resting −8°**. Tweening to `-8` stacked the two into −16° under motion while reduced motion rested at −8 — the same element resting at two different angles depending on a media query. Landing on `0` makes both rest states the identical −8°. The rule generalizes: with Tailwind v4, check whether a utility emits `rotate`/`scale`/`translate` standalone before giving GSAP an absolute value for the same axis.
6. **Tear-off** — the whole receipt drops `y: +6` and settles with `elastic.out(1, 0.5)`.
7. One short burst from the existing `lib/confetti.ts` (24 pieces), fired through a `hasCelebrated` ref so it happens **once per mount** — "Print again" replays the paper, never the confetti — and never on a failure screen.

**Rules this must not break.**

- GSAP comes from `src/lib/gsap.ts`; the whole timeline lives inside `gsap.matchMedia()` and `useGSAP` with `revertOnUpdate: true` and a `scope` ref.
- Under `REDUCED_MOTION`, build **no timeline at all**: the component's plain JSX *is* the finished receipt — paper fully visible, stamp placed at rest, total at full size — so there is nothing to skip to, and the `MOTION_OK` branch sets its own hidden start values before animating out of them. The static end-state is the reduced-motion design, not a faded-down version of the animation. "Print again" is hidden there too (`canReplay`), because there is nothing to replay.
- Transform aliases, `autoAlpha` and `clipPath` only — never `width`, `height`, `top` or `left`.
- The animation is decoration around real content. The `<dl>` is readable and announced whatever the motion settings; the slot, torn edge, ink-spread and stamp graphic are `aria-hidden`, and "Paid" is also present as text.
- **Nothing is gated behind the animation.** The receipt is confirmation of a payment that already happened; the "Back to dashboard" button is focusable and clickable from the first frame.
- Design tokens only — `periwinkle-soft`, `sage`, `sage-soft`, `sage-deep`, `ink`, `ink-soft`, `line`, `canvas`. No raw Tailwind palette colours.

### Accessibility conventions

- **Skip link.** `App.tsx` renders a "Skip to main content" link targeting `main#main-content` on every page.
- **Per-route titles.** `hooks/useDocumentTitle.ts` sets `document.title` to `"<title> · DriveTag AI"`; `LegalPage` does the same inline.
- **Live regions stay mounted.** `aria-live="polite"` regions (loading/status text, activity updates) are persistent in the DOM, not conditionally mounted, so screen readers reliably announce their changes.
- **Motion-reduce on every spinner.** Every `animate-spin` icon carries `motion-reduce:animate-none`.
- **Contrast.** Small text and links use `text-ink-soft` / `text-ink` with an underline — **not** `text-lavender-deep`, which is 2.94:1 on white and fails AA. In the code, `text-lavender-deep` is used only on `aria-hidden` decorative icons, never on readable text.
- **Form field borders** use `border-ink-soft/80` — the `border-line` token is too faint for an input boundary.
- **Icon-only buttons** need an `aria-label` and a target of at least 24px (e.g. Modal's close button).
- **Onboarding's Connect-Drive step** explains what Drive access is used for and links `/privacy#google-user-data`.
- **A consent link must not cost you the form.** The Privacy Policy link inside `/beta`'s consent checkbox label opens in a new tab (`target="_blank" rel="noreferrer"`) with a visually-hidden `(opens in a new tab)` after the link text. Same-tab navigation would discard a half-completed sign-up — asking someone to consent and then destroying their work when they go read what they're consenting to. New-tab is the exception here, not the house style: announce it whenever you use it, and only for "read this before you agree" links.
- **Vendor-neutral copy.** The UI never names the AI vendor or model — "advanced AI" only.

---

## Marketing

- **"What DriveTag sorts"** — a Landing page section (`pages/Landing.tsx`, `#sorts`) added for this release, pitching images and documents as one flow: a two-column "Now it reads documents too" panel next to `DocumentFlowIllustration`, then side-by-side "Images"/"Documents" example cards (before → after filename, with a destination chip), then `PageCapIllustration`. Copy reads the page cap and character cap from `GET /api/plans`' `fileLimits` (`pagesRead`, `textChars`) rather than hard-coding "5 pages" — the same rule as [Pricing UI](#pricing-ui-cookie-consent--analytics-legal-pages).
- **`DocumentFlowIllustration`** and **`PageCapIllustration`** (`src/components/`) are new animated SVG illustrations, alongside the existing `TagFlowIllustration`; all three follow the [Animation](#animation) rules — GSAP from `lib/gsap.ts` only, wrapped in `gsap.matchMedia()` so reduced-motion users get the end state instantly.
- **`MemoryDemo`** (`src/components/MemoryDemo.tsx`) — the "your file is never stored" animated demo — now alternates between an image and a document each loop (a `kind` variable flipped in the timeline's `onRepeat`), swapping its icon and tag chips (`IMAGE_TAGS`/`DOCUMENT_TAGS`) without rebuilding the timeline.
- **Meta/OG tags** (`index.html`) mention both images and documents and the Zero-Retention promise: `description`, `og:title`/`og:description`, `twitter:title`/`twitter:description`. Keep these in sync with the Landing page's actual pitch.

---

## Pricing UI, cookie consent & analytics, legal pages

### Pricing UI

Every price, limit and feature line on `/plans` and the Landing page is driven by `GET /api/plans` (`backend/src/config/plans.js`), via `hooks/usePlans.ts` — **never hard-code a price or limit in the frontend.**

- **Prices are tax-exclusive.** `pricesIncludeTax: false` in the payload drives an "Excludes VAT/sales tax" line under every price (`PlanCard`, `TopupPacks`) and the fuller sentence in `TransparencyNote`, which names Lemon Squeezy as the Merchant of Record that adds the buyer's local rate at checkout. Render that from the flag, not from a hard-coded assumption.
- **Beta pricing** (`BetaPriceNote`, plus `beta?: BetaPricing | null` on `PlanGrid`/`PlanCard`) only appears for a signed-in tester whose `/api/me` carries a percent and a code. The regular price is struck through with a visually-hidden "Regular price … Beta price" reading order, so a screen reader can tell the two apart. A signed-out visitor never sees any of it, and the discount itself is redeemed in Lemon Squeezy's checkout, not applied by us.

- **`FamilyPicker`** (`components/billing/FamilyPicker.tsx`) is a single-choice, accessible segmented control — native radio inputs in a `fieldset`, so arrow-key navigation and screen readers come for free — for the three paid families (Images / Documents / Images + Documents). `/plans` keeps the chosen family in the URL (`?family=images|documents|complete`, `useSearchParams`) so a link can land directly on one; the landing page's copy (`LandingPricingSection.tsx`) keeps its own `useState` instead, since it's a smaller, self-contained picker. The legacy `#documents` anchor still works: `Plans.tsx` reads `window.location.hash === '#documents'` once on mount and pre-selects Documents.
- **`PlanGrid`/`PlanCard`** (`components/billing/PlanGrid.tsx`, `PlanCard.tsx`) render Free plus the selected family's Creator/Studio/Enterprise tiers (`plansForFamily()` in `planFeatures.ts`). An Images + Documents card shows a savings line — `bundleSavings()` compares it against buying that tier's Images and Documents plans separately, and returns `null` (nothing shown) unless the saving is genuinely positive, never a fabricated percentage.
- **Prices** are USD placeholders, formatted by `formatPrice()` (`components/billing/planFeatures.ts`).
- **Yearly "N months free"** is computed from the monthly vs. yearly price (`monthsFree()`), not stored as copy. Enterprise tiers are monthly-only, so they show no yearly toggle.
- **"Recommended" badge** comes from `plan.popular` in the API payload (`PlanCard.tsx`: `const featured = plan.popular`) — the Studio tier of each family. It deliberately says "Recommended," not "Most popular" — nobody has paid yet, so a popularity claim would be fake social proof.
- **Feature lines**: `processesFeature()`, `aiWorkersFeature()`, and `allowanceFeatures()` — the last shows only the allowance(s) a plan actually includes (`imagesFeature()`/`documentsFeature()`), so a single-kind plan doesn't show "0 documents".
- **AI worker counts come from `plan.aiPerProcess`, always.** `aiWorkersFeature()` on the plan cards and `ProcessCard`'s "Up to N AI at once on your plan" both read the API payload — nothing in `src` hard-codes a number (verified 2026-09-20; the only digits in `planFeatures.ts` are illustrative strings in doc comments). The values are Free 1 / Creator 2 / Studio 3 / Enterprise 10, and they change by editing `backend/src/config/plans.js` and redeploying the backend, with no frontend release at all. They are a throughput knob, not a cost one — every file costs the same single AI call however many workers pull it — so don't write copy that implies a bigger plan sorts *more*, only that it sorts *faster*.
- **Packs of both kinds.** `TopupPacks.tsx` renders either an image-pack or a document-pack list via a `unitLabel` prop ("image"/"document") and shows a per-unit price via `perUnitPrice()`; `/plans` renders both lists side by side from `plans.topupPacks` and `plans.documentPacks`.
- **`DocumentsExplainer`** (`components/billing/DocumentsExplainer.tsx`) replaced the old, "Coming soon" `DocumentPricingSection` — documents are live, so this explains how one is counted (at most `fileLimits.pagesRead` PDF pages or `fileLimits.textChars` characters = one credit; oversized files are skipped, not charged; the `fileLimits.editingGraceMinutes` grace for Google-native files) instead of previewing a price. It renders full at `/plans#documents-explainer` and `compact` (one paragraph) on the landing page.
- **`LandingPricingSection`** (`components/billing/LandingPricingSection.tsx`) is the landing page's `FamilyPicker` + compact `PlanGrid` + compact `DocumentsExplainer` + compact `TransparencyNote`, pulled into its own component because it needs its own family `useState`.
- **`UsageMeter`** (`components/billing/UsageMeter.tsx`) and the dashboard's `UsageCard` render one row per kind (`KindRow`), each with its own progress bar, "N of M used" line, top-up-balance chip, and refill date; a kind the plan doesn't include at all shows "Not included in your plan · add a pack or switch plan" instead of a bar. `kindIncluded()`/`kindLimit()`/`anyKindExhausted()`/`kindUsageSummary()` in `planFeatures.ts` drive this and are reused by the dashboard's `ProcessCard`.
- **`TransparencyNote`** (`components/billing/TransparencyNote.tsx`) is the required no-hidden-fees note next to any price display: tax/VAT calculated at checkout, auto-renewal and cancellation terms, no overage fees, and a link to `/refunds`.
- **Purchase buttons are conditional, never unconditionally disabled.** A plan card shows "Choose plan" (and a pack "Buy pack") only when that item's `purchasable` is true in the payload *and* the visitor is signed in; a purchasable item seen signed-out shows "Sign in to subscribe" / "Sign in to buy" linking to `/login`, because the server can't attribute a payment without a user id. Anything not purchasable — every plan while `checkoutEnabled` is false, or a single plan whose variant the owner hasn't configured — falls back to the disabled "Coming soon" button with the `PAYMENTS_PENDING_NOTE` tooltip (on the wrapper `<span>` as well as the button, since some browsers skip titles on disabled controls). Free is never purchasable; its button goes to `/dashboard` or `/login`. The deployed backend predates both fields, so `api.ts` defaults them to `false` and "Coming soon" is what a visitor sees today — that is the fallback doing its job, not a hard-coded state.
- **Nothing may advertise "launching soon" beside a working buy button.** `/plans`' header line and the "Can I cancel anytime?" FAQ answer both branch on `plans.checkoutEnabled`: "Paid plans launch soon · Free works today" and "there's nothing to pay for or cancel yet" only render while checkout is off. With it on, the FAQ explains cancelling from the Lemon Squeezy receipt or by emailing support instead. Any new copy about payments gets the same gate.

### Checkout: what the frontend owns

Built, uncommitted, never exercised against a live store. **We never build a card form.** Lemon Squeezy is the Merchant of Record, and payment happens **on their page** (`https://<store>.lemonsqueezy.com/checkout/buy/<variantId>`) or in a **`lemon.js` overlay** — the same checkout rendered over our own page, so the buyer never visually leaves `drivetag-ai.com`. No API key is used anywhere; a plain buy link needs none, and the REST `POST /v1/checkouts` call (bespoke checkouts, per-customer pricing) isn't used.

**The link is built server-side.** A buy button calls `api.createCheckout({ item, billing })` → `POST /api/checkout`, and gets back `{ url }`. The buyer's Supabase user id is appended there as `checkout[custom][user_id]=<id>` — that parameter is the *only* thing tying a payment back to a DriveTag account, which is why the frontend never assembles the URL itself and never lets a user supply the id. `503 checkout_unconfigured` and `400 unknown_item` both surface through `errorMessage()` in the card's `aria-live` region. Don't cache or share a checkout URL once opened: Lemon Squeezy converts it to a single-use `/checkout/?cart=` address.

**`lib/lemonSqueezy.ts` — the overlay, lazily.**

- `openCheckout(url)` injects `https://assets.lemonsqueezy.com/lemon.js` **on first click only**: never on page load, never in a route bundle's import graph at module scope, and never for a signed-out visitor (they see "Sign in to subscribe" instead). A third-party payment script should not be fetched by someone reading the pricing page.
- The script promise is cached, so it loads at most once per page load, and cleared on failure so a later click can retry instead of the page remembering itself as permanently broken.
- **Three ways out, one fallback:** a script `onerror`, a script that loads without exposing `window.LemonSqueezy.Url.Open`, or nothing ready within `READY_TIMEOUT_MS` (4 s) all fall through to `window.location.assign(url)` — the plain hosted checkout. A buyer must never be stuck staring at a button that did nothing; losing the overlay costs us a nicety, losing the sale costs money.
- **`drivetag-pending-checkout`** (sessionStorage, via `rememberPendingCheckout(item)`) records which plan or pack id the buyer just left to pay for. See the confirmation problem below. Every access is try/caught — storage throws in private mode and with site data blocked, and that must never stop someone buying; `/checkout/success` then falls back to the before/after comparison.

**`/checkout/success` — confirming without trusting the URL.**

- It **never reads the query string.** A redirect back from a payment page is attacker-composable; the only trustworthy statement that a payment happened is our own backend's, so the page polls `GET /api/me` (every 2 s, up to 30 s) and builds [the receipt](#the-printed-receipt) from that plus `GET /api/plans`.
- **A before/after diff alone cannot work.** `POST /webhook/lemonsqueezy` is a server-to-server call and routinely lands *before* the buyer's browser gets back, so the very first `/api/me` read already contains the purchase — every later delta is zero, and a baseline-only check leaves a paying customer on "confirming" forever. Fixed by matching `me.plan.id` against the recorded `drivetag-pending-checkout` item, **checked before the baseline is taken and on every poll**. Packs still use the top-up-balance delta, since a pack doesn't change the plan id. Verified in a browser with `/api/me` already showing the purchased plan on the first poll: the receipt appears immediately.
- The recorded item is used **only to recognise** the purchase, never to display anything, and only if it matches a real plan id from `GET /api/plans`. A tampered value can at worst delay confirmation; it can never put a plan name or a number on the receipt. It's cleared once confirmed, so a later visit can't re-confirm against a stale item.
- **On timeout the page does not claim failure** — "Your payment may still be processing — it isn't lost", the plan updates automatically, plus a "Check again" button, a link back to the dashboard and `support@drivetag-ai.com`. "Check again" keeps the original baseline so a webhook landing after the timeout is still detected as a change.
- A plan-id change is compared against the baseline rather than against the literal string `free`: an already-paying customer topping up must never be declared "confirmed" just because their plan was never free.

**Not yet built:** yearly billing in the UI. Every card sends `billing: 'monthly'` and the receipt prices off `price.monthly` to match, so the yearly figure on the card is currently copy, not a purchasable option. See [Claude's next tasks](#claudes-next-tasks-code--ask-for-these).

What the owner must set up before any of this does anything is in [Owner's next tasks](#owners-next-tasks-only-you-can-do-these).

### Cookie consent & analytics

- `CookieConsent.tsx` (rendered from `RouteAnalytics.tsx`) is a bottom, non-blocking banner shown once on first visit and again from the footer's "Cookie settings" button.
- Consent is stored via `lib/consent.ts` under the localStorage key **`drivetag-analytics-consent-v1`**, with two equal-weight choices: "Allow analytics" / "Only necessary" — never pre-ticked, never re-asked once a choice is stored.
- `@vercel/analytics`'s `<Analytics>` component only mounts once consent is `'granted'`, so no analytics script loads or sends before that.
- Revocation takes effect immediately: `beforeSend` reads consent through a `ref` (not a stale closure) and returns `null` when consent isn't granted, even though the Vercel script's own registration outlives the component's unmount.
- Reopening the banner from "Cookie settings": **Escape** closes it without changing the stored choice — a keypress must never silently flip a decision the user already made. The very first, unprompted view has no such binding.
- `RouteAnalytics.tsx` reports an explicit `route`/`path` on every route change (not just relying on the script's own `history.pushState` hook, which misses `<Navigate replace />` redirects such as login → dashboard), and its `beforeSend` redactor strips the URL hash and every query param except `utm_*` — OAuth returns carry Supabase tokens and `code`/`state` in the URL. Don't replace it with a bare `<Analytics />`.
- **Every key the app writes to browser storage must appear in the Cookie Policy** (`pages/legal/Cookies.tsx`), whether it's a cookie or not — that page's list is what a visitor and Google's reviewers are told. Currently listed: `drivetag-analytics-consent-v1`, `drivetag-beta-banner-v1` and `drivetag-pending-checkout`, plus Supabase's own auth items. The first two are localStorage; `drivetag-pending-checkout` is sessionStorage, which the page says so that "until you close the tab" is not a surprise.
- **Change any of this whenever data handling, providers, storage keys or the redaction rule change** — the Cookie Policy (`/cookies`) documents the current behavior.

### Fonts

`@fontsource-variable/fredoka` and `@fontsource-variable/nunito` are self-hosted, imported in `main.tsx` (`--font-display` / `--font-sans` resolve to `"Fredoka Variable"` / `"Nunito Variable"`). There are no Google Fonts requests — verified in `index.html` and `main.tsx`; only the weight axis, latin script, is loaded.

### Legal pages

`src/pages/legal/*` (`Privacy`, `Terms`, `Refunds`, `Cookies`, `DataDeletion`), sharing the `LegalPage` layout and `legal/links.ts` for the link list and "Last updated" date. `SiteFooter` (mounted app-wide from `App.tsx`) surfaces all five links, "Cookie settings", and the support email.

- **Operator:** DeltaCo Creatives (Indonesia).
- **Contacts:** `support@drivetag-ai.com` (billing/refunds), `privacy@drivetag-ai.com` (privacy/data).
- **Update these pages whenever data handling, providers, browser storage keys, or refund terms change** — they're the source of truth Google's brand verification and users both rely on.

---

## State & next steps

### Done (live on `drivetag-ai.com`)

- Closed-beta programme: the public `/beta` page, a dismissible landing banner, footer and login links, the admin-only `BetaSignupsCard`, and the day-5 Drive-reconnect warning driven by `me.googleAppTesting`. Verified live: the deployed bundle contains `/beta`, and the form completes end to end against `POST /api/beta/signups`.
- Beta pricing on `/plans` — struck-through regular price, screen-reader reading order, signed-in testers only.
- Tax-exclusive prices everywhere, driven by `pricesIncludeTax: false` from `GET /api/plans` (the live API now serves that flag and `merchantOfRecord`); Lemon Squeezy named as Merchant of Record in `TransparencyNote` and across the legal pages.
- The beta sign-up form survives an older backend (401 handling, above) and survives reading the Privacy Policy (new-tab consent link, above).
- The Supabase key migration: the browser uses an `sb_publishable_` key, the backend an `sb_secret_` key. `VITE_API_URL` is set on Vercel.
- `npx tsc -b` is clean. `npm run lint` reports only the pre-existing `AuthContext` fast-refresh warning.
- ~~Rename the package~~ — `frontend/package.json` is `drivetag-frontend`.

### Built, not committed, not deployed (the checkout release)

Everything here works in the working tree and in a local browser; **the live site still serves the previous release, and no real purchase has ever been made.**

- Buy buttons on `PlanCard` and `TopupPacks`, gated on `purchasable` + signed-in, calling `POST /api/checkout` and opening the `lemon.js` overlay with a plain-redirect fallback ([Checkout](#checkout-what-the-frontend-owns)).
- `lib/lemonSqueezy.ts` — the lazy overlay loader and the `drivetag-pending-checkout` marker.
- The protected `/checkout/success` page: polls `GET /api/me`, confirms by matching the recorded plan id, never reads the query string.
- `components/billing/ReceiptPrint.tsx` — [the printed receipt](#the-printed-receipt).
- `checkoutEnabled` and per-item `purchasable` read from `GET /api/plans`, both normalizing to `false`; `/plans`' "launching soon" header and cancel FAQ now gated on the flag.
- `npx tsc -b` clean, `npm run lint` unchanged, production build succeeds.

### Claude's next tasks (code — ask for these)

1. ~~Add `drivetag-pending-checkout` to the Cookie Policy~~ — **done**; `src/pages/legal/Cookies.tsx` lists it and explains that session storage is cleared when the tab closes.
2. **Yearly billing in the UI.** Every buy button sends `billing: 'monthly'` today and `CheckoutSuccess` prices off `price.monthly` to match, so the yearly price on a card is copy rather than something you can buy. Needs a monthly/yearly control on `PlanCard`, the chosen interval passed to `api.createCheckout()`, and the receipt priced off whichever was bought. The backend already resolves `<planId>-yearly` variants.
3. **Delete the legacy endpoint shims' frontend side** once the backend drops `/api/drive/config`, `/raw-status` and `/organize`. Nothing in `src` should be left calling them. Deliberately kept out of the checkout release so a rollback is unambiguous.
4. **Code-split the bundle.** The production build emits a single ~997 KB JS chunk (`dist/assets/index-*.js`, measured 2026-09-20 with the checkout release in), over Vite's 500 KB warning threshold and up from ~981 KB before it. Route-level `React.lazy` is the natural first cut — `/checkout/success` and the legal pages are obvious candidates, since almost nobody loads them.
5. **Unsaved-changes guard on browser Back** in the process editor. `ProcessEditor.tsx` already guards page unload (`beforeunload`) and in-app links (`guardLinks`), but `BrowserRouter` has no `useBlocker`, so Back/Forward aren't covered.
6. **Dashboard "At a glance" real totals.** The counts cover the latest 50 activity rows (`ACTIVITY_LIMIT`) and the card says so; all-time totals need a backend count endpoint first.
7. **Google Drive Picker widget** — optional upgrade over the current searchable folder list (`components/drive/FolderBrowser.tsx`). Lowest priority; the current browser works.

### Owner's next tasks (only you can do these)

1. **Redeploy the backend** once the worker-tier change is committed, or `/plans` and the dashboard keep advertising the old 3 / 5 / 15. These numbers are served by the API, so they change without a frontend release.
2. **Lemon Squeezy setup.** The frontend and backend code is written and waiting; nothing on screen changes until these exist, because `checkoutEnabled` and every `purchasable` stay `false` while they don't. Run `supabase/migrations/0006_checkout.sql` in the Supabase SQL editor first — the webhook's credit grants and plan changes depend on it, and nothing applies migrations automatically. Create the store, then the products and variants — 9 paid plans, 6 of which also get a yearly price, plus 6 packs = **21 variants** — and **name each variant after its plan or pack id** from `backend/src/config/plans.js` (yearly variants as `<planId>-yearly`); that's what makes the mapping unambiguous. Then set three env vars on DigitalOcean: `LEMONSQUEEZY_STORE` (the store subdomain slug), `LEMONSQUEEZY_VARIANTS` (a JSON map of our id → variant id) and `LEMONSQUEEZY_WEBHOOK_SECRET`. Create the webhook endpoint at `https://api.drivetag-ai.com/webhook/lemonsqueezy` with that signing secret. **No API key is needed** — plain buy links and the overlay don't use one. Exact values and the event list: [../backend/README.md](../backend/README.md) and DeveloperToDo.md.
3. **Make one real test-mode purchase, end to end, before anything goes public.** Every handler is unit-tested; a live card payment through a live store has never happened, and it's the only thing that proves the variant ids, the `user_id` custom field and the webhook all line up. Watch a plan appear on `/checkout/success` and on the dashboard, then refund it and watch the credits come back.
4. **Lemon Squeezy's "Domains" setting is not for this app.** It only re-hosts *their* storefront and checkout pages under your domain, which is why pointing the apex at it briefly took the site down on 2026-09-20 (resolved — see [DNS (Namecheap → Vercel)](#dns-namecheap--vercel)). It's optional; the default `…lemonsqueezy.com` checkout is fine. If you want a branded checkout address, use a subdomain such as `checkout.drivetag-ai.com`, never the apex.
5. **Decide the beta discount** (`BETA_DISCOUNT_PERCENT` / `BETA_DISCOUNT_CODE` on the backend) — `/plans` shows a tester's struck-through price only when `/api/me` carries both, and the code itself is redeemed in Lemon Squeezy's checkout, so it must exist there too.
6. **Confirm Drive watches now register.** Google *domain* verification (Search Console + Cloud) is recorded done — DeveloperToDo.md §4/§7. Check whether `POST /api/drive/watch` now succeeds, and if so move `AUTO_SYNC_INTERVAL_SECONDS` to `0`; until confirmed, sorting stays on the polling fallback. Brand verification, restricted-scope verification and CASA are still open — see [Google OAuth branding & verification](#google-oauth-branding--verification).
7. **Set `GOOGLE_APP_TESTING=true` on the backend now, for the beta.** It isn't set yet, so the day-5 Drive-reconnect warning is currently dormant — testers get no heads-up before sorting silently stops when their Drive connection expires every 7 days. Set it to `true` today; set it back to `false` the day Google grants OAuth app verification, so testers stop being warned about an expiry that no longer applies.

Already handled, kept here because it's easy to re-break: the Supabase key migration is finished on both sides — browser `sb_publishable_`, backend `sb_secret_`. Judge either by its prefix, never by length. `VITE_API_URL` is confirmed set on Vercel; confirm all three `VITE_*` variables exist in every environment scope you build in, Preview included, since a build fails without them (see [Deploying to Vercel](#deploying-to-vercel)).
