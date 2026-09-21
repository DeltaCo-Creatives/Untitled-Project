# DriveTag AI

Automatic sorting for the **images and documents** creative agencies and freelancers juggle, run by **DeltaCo Creatives** (Indonesia).

- **AI work processes.** You point a process at a "Raw" folder in Google Drive, and every new file there is classified by advanced AI. It's then renamed with your template and moved into the Master-folder destination whose description fits best; anything that fits none goes to Unsorted.
  - **Image processes** sort photos, logos and graphics, e.g. `logos_acme-wordmark_2026-09-17.png`.
  - **Document processes** sort PDFs, Word files, Google Docs/Sheets/Slides and text files, e.g. `invoice_acme_q3-hosting.pdf` into *Invoices* or `contract_northwind_nda.docx` into *Contracts*.
- **Several AI per process.** Paid plans sort one process with several AI workers at once: Creator 2, Studio 3, Enterprise 10 (Free is 1). A per-process manager keeps them from racing, duplicating or double-charging. Workers are a speed setting, not a cost one — a file costs the same single AI call however many workers are pulling from the queue — so these numbers change how fast a backlog clears, never the margins below.
- **Zero-Retention.** DriveTag never writes a file, or text taken from one, to disk, a database or a storage bucket. Files are held in memory only while the AI reads them, then discarded once they're renamed and moved.
  - For a document, the AI reads only the first 5 pages, or the first ~12,000 characters.
  - The AI provider doesn't train on submitted content. It may keep request logs for up to 55 days, only to prevent abuse ([Privacy Policy](https://drivetag-ai.com/privacy#zero-retention)).

## Status (2026-09-21)

| Area | State |
|---|---|
| Website | ✅ Live at https://drivetag-ai.com (Vercel), serving the checkout release: landing, pricing, the `/beta` sign-up page, Google login, onboarding, dashboard, process editor, legal pages. Checked in a real browser on 2026-09-21 — `/plans` prints "Excludes VAT/sales tax" under all nine priced cards and names Lemon Squeezy as Merchant of Record once |
| API | ✅ Live at https://api.drivetag-ai.com (DigitalOcean), same release. `GET /api/plans` serves `checkoutEnabled`, `pricesIncludeTax` and `merchantOfRecord`, and `POST /api/beta/signups` answers `{"received":true}` |
| Image sorting | ✅ Working end to end in production |
| Document sorting | ✅ Live. `0004` is applied and the live `GET /api/plans` serves the Images, Documents and Images + Documents families |
| Plan families | ✅ Live: three families × three tiers, plus image and document packs |
| Closed beta | ✅ Live: the `/beta` sign-up page, the landing banner, the admin sign-ups card and beta pricing are all on the live site, and sign-ups reach the database. The owner has confirmed the sign-ups card shows for them and nobody else, and the leftover `t@example.com` test row is deleted. Still to set before you advertise it: the Google testing flag and the beta discount — no longer a redeploy, they're fields on `/admin` once the dashboard ships ([DeveloperToDo.md §3](DeveloperToDo.md)) |
| **Deployment** | ✅ **Shipped.** `production` is `aa9f464`, and the checkout release — buy links, the Lemon Squeezy webhook, `helmet`, the rate limiter and the Creator 2 / Studio 3 / Enterprise 10 worker counts — is live on both halves · ⏳ the owner dashboard release below is **written but not committed**. None of it is on the live site or the live API yet |
| Database | ✅ `0001`–`0006` applied, including `0006_checkout.sql` · ⏳ `0007_admin.sql` is written but **not run**. Nothing applies migrations automatically, so it's a manual run in the Supabase SQL editor. The dashboard release is safe to deploy before it — a missing `app_settings` table logs once and falls back to environment values — but nothing is editable from `/admin` until it's applied |
| Legal and compliance | ✅ Privacy, Terms, Refunds, Cookies and Data-deletion pages, all updated for documents. Also a consent-gated cookieless analytics banner, self-hosted fonts and self-service account deletion |
| **Domain** | ✅ Resolved. On 2026-09-20 a second apex `A` record pointing at Lemon Squeezy (`3.33.255.208`) was added alongside Vercel's `216.198.79.1`; Google's resolver returned the Lemon Squeezy address first and it answered HTTP 403, so a large share of visitors got an error page. It was removed the same day, and the apex now resolves to Vercel only — confirmed 2026-09-20: `nslookup drivetag-ai.com 8.8.8.8` returns only `216.198.79.1`, and `curl https://drivetag-ai.com/` answers `200` ([DeveloperToDo.md §2.1](DeveloperToDo.md)). `www` and `api` were unaffected |
| Google verification | ✅ Search Console + Cloud domain verification recorded done · ⚠️ brand verification, restricted-scope verification and CASA still pending ([DeveloperToDo.md §4](DeveloperToDo.md)) |
| **Payments** | ⏳ **Deployed, not configured.** Checkout links (`POST /api/checkout`), the signature-verified `POST /webhook/lemonsqueezy` that grants the plan or credits, and the printed-receipt success page are all live, and `0006_checkout.sql` is applied. What's missing is the store: no Lemon Squeezy variant ids are configured, so the live `GET /api/plans` returns `checkoutEnabled: false` and **every plan correctly still shows "Coming soon"**, with plans and credits set by hand ([DeveloperToDo.md §5](DeveloperToDo.md)). `LEMONSQUEEZY_WEBHOOK_SECRET` isn't set either, and **no real purchase has ever been tested** — the single most important thing left. [LemonSqueezySetup.md](LemonSqueezySetup.md) is the walkthrough. Lemon Squeezy is Merchant of Record (legal entity: **Sold through Link, LLC**), named in Terms, Privacy, Refunds and Cookies; prices exclude VAT/sales tax, which it adds at checkout |
| **Owner dashboard** | ⏳ **Built, not deployed.** A protected `/admin` page, rendered only for accounts `/api/me` marks `admin`: the Lemon Squeezy store slug and a 21-box variant editor, the beta discount, the Google testing toggle, look-up-a-user-and-set-their-plan-or-credits, and the existing beta sign-ups card. It is what turns the "Coming soon" buttons into buy buttons — a plan becomes purchasable on its own the moment its variant box is filled, with no redeploy |

**Your to-do list** (DNS, Lemon Squeezy, Google, hosting settings, beta, decisions) is in **[DeveloperToDo.md](DeveloperToDo.md)**.

### Where the code lives right now

**`production` is `aa9f464`**, and the live site and live API are built from it: `ad42d23` (the Lemon Squeezy checkout flow) → `aa9f464` (merge `staging` into `production`). `0006_checkout.sql` has been run, `ADMIN_EMAILS` is set on DigitalOcean, `VITE_API_URL` is set on Vercel, and the Supabase key swap is complete on both sides — an `sb_publishable_` key in the browser, an `sb_secret_` key on the server. So checkout exists end to end in production and is simply waiting for a store to point at.

A further release is **done but not yet committed**, sitting in the working tree:

- **The owner dashboard at `/admin`.** Five sections: **Payments** (the store slug, and one labelled box per purchasable thing — 21 of them, derived from `GET /api/plans`), **Closed beta** (discount percent and code, carrying the margin warning below and a live worked example), **Google** (the app-testing toggle), **Accounts** (look a user up by email, set their plan, grant or remove credits with a required reason — a negative amount asks for confirmation first), and the existing **Beta sign-ups** card, reused unmodified. The page renders only when `/api/me` says `admin`; every one of the new `/api/admin/*` endpoints re-checks that server-side.
- **Settings moved into the database** — see below.
- **`supabase/migrations/0007_admin.sql`** adds the `app_settings` table (RLS on, no policies, backend-only), `admin_user_lookup`, and `admin_set_plan_by_id`, which delegates to `apply_subscription_state` with `provider => null` so an admin plan change never relabels a real Lemon Squeezy subscriber as manual.
- **[LemonSqueezySetup.md](LemonSqueezySetup.md)** — a new top-level document, and now the only place that describes the Lemon Squeezy dashboard.
- The documents are modified alongside it: this file, `CLAUDE.md`, `DeveloperToDo.md`, `backend/README.md` and `frontend/README.md`.

Verified before the commit: the backend suite is **242 tests across 18 suites, all passing**; the frontend type-checks, lints (bar the one known pre-existing `AuthContext` warning) and builds. What the tests can't cover is a real card payment through a live store — item 4 on the owner's list below.

Nothing applies migrations automatically: a new migration is a manual run in the Supabase SQL editor. `0007_admin.sql` is the one waiting. It's the exception to "run it before you push the code that needs it" — the release falls back to environment values if the table isn't there yet — but nothing on `/admin` can be saved until it's applied.

### Where the settings live

Five operational settings — the beta discount percent and code, the Google app-testing flag, the Lemon Squeezy store slug and its variant map — used to be environment variables that needed a DigitalOcean redeploy to change. They now resolve **database → environment → default**: a value saved from `/admin` wins, otherwise the environment variable, otherwise a built-in default. The admin page shows which of the three each value came from, and a database override can be cleared to fall back to the environment. Reads are served from a cache refreshed in the background about every 30 seconds, so `/api/plans` and `/api/me` never wait on the database; a write invalidates it immediately.

That list of five keys is an allow-list, not a general key/value store — an unknown key is a 400. **Secrets stay in the environment and out of the database.** `LEMONSQUEEZY_WEBHOOK_SECRET` and the Supabase service-role key have no settings key and no write path. Neither does `ADMIN_EMAILS`, deliberately: it is the root of trust that gates the admin routes in the first place, so it can only be changed where you deploy. `GET /api/admin/settings` reports a *count* of admin emails, never the list, and a write whose body mentions any of those three names is rejected whole, even if it also carries a legitimate key.

## Documentation

| Doc | Use it for |
|---|---|
| **README.md** | This page: product, status, plans and the pricing strategy |
| [DeveloperToDo.md](DeveloperToDo.md) | Everything only the owner can do, in order, with SQL and checks |
| [LemonSqueezySetup.md](LemonSqueezySetup.md) | The Lemon Squeezy dashboard, field by field: the store, all 21 products with their exact names and prices, the webhook and its events, and where each id goes in DriveTag |
| [backend/README.md](backend/README.md) | API setup, env vars, credentials, database and SQL helpers, document pipeline, deployment, operations, API reference |
| [frontend/README.md](frontend/README.md) | Web app setup, Vercel deployment and DNS, Supabase auth URLs, Google branding, design system, pricing UI, consent, legal pages, accessibility |
| [CLAUDE.md](CLAUDE.md) | Architecture and the non-obvious design decisions. Read it before changing code |

## Repository layout

```
backend/     Node.js + Express 5 API — DigitalOcean App Platform (source dir /backend)
frontend/    React 19 + Vite + Tailwind 4 — Vercel (root dir frontend)
supabase/    database migrations, the schema source of truth
tests/       naming-template vectors both filename implementations must pass
```

Both apps deploy from the `production` branch — one repo, one branch, never split. Work lands on `staging` first and reaches the live site only when `staging` is merged into `production`. Setup steps live in each app's README.

## Plans and pricing

These are placeholder USD prices, shown on the site, and they **exclude VAT and sales tax** — Lemon Squeezy is the Merchant of Record and adds the buyer's local rate at checkout, so the number below is what reaches us, not what a buyer in Berlin pays. Every number lives in [`backend/src/config/plans.js`](backend/src/config/plans.js) and reaches the website through `GET /api/plans`.

Every plan has the same three tiers of scale, and the **family** decides which monthly allowances you get. Any plan can run both image and document processes, and can top up either kind with a pack.

| Tier | Work processes | AI per process | Images | Documents | Images + Documents |
|---|---|---|---|---|---|
| **Free** | 1 | 1 | 100 images and 25 documents, total, no time limit | ← | ← |
| **Creator** | 5 | 2 | $9.99/mo: 1,000 images | $7.99/mo: 500 documents | $14.99/mo: both (save $2.99) |
| **Studio** *(Recommended)* | 15 | 3 | $29.99/mo: 5,000 images | $24.99/mo: 2,000 documents | $44.99/mo: both (save $9.99) |
| **Enterprise** | 50 | 10 | $99.99/mo: 25,000 images | $79.99/mo: 7,500 documents | $149.99/mo: both (save $29.99) |

- **Packs:**
  - Images: 250 for $4.99, 1,000 for $14.99, 5,000 for $49.99.
  - Documents: 250 for $5.99, 1,000 for $19.99, 5,000 for $79.99.
  - Packs never expire and are used after the plan's allowance.
- **Terms:**
  - Creator and Studio can be billed yearly at 2 months free; Enterprise is monthly only.
  - Taxes are calculated at checkout.
  - No overage fees: sorting pauses when an allowance runs out.
  - Refunds: 14 days on a first payment, and 14 days on unused packs ([Refund Policy](https://drivetag-ai.com/refunds)).
- **Why "Recommended" and not "Most popular":** nobody has paid yet, so a popularity claim would be fake social proof. Switch the label once it's true.

## Pricing strategy: how documents stay profitable

**The risk.** Documents vary wildly in size. If whole files went to the AI, one 1,000-page PDF would cost about 160 times a 5-page one: roughly $0.84 against $0.005 at 2027 prices. That's what could bankrupt a flat-priced plan.

**Decision: cap the cost per file in engineering, and give documents their own allowance.** Documents don't use an image-credit multiplier.

1. **Page cap.** The AI reads at most the first 5 PDF pages, or the first 12,000 characters of text. That's enough to name and file a document, so one document is one credit, whatever its length.
2. **Size cap.** Files over 20 MB are skipped before download and never charged. Word files that would unpack to more than 100 MB are refused (zip-bomb guard).
3. **Hard stop.** Allowances stop at zero and there is no overage billing. Customers get no surprise bills, and DriveTag has no unbounded cost.
4. **Same plumbing as images.** Credits are charged atomically, only on success. The per-process AI worker limits apply.

**Measured AI cost per file.** Model `gemini-3.6-flash` was measured on 2026-09-19 against the real API. Google's price for this model doubles on 2027-01-01 (to $1.50 / $7.50 per million input / output tokens), so every figure below uses the 2027 price.

| File | Tokens (in + out) | Cost (2027) |
|---|---|---|
| Image (medium resolution, low thinking) | ~900 + ~64 | $0.0018 |
| 1-page PDF invoice (low resolution) | ~783 + ~45 | $0.0015 |
| 5-page PDF report | ~1,847 + ~122 | $0.0037 |
| Text document at the 12,000-character cap (worst case) | ~2,868 + ~50 | $0.0047 |

The shipped image settings also cut image cost about 3× against the defaults. Without that, a fully used Enterprise plan would have lost money in 2027.

**Why not "1 document = 3 image credits".** A shared credit pool makes allowances unpredictable: "I bought 1,000 images, why do I have 400 left?" It would also overcharge most documents: a typical 1–2 page invoice costs the AI about the same as an image. Separate allowances are clearer, and per file they're more generous than the closest competitors, which meter per file:

- Renamer.ai: $9.95 for 200 files.
- NameQuick: $12 for 500.
- AI Renamer: $10 for 200 credits.

The **Images + Documents** family costs about 17% less than buying the two separately, and the website shows the exact saving.

**Margins.** These are gross margins at 2027 AI prices with every allowance fully used, which is the worst case. Documents are priced at the worst-case $0.0047 each. Merchant-of-Record fees of 5% + $0.50 per transaction are included; hosting is excluded.

| Offer | Price | AI cost | Margin |
|---|---|---|---|
| Images: Creator / Studio / Enterprise | $9.99 / $29.99 / $99.99 | $1.83 / $9.15 / $45.75 | 72% / 63% / 49% |
| Documents: Creator / Studio / Enterprise | $7.99 / $24.99 / $79.99 | $2.35 / $9.40 / $35.25 | 59% / 55% / 50% |
| Images + Documents: Creator / Studio / Enterprise | $14.99 / $44.99 / $149.99 | $4.18 / $18.55 / $81.00 | 64% / 53% / 41% |
| Image packs 250 / 1,000 / 5,000 | $4.99 / $14.99 / $49.99 | $0.46 / $1.83 / $9.15 | 76% / 79% / 76% |
| Document packs 250 / 1,000 / 5,000 | $5.99 / $19.99 / $79.99 | $1.18 / $4.70 / $23.50 | 67% / 69% / 65% |

Real usage sits below the full allowance, so real margins are higher. A Free user costs about $0.30 in AI over their lifetime.

The fixed costs to plan for:

- hosting (DigitalOcean, Vercel, Supabase);
- Google's annual CASA security assessment, required for the full `drive` scope. Third-party estimates run $500–$4,500 a year.

### Why the AI-worker counts don't touch those margins

The tiers now advertise Creator 2 / Studio 3 / Enterprise 10 workers per process, down from 3 / 5 / 15. **Every margin above is unchanged**, and that's not an approximation: `aiPerProcess` appears in exactly one functional place in the backend, the concurrency limit in `runProcessQueue` ([`backend/src/services/pipeline.service.js`](backend/src/services/pipeline.service.js)). It never reaches the charging SQL, the credit reservation or the AI request config. One file is one AI call at one price, whether two workers or ten pulled it off the queue.

What the number does change is how fast a backlog clears:

| Tier | Allowance | Workers before → after | Time to clear one process's backlog (about 4 s per file) |
|---|---|---|---|
| Creator | 1,000 images | 3 → 2 | 22m → 33m |
| Studio | 5,000 images | 5 → 3 | 1h07 → 1h51 |
| Enterprise | 25,000 images | 15 → 10 | unchanged — the server-wide cap already held it at 10 |

Two things are worth remembering before selling at the top of the range:

- **`MAX_CONCURRENT_AI_JOBS` is recommended at `10` on a 1 GB instance** (the code default is `20`) — [DeveloperToDo.md §7](DeveloperToDo.md) is a recommendation, not a reading of the live dashboard, so confirm the deployed value before relying on it. Whatever it's set to, that server-wide FIFO semaphore clamps every worker pool, so Enterprise's old "15" was never deliverable above it.
- **If the deployed value is 10, Enterprise's 10 workers exactly equal that cap**, and the semaphore isn't fair across users — one Enterprise customer sorting a backlog could occupy every slot on the server. Before selling an Enterprise seat, confirm `MAX_CONCURRENT_AI_JOBS`, then move the instance to 2 GB and raise the cap to 20 if it's still 10; 20 in-flight jobs hold roughly 360 MB of file buffers.

### How the money actually reaches us

Checkout is live, and the path is short and has no API key anywhere in it. A signed-in buyer clicks a plan, the backend hands back a plain Lemon Squeezy buy link (`https://<store>.lemonsqueezy.com/checkout/buy/<variant id>`) with their Supabase user id attached as `checkout[custom][user_id]`, and `lemon.js` opens it as an overlay on our own page. That parameter is the whole thread: when the payment clears, Lemon Squeezy `POST`s a signed message to `POST /webhook/lemonsqueezy`, and **that message — not the buyer's browser — is what grants the plan or the credits**, because a browser can close mid-redirect and could never be trusted anyway. The success page only confirms what already happened, by reading `GET /api/me`. Every handler is idempotent, so a redelivered message can't charge or grant twice. The mechanics — signature verification, each event, the refund clawback — are in [backend/README.md](backend/README.md).

## What's next

Two lists, because they need different hands. Nothing in the first list needs an account you own, and nothing in the second is a code change.

### Claude does next (code) — ask for these

1. **Commit this release.** The `/admin` dashboard, the database-backed settings, `0007_admin.sql` and `LemonSqueezySetup.md` are all sitting uncommitted in the working tree. Until it's committed and merged into `production`, there is no page to put the store slug and the variant ids into, so the buy buttons stay "Coming soon" no matter what you create in Lemon Squeezy.
2. **Cleanup release.** Remove the legacy `/api/drive/config`, `/raw-status` and `/organize` endpoints and `/api/me`'s legacy `config` / `subscription` / `entitled` fields. Deliberately kept **out** of both the checkout and the dashboard release so that rolling one back means rolling back one thing. Then, in a later migration, drop the v1 SQL functions that only the pre-document backend calls.
3. **Re-sorting already-sorted files.** The ledger is unique on `(user_id, file_id)`, so a file is sorted automatically at most once; there's still no way to ask for a second pass after changing a process.
4. **Yearly billing in the UI.** The buy button always sends `billing: 'monthly'`, and `buildReceipt()` in `pages/CheckoutSuccess.tsx` prices off `price.monthly` to match, so the yearly prices the plans advertise can't actually be bought yet. Needs a monthly/yearly switch on `/plans` and a matching receipt line. Create the yearly variants anyway while you're in the dashboard — the boxes for them are already on `/admin`, and they'll start working the day this ships.
5. **Nice to have.** `.xlsx`/`.pptx` support, and a Google Drive Picker.

### You do next (accounts, keys, money) — [LemonSqueezySetup.md](LemonSqueezySetup.md) and [DeveloperToDo.md](DeveloperToDo.md) have the steps

1. **Run `0007_admin.sql`** in the Supabase SQL editor. Nothing on `/admin` can be saved until it's applied.
2. **Work through [LemonSqueezySetup.md](LemonSqueezySetup.md) top to bottom.** It's the whole store: the 21 products with their exact names and prices, the webhook endpoint and its events, and how to read a variant id off a checkout link. You come out of it with a store slug, 21 variant ids and a signing secret.
3. **Put those values in.** The store slug and the variant ids go into the Payments section of `/admin` — each box is labelled with the plan or pack it belongs to, and a plan goes buyable the moment its box is filled, no redeploy. `LEMONSQUEEZY_WEBHOOK_SECRET` is the exception: it's a secret, so it goes in DigitalOcean's environment settings, never on the page.
4. **Then make one real test-mode purchase, end to end, before any of this is public.** Every part of it is unit-tested; an actual card payment through a live store has never been run, and it's the single most important thing left on either list.
5. **Finish the beta setup** ([§3](DeveloperToDo.md)): turn on the Google app-testing flag and decide the beta discount ([§3.4](DeveloperToDo.md)) — both are now fields on `/admin` rather than a redeploy — then approve sign-ups into Google test users and do the outreach.
6. **Google, the long pole** ([§4](DeveloperToDo.md)): brand verification, restricted-scope verification and CASA. Also confirm whether Drive watches now register — if they do, `AUTO_SYNC_INTERVAL_SECONDS` can go to `0`; until then sorting stays on the polling fallback.
7. **Disable the legacy Supabase `anon` / `service_role` keys** before the end of 2026 ([§7](DeveloperToDo.md)). Both sides are on the new keys, so this is now just the switch-off.
8. **Open business decisions** ([§6](DeveloperToDo.md)), plus the Google Cloud budget alert in [§7](DeveloperToDo.md).

If you want a branded checkout address, it goes on a **subdomain** — never the apex, per the DNS incident recorded in [§2.1](DeveloperToDo.md).

The closed beta runs while the store is being set up: `/beta` collects sign-ups, your dashboard turns them into Google test users, and approved testers see a Lemon Squeezy discount code once one is configured.

**What a beta discount does to those margins.** The AI cost per file doesn't move when the price does, so a discount cuts margin far faster than it cuts price. At full allowance use:

| Discount | Images C/S/E | Documents C/S/E | Images + Documents C/S/E |
|---|---|---|---|
| none | 72% / 63% / 49% | 59% / 55% / 50% | 64% / 53% / 41% |
| 30% off | 62% / 49% / 29% | 44% / 38% / 31% | 50% / 35% / 17% |
| 50% off | 48% / 31% / **2%** | 24% / 16% / **6%** | 33% / **10%** / **−14%** |

Complete Enterprise breaks even at a **42.8%** discount and loses money beyond it — at 50% off it costs about $10 a month per fully-used subscriber. Keeping every plan above a 20% floor means capping a blanket discount at about **28%**.

Two things soften this: real usage sits well below the full allowance, and beta testers are the least likely people to max out an Enterprise plan. But if you want to advertise 50%, scope it to Creator and Studio rather than applying it to everything.
