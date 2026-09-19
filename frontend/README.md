# DriveTag AI — Frontend

React 19 + Vite 8 + Tailwind 4 + TypeScript. Deployed to Vercel (Root Directory `frontend`) at **https://drivetag-ai.com** — production-ready, live end to end against the real backend.

DriveTag sorts two **kinds** of work process, chosen when a process is created and fixed afterwards: `image` and `document` (PDF, Word, Google Docs/Sheets/Slides, text — added in this release). Plans come in three **families** that share the same three tiers — Images, Documents, and Images + Documents — see [Pricing UI](#pricing-ui-cookie-consent--analytics-legal-pages).

- **[../README.md](../README.md)** — product overview, plans and pricing, the document-sorting cost strategy.
- **[../CLAUDE.md](../CLAUDE.md)** — architecture and the non-obvious design decisions for the whole repo; this doc doesn't repeat that reasoning.
- **[../backend/README.md](../backend/README.md)** — API setup, env vars, database, deployment, operations.

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

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL, used by `src/lib/supabase.ts` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `VITE_API_URL` | Backend base URL, no trailing slash — `src/lib/api.ts` sends every request here |

**Public by design.** Every `VITE_*` value is compiled into the browser bundle. Never put the Supabase `service_role` key or the Google client secret in this file. `VITE_GOOGLE_CLIENT_ID` is not read anywhere in the app — Google sign-in goes through Supabase's provider config, so an old `.env` can drop it without effect.

**Build guards.** `vite.config.ts` throws `Missing VITE_… for this build` if any of the three is unset — deliberate, so a deploy can never silently ship the wrong API address. `npm run dev` still falls back to `VITE_API_URL=http://localhost:3001` when it's unset, so local dev works with only the two Supabase vars.

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
- **Environment Variables** (Settings → Environment Variables, for **Production**): the same three `VITE_*` vars as local dev, with `VITE_API_URL=https://api.drivetag-ai.com`.
- **Build guard:** on Vercel (`VERCEL=1`), `vite.config.ts` additionally refuses to build if `VITE_API_URL` points at `localhost`/`127.0.0.1` — a mistake that once shipped to production.
- **`vercel.json`** rewrites every path to `/index.html`. Without it, every client route (`/login`, `/dashboard`, `/connect`, …) 404s on Vercel — this is exactly what broke production login on 2026-09-17, since fixed.
- **Values are baked in at build time.** Changing a variable in the Vercel dashboard does nothing until you redeploy with **"Use existing build cache" turned off**.
- **Vercel Analytics** must be turned on in the Vercel project dashboard separately — the code (`@vercel/analytics`) is already wired in (see [Pricing UI, cookie consent & analytics, legal pages](#pricing-ui-cookie-consent--analytics-legal-pages)), but no data appears until the dashboard toggle is on.

---

## DNS (Namecheap → Vercel)

Vercel shows **"Invalid Configuration"** for `drivetag-ai.com`. Root cause, diagnosed 2026-09-19: Namecheap's **HTTPS toggle** on the `@` A record is **ON**. That routes public traffic through Namecheap's own SSL proxy, so DNS answers `159.198.67.67` (a Namecheap IP) instead of the `216.198.79.1` the record itself says — Vercel's domain check never sees its own IP and can't issue a certificate. Verified the same day: Namecheap's authoritative nameservers return `159.198.67.67` for both `@` and `www`.

Fix in Namecheap → **Domain List → drivetag-ai.com → Advanced DNS**:

1. **`A` record, host `@`** → value `216.198.79.1` (the value Vercel's Domains card shows for this project; the legacy `76.76.21.21` also works) → switch **HTTPS OFF**.
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
Expect `216.198.79.1`.

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
| `/privacy`, `/terms`, `/refunds`, `/cookies`, `/data-deletion` | public | Legal pages ([Pricing UI, cookie consent & analytics, legal pages](#pricing-ui-cookie-consent--analytics-legal-pages)) |
| `/onboarding` | protected | 5-step stepper (Connect Drive → What to sort → Raw folder → Sorting → Go live) that creates the first work process, of either kind |
| `/dashboard` | protected | Per-process cards (with a kind badge), per-kind usage meter, activity feed, account |
| `/connect` | protected | Where the backend's `GET /api/auth/google/callback` redirects; claims the parked Drive grant |
| `/processes/new`, `/processes/:id` | protected | Work process editor. `/processes/new` opens with an images-or-documents kind picker (`ProcessKindPicker`); once a process is saved, its kind is fixed and the editor shows it as a read-only badge (`ProcessKindBadge`) instead |

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
│   │                            DocumentsExplainer, LandingPricingSection, TransparencyNote, UsageMeter, planFeatures
│   └── dashboard/                useDashboardData polling + Account/Sorting/Usage/Process/Connection/Stats/Activity
│                                 cards, each kind-aware (badges, per-kind credits, activity kind filter)
├── hooks/                       usePressMotion, useReveal, usePlans, useDocumentTitle
├── lib/
│   ├── supabase.ts               anon-key client (PKCE flow)
│   ├── api.ts                    typed backend client (Bearer token, readable network/CORS errors, field-level error details)
│   ├── consent.ts                 analytics consent storage + change events
│   ├── filename.ts                naming-template mirror of backend/src/utils/filename.js for the live preview
│   ├── gsap.ts                    plugin registration + reduced-motion queries
│   └── format.ts, messages.ts, confetti.ts
└── pages/
    ├── Landing, Login, Plans, Onboarding, Dashboard, Connect, ProcessEditor
    └── legal/                    Privacy, Terms, Refunds, Cookies, DataDeletion, LegalPage (shared layout), links.ts
```

---

## Rolling deploys: tolerating an older backend

Vercel and this backend deploy from the same push but as two separate services, and Vercel usually finishes first — so for a few minutes after every push, the new frontend can be talking to the *previous* backend. `src/lib/api.ts` normalizes around that gap instead of crashing or showing broken UI:

- `withKind()` defaults a process's `kind` to `'image'` when a `GET /api/processes` response omits it.
- `withKindUsage()` fills in `usage.images`/`usage.documents` from the legacy flat fields (`freeUsed`/`freeLimit`/…) when `GET /api/me` doesn't return them yet, and defaults `plan.family`/`freeDocuments`/`monthlyDocuments`.
- `withPlanFamilies()` does the same for `GET /api/plans`: empty `families`/`documentPacks` arrays and sensible `fileLimits` defaults when the backend predates them, and derives `plan.family`/`plan.tier` from the plan id when they're missing.
- `lib/messages.ts`'s `errorMessage()` catches the sharper failure mode too — a route that doesn't exist at all yet (a 404 whose message starts with `"No route for"`) — and shows "DriveTag is updating. Refresh in a minute." instead of a raw error.

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

### Accessibility conventions

- **Skip link.** `App.tsx` renders a "Skip to main content" link targeting `main#main-content` on every page.
- **Per-route titles.** `hooks/useDocumentTitle.ts` sets `document.title` to `"<title> · DriveTag AI"`; `LegalPage` does the same inline.
- **Live regions stay mounted.** `aria-live="polite"` regions (loading/status text, activity updates) are persistent in the DOM, not conditionally mounted, so screen readers reliably announce their changes.
- **Motion-reduce on every spinner.** Every `animate-spin` icon carries `motion-reduce:animate-none`.
- **Contrast.** Small text and links use `text-ink-soft` / `text-ink` with an underline — **not** `text-lavender-deep`, which is 2.94:1 on white and fails AA. In the code, `text-lavender-deep` is used only on `aria-hidden` decorative icons, never on readable text.
- **Form field borders** use `border-ink-soft/80` — the `border-line` token is too faint for an input boundary.
- **Icon-only buttons** need an `aria-label` and a target of at least 24px (e.g. Modal's close button).
- **Onboarding's Connect-Drive step** explains what Drive access is used for and links `/privacy#google-user-data`.
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

- **`FamilyPicker`** (`components/billing/FamilyPicker.tsx`) is a single-choice, accessible segmented control — native radio inputs in a `fieldset`, so arrow-key navigation and screen readers come for free — for the three paid families (Images / Documents / Images + Documents). `/plans` keeps the chosen family in the URL (`?family=images|documents|complete`, `useSearchParams`) so a link can land directly on one; the landing page's copy (`LandingPricingSection.tsx`) keeps its own `useState` instead, since it's a smaller, self-contained picker. The legacy `#documents` anchor still works: `Plans.tsx` reads `window.location.hash === '#documents'` once on mount and pre-selects Documents.
- **`PlanGrid`/`PlanCard`** (`components/billing/PlanGrid.tsx`, `PlanCard.tsx`) render Free plus the selected family's Creator/Studio/Enterprise tiers (`plansForFamily()` in `planFeatures.ts`). An Images + Documents card shows a savings line — `bundleSavings()` compares it against buying that tier's Images and Documents plans separately, and returns `null` (nothing shown) unless the saving is genuinely positive, never a fabricated percentage.
- **Prices** are USD placeholders, formatted by `formatPrice()` (`components/billing/planFeatures.ts`).
- **Yearly "N months free"** is computed from the monthly vs. yearly price (`monthsFree()`), not stored as copy. Enterprise tiers are monthly-only, so they show no yearly toggle.
- **"Recommended" badge** comes from `plan.popular` in the API payload (`PlanCard.tsx`: `const featured = plan.popular`) — the Studio tier of each family. It deliberately says "Recommended," not "Most popular" — nobody has paid yet, so a popularity claim would be fake social proof.
- **Feature lines**: `processesFeature()`, `aiWorkersFeature()`, and `allowanceFeatures()` — the last shows only the allowance(s) a plan actually includes (`imagesFeature()`/`documentsFeature()`), so a single-kind plan doesn't show "0 documents".
- **Packs of both kinds.** `TopupPacks.tsx` renders either an image-pack or a document-pack list via a `unitLabel` prop ("image"/"document") and shows a per-unit price via `perUnitPrice()`; `/plans` renders both lists side by side from `plans.topupPacks` and `plans.documentPacks`.
- **`DocumentsExplainer`** (`components/billing/DocumentsExplainer.tsx`) replaced the old, "Coming soon" `DocumentPricingSection` — documents are live, so this explains how one is counted (at most `fileLimits.pagesRead` PDF pages or `fileLimits.textChars` characters = one credit; oversized files are skipped, not charged; the `fileLimits.editingGraceMinutes` grace for Google-native files) instead of previewing a price. It renders full at `/plans#documents-explainer` and `compact` (one paragraph) on the landing page.
- **`LandingPricingSection`** (`components/billing/LandingPricingSection.tsx`) is the landing page's `FamilyPicker` + compact `PlanGrid` + compact `DocumentsExplainer` + compact `TransparencyNote`, pulled into its own component because it needs its own family `useState`.
- **`UsageMeter`** (`components/billing/UsageMeter.tsx`) and the dashboard's `UsageCard` render one row per kind (`KindRow`), each with its own progress bar, "N of M used" line, top-up-balance chip, and refill date; a kind the plan doesn't include at all shows "Not included in your plan · add a pack or switch plan" instead of a bar. `kindIncluded()`/`kindLimit()`/`anyKindExhausted()`/`kindUsageSummary()` in `planFeatures.ts` drive this and are reused by the dashboard's `ProcessCard`.
- **`TransparencyNote`** (`components/billing/TransparencyNote.tsx`) is the required no-hidden-fees note next to any price display: tax/VAT calculated at checkout, auto-renewal and cancellation terms, no overage fees, and a link to `/refunds`.
- **All purchase buttons are disabled**, showing "Coming soon" with a `PAYMENTS_PENDING_NOTE` tooltip — no payment provider is integrated yet.

### Cookie consent & analytics

- `CookieConsent.tsx` (rendered from `RouteAnalytics.tsx`) is a bottom, non-blocking banner shown once on first visit and again from the footer's "Cookie settings" button.
- Consent is stored via `lib/consent.ts` under the localStorage key **`drivetag-analytics-consent-v1`**, with two equal-weight choices: "Allow analytics" / "Only necessary" — never pre-ticked, never re-asked once a choice is stored.
- `@vercel/analytics`'s `<Analytics>` component only mounts once consent is `'granted'`, so no analytics script loads or sends before that.
- Revocation takes effect immediately: `beforeSend` reads consent through a `ref` (not a stale closure) and returns `null` when consent isn't granted, even though the Vercel script's own registration outlives the component's unmount.
- Reopening the banner from "Cookie settings": **Escape** closes it without changing the stored choice — a keypress must never silently flip a decision the user already made. The very first, unprompted view has no such binding.
- `RouteAnalytics.tsx` reports an explicit `route`/`path` on every route change (not just relying on the script's own `history.pushState` hook, which misses `<Navigate replace />` redirects such as login → dashboard), and its `beforeSend` redactor strips the URL hash and every query param except `utm_*` — OAuth returns carry Supabase tokens and `code`/`state` in the URL. Don't replace it with a bare `<Analytics />`.
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

- **Checkout UI** — once a payment provider (Lemon Squeezy vs. Paddle) is chosen. Plan/pack buttons already show real prices from `/api/plans`; only the purchase action is missing.
- **Google Drive Picker widget** — optional upgrade over the current searchable folder list (`components/drive/FolderBrowser.tsx`).
- **Unsaved-changes guard on browser Back** in the process editor. `ProcessEditor.tsx` guards a page unload (`beforeunload`) and in-app router links (`guardLinks`), but `BrowserRouter` has no `useBlocker`, so the browser's own Back/Forward buttons aren't covered yet.
- **Dashboard "At a glance" counts** cover the latest 50 activity rows (`ACTIVITY_LIMIT`), not all-time totals — the card says so; real totals need a count endpoint.
- **Rename the package** — `frontend/package.json`'s `name` is still `"temp-front"`.
- **Code-split the bundle.** The production build emits a single ~981 KB JS chunk (`dist/assets/index-*.js`), over Vite's 500 KB warning threshold and grown from ~925 KB with this release's new components. Route-level `React.lazy` is the natural first cut.
