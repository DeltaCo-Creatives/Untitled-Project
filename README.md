# DriveTag AI

Automatic sorting for the **images and documents** creative agencies and freelancers juggle, run by **DeltaCo Creatives** (Indonesia).

- **AI work processes.** You point a process at a "Raw" folder in Google Drive, and every new file there is classified by advanced AI. It's then renamed with your template and moved into the Master-folder destination whose description fits best; anything that fits none goes to Unsorted.
  - **Image processes** sort photos, logos and graphics, e.g. `logos_acme-wordmark_2026-09-17.png`.
  - **Document processes** sort PDFs, Word files, Google Docs/Sheets/Slides and text files, e.g. `invoice_acme_q3-hosting.pdf` into *Invoices* or `contract_northwind_nda.docx` into *Contracts*.
- **Several AI per process.** Paid plans sort one process with several AI workers at once: Creator 2, Studio 3, Enterprise 10 (Free is 1). A per-process manager keeps them from racing, duplicating or double-charging. Workers are a speed setting, not a cost one — a file costs the same single AI call however many workers are pulling from the queue — so these numbers change how fast a backlog clears, never the margins below.
- **Zero-Retention.** DriveTag never writes a file, or text taken from one, to disk, a database or a storage bucket. Files are held in memory only while the AI reads them, then discarded once they're renamed and moved.
  - For a document, the AI reads only the first 5 pages, or the first ~12,000 characters.
  - The AI provider doesn't train on submitted content. It may keep request logs for up to 55 days, only to prevent abuse ([Privacy Policy](https://drivetag-ai.com/privacy#zero-retention)).

## Status (2026-09-20)

| Area | State |
|---|---|
| Website | ✅ Live at https://drivetag-ai.com (Vercel), serving the closed-beta release: landing, pricing with the VAT line, the `/beta` sign-up page, Google login, onboarding, dashboard, process editor, legal pages |
| API | ✅ Live at https://api.drivetag-ai.com (DigitalOcean), same release. `GET /api/plans` serves `pricesIncludeTax` and `merchantOfRecord`, and `POST /api/beta/signups` answers `{"received":true}` |
| Image sorting | ✅ Working end to end in production |
| Document sorting | ✅ Live. `0004` is applied and the live `GET /api/plans` serves the Images, Documents and Images + Documents families |
| Plan families | ✅ Live: three families × three tiers, plus image and document packs |
| Closed beta | ✅ Live: the `/beta` sign-up page, the landing banner, the admin sign-ups card and beta pricing are all on the live site, and sign-ups reach the database. Still to set before you advertise it: `GOOGLE_APP_TESTING`, and `BETA_DISCOUNT_PERCENT` / `BETA_DISCOUNT_CODE` ([DeveloperToDo.md §3](DeveloperToDo.md)) |
| **Deployment** | ✅ **Shipped.** `production` is `392236b`, and the closed-beta + Lemon Squeezy + VAT release is live on both halves · ⏳ the whole checkout release below, plus the new AI-worker counts, is **written but not committed**. None of it is on the live site or the live API yet |
| Database | ✅ `0001`–`0005` applied, including `0005_beta.sql` · ⏳ `0006_checkout.sql` is written but **not run**. Nothing applies migrations automatically, so it's a manual run in the Supabase SQL editor, before the code that needs it is pushed |
| Legal and compliance | ✅ Privacy, Terms, Refunds, Cookies and Data-deletion pages, all updated for documents. Also a consent-gated cookieless analytics banner, self-hosted fonts and self-service account deletion |
| **Domain** | ✅ Resolved. On 2026-09-20 a second apex `A` record pointing at Lemon Squeezy (`3.33.255.208`) was added alongside Vercel's `216.198.79.1`; Google's resolver returned the Lemon Squeezy address first and it answered HTTP 403, so a large share of visitors got an error page. It was removed the same day, and the apex now resolves to Vercel only — confirmed 2026-09-20: `nslookup drivetag-ai.com 8.8.8.8` returns only `216.198.79.1`, and `curl https://drivetag-ai.com/` answers `200` ([DeveloperToDo.md §2.1](DeveloperToDo.md)). `www` and `api` were unaffected |
| Google verification | ✅ Search Console + Cloud domain verification recorded done · ⚠️ brand verification, restricted-scope verification and CASA still pending ([DeveloperToDo.md §4](DeveloperToDo.md)) |
| **Payments** | ⏳ **Built, not deployed.** Checkout links (`POST /api/checkout`), the signature-verified `POST /webhook/lemonsqueezy` that grants the plan or credits, and the printed-receipt success page all exist in code — uncommitted, and covered by the test suite. Still missing: `0006_checkout.sql` hasn't been run, the `LEMONSQUEEZY_*` variables aren't set, and **no real purchase has ever been tested**. Until a store exists every button stays "Coming soon" and plans and credits are set by hand ([DeveloperToDo.md §5](DeveloperToDo.md)). Lemon Squeezy is Merchant of Record (legal entity: **Sold through Link, LLC**), named in Terms, Privacy, Refunds and Cookies; prices exclude VAT/sales tax, which it adds at checkout |

**Your to-do list** (DNS, Lemon Squeezy, Google, hosting settings, beta, decisions) is in **[DeveloperToDo.md](DeveloperToDo.md)**.

### Where the code lives right now

**`production` is `392236b`**, and the live site and live API are built from it. The release shipped on 2026-09-20: `540af6b` (beta release docs and form fixes) → `f851715` (merge `staging` into `production`) → `392236b` (remove the five accidental debug JSON files). `0005_beta.sql` has been run, `ADMIN_EMAILS` is set on DigitalOcean, `VITE_API_URL` is set on Vercel, and the Supabase key swap is complete on both sides — an `sb_publishable_` key in the browser, an `sb_secret_` key on the server.

A whole release is **done but not yet committed**, sitting in the working tree. It is checked out on `staging`, which is three commits behind `production`, so committing it is only half the job — it still has to reach `production` to deploy:

- **Lemon Squeezy checkout.** `POST /api/checkout` returns a plain buy link; `POST /webhook/lemonsqueezy` verifies the signature and is the thing that actually grants a plan or credits; `supabase/migrations/0006_checkout.sql` adds `apply_subscription_state` and makes `grant_credits` idempotent per provider reference; the frontend gains buy buttons gated on `checkoutEnabled` / `purchasable`, an overlay loader, and a `/checkout/success` page that prints a receipt.
- **Hardening.** `helmet`, and an app-wide rate limit of 300 requests per IP per minute on `/api` only (both webhooks exempt). `schemaProblem()` now reports an auth-shaped Supabase error as a `SUPABASE_SERVICE_ROLE_KEY` problem instead of blaming a migration that is already applied.
- **`backend/src/config/plans.js`** — AI workers per process cut to Creator 2, Studio 3, Enterprise 10 (Free stays 1), with a comment above `TIERS` recording that `aiPerProcess` is a speed knob rather than a cost knob, and that advertising a number above `MAX_CONCURRENT_AI_JOBS` would be a promise the server can't keep. The live API still runs the old 3 / 5 / 15 until this is committed and the backend redeploys.
- All five documents — this file, `CLAUDE.md`, `DeveloperToDo.md`, `backend/README.md` and `frontend/README.md` — are modified alongside it.

Verified before the commit: the backend suite is **205 tests across 14 suites, all passing**; the frontend type-checks, lints (bar the one known pre-existing `AuthContext` warning) and builds. What the tests can't cover is a real card payment through a live store — item 2 on the owner's list below.

Nothing applies migrations automatically: a new migration is a manual run in the Supabase SQL editor before the code that needs it is pushed. `0006_checkout.sql` is the one waiting.

## Documentation

| Doc | Use it for |
|---|---|
| **README.md** | This page: product, status, plans and the pricing strategy |
| [DeveloperToDo.md](DeveloperToDo.md) | Everything only the owner can do, in order, with SQL and checks |
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

Now that checkout exists in code, the path is short and has no API key anywhere in it. A signed-in buyer clicks a plan, the backend hands back a plain Lemon Squeezy buy link (`https://<store>.lemonsqueezy.com/checkout/buy/<variant id>`) with their Supabase user id attached as `checkout[custom][user_id]`, and `lemon.js` opens it as an overlay on our own page. That parameter is the whole thread: when the payment clears, Lemon Squeezy `POST`s a signed message to `POST /webhook/lemonsqueezy`, and **that message — not the buyer's browser — is what grants the plan or the credits**, because a browser can close mid-redirect and could never be trusted anyway. The success page only confirms what already happened, by reading `GET /api/me`. Every handler is idempotent, so a redelivered message can't charge or grant twice. The mechanics — signature verification, each event, the refund clawback — are in [backend/README.md](backend/README.md).

## What's next

Two lists, because they need different hands. Nothing in the first list needs an account you own, and nothing in the second is a code change.

### Claude does next (code) — ask for these

1. **Commit this release.** Checkout, the webhook, `0006_checkout.sql`, `helmet` and the rate limiter, the `schemaProblem()` fix and the AI-worker counts are all sitting uncommitted in the working tree. Until it's committed and merged into `production`, none of it exists for a customer — and `0006_checkout.sql` has to be run in Supabase *before* that push, since the new backend calls functions it creates.
2. **Yearly billing in the UI.** The buy button always sends `billing: 'monthly'`, and the receipt prices off `price.monthly` to match, so the yearly prices the plans advertise can't actually be bought yet. Needs a monthly/yearly switch on `/plans` and a matching receipt line.
3. **Cleanup release.** Remove the legacy `/api/drive/config`, `/raw-status` and `/organize` endpoints and `/api/me`'s legacy `config` / `subscription` / `entitled` fields. Deliberately kept **out** of the checkout release so that rolling it back means rolling back one thing. Then, in a later migration, drop the v1 SQL functions that only the pre-document backend calls.
4. **Re-sorting already-sorted files.** The ledger is unique on `(user_id, file_id)`, so a file is sorted automatically at most once; there's still no way to ask for a second pass after changing a process.
5. **Nice to have.** `.xlsx`/`.pptx` support, and a Google Drive Picker.

### You do next (accounts, keys, money) — [DeveloperToDo.md](DeveloperToDo.md) has the steps

1. **Run `0006_checkout.sql`** in the Supabase SQL editor. It's the one migration standing between the checkout code and a working payment, and it has to be applied before the release is pushed.
2. **Stand the Lemon Squeezy store up, then buy something yourself** ([§2.2](DeveloperToDo.md), [§2.3](DeveloperToDo.md)). Create the 21 variants — 9 paid plans, 6 of which also have a yearly price, plus 6 packs — and **name each variant after its plan or pack id**, which is what the webhook maps on. Set `LEMONSQUEEZY_STORE`, `LEMONSQUEEZY_VARIANTS` and `LEMONSQUEEZY_WEBHOOK_SECRET` on DigitalOcean (no API key is needed), create the webhook endpoint at `https://api.drivetag-ai.com/webhook/lemonsqueezy` for the events in [§2.3](DeveloperToDo.md), and then **make one real test-mode purchase end to end before any of this is public.** Every part of it is unit-tested; an actual card payment through a live store has never been run. If you want a branded checkout address, it goes on a **subdomain** — never the apex, per the DNS incident recorded in [§2.1](DeveloperToDo.md).
3. **Redeploy the backend** once the release is on `production`, so the live API serves Creator 2 / Studio 3 / Enterprise 10 instead of the old numbers — and picks up the `LEMONSQUEEZY_*` variables, which is what flips the buttons from "Coming soon" to buyable.
4. **Finish the beta setup** ([§3](DeveloperToDo.md)): set `GOOGLE_APP_TESTING`, decide and set `BETA_DISCOUNT_PERCENT` and `BETA_DISCOUNT_CODE` ([§3.4](DeveloperToDo.md)), approve sign-ups into Google test users, then do the outreach. Also delete the one test row left behind by a live check: `delete from public.beta_signups where lower(email) = 't@example.com';`
5. **Google, the long pole** ([§4](DeveloperToDo.md)): brand verification, restricted-scope verification and CASA. Also confirm whether Drive watches now register — if they do, `AUTO_SYNC_INTERVAL_SECONDS` can go to `0`; until then sorting stays on the polling fallback.
6. **Disable the legacy Supabase `anon` / `service_role` keys** before the end of 2026 ([§7](DeveloperToDo.md)). Both sides are on the new keys, so this is now just the switch-off.
7. **Open business decisions** ([§6](DeveloperToDo.md)), plus the Google Cloud budget alert in [§7](DeveloperToDo.md).

The closed beta runs while the store is being set up: `/beta` collects sign-ups, your dashboard turns them into Google test users, and approved testers see a Lemon Squeezy discount code once one is configured.

**What a beta discount does to those margins.** The AI cost per file doesn't move when the price does, so a discount cuts margin far faster than it cuts price. At full allowance use:

| Discount | Images C/S/E | Documents C/S/E | Images + Documents C/S/E |
|---|---|---|---|
| none | 72% / 63% / 49% | 59% / 55% / 50% | 64% / 53% / 41% |
| 30% off | 62% / 49% / 29% | 44% / 38% / 31% | 50% / 35% / 17% |
| 50% off | 48% / 31% / **2%** | 24% / 16% / **6%** | 33% / **10%** / **−14%** |

Complete Enterprise breaks even at a **42.8%** discount and loses money beyond it — at 50% off it costs about $10 a month per fully-used subscriber. Keeping every plan above a 20% floor means capping a blanket discount at about **28%**.

Two things soften this: real usage sits well below the full allowance, and beta testers are the least likely people to max out an Enterprise plan. But if you want to advertise 50%, scope it to Creator and Studio rather than applying it to everything.
