# DriveTag AI

Automatic sorting for the **images and documents** creative agencies and freelancers juggle, run by **DeltaCo Creatives** (Indonesia).

- **AI work processes.** You point a process at a "Raw" folder in Google Drive, and every new file there is classified by advanced AI. It's then renamed with your template and moved into the Master-folder destination whose description fits best; anything that fits none goes to Unsorted.
  - **Image processes** sort photos, logos and graphics, e.g. `logos_acme-wordmark_2026-09-17.png`.
  - **Document processes** sort PDFs, Word files, Google Docs/Sheets/Slides and text files, e.g. `invoice_acme_q3-hosting.pdf` into *Invoices* or `contract_northwind_nda.docx` into *Contracts*.
- **Several AI per process.** Paid plans sort one process with several AI workers at once: Creator 3, Studio 5, Enterprise 15. A per-process manager keeps them from racing, duplicating or double-charging.
- **Zero-Retention.** DriveTag never writes a file, or text taken from one, to disk, a database or a storage bucket. Files are held in memory only while the AI reads them, then discarded once they're renamed and moved.
  - For a document, the AI reads only the first 5 pages, or the first ~12,000 characters.
  - The AI provider doesn't train on submitted content. It may keep request logs for up to 55 days, only to prevent abuse ([Privacy Policy](https://drivetag-ai.com/privacy#zero-retention)).

## Status (2026-09-20)

| Area | State |
|---|---|
| Website | ✅ Live at https://drivetag-ai.com (Vercel). Landing, pricing, Google login, onboarding, dashboard, process editor, legal pages. Serving the pre-beta build — see Deployment |
| API | ✅ Live at https://api.drivetag-ai.com (DigitalOcean). Also the pre-beta build — see Deployment |
| Image sorting | ✅ Working end to end in production |
| Document sorting | ✅ Live. `0004` is applied and the live `GET /api/plans` serves the Images, Documents and Images + Documents families |
| Plan families | ✅ Live: three families × three tiers, plus image and document packs |
| Closed beta | 🟡 Built and committed on `staging`: the `/beta` sign-up page, landing banner, admin sign-ups card and beta pricing. Not live yet — see Deployment |
| **Deployment** | ⚠️ **Built ≠ deployed.** `staging` (`c3d6635`) holds the closed-beta + Lemon Squeezy + VAT release. The live site and the live API are both built from `production` (`76eb2a6`) and don't have it: no `/beta` page in the site bundle, no `/api/beta` on the API, and no `pricesIncludeTax` in `GET /api/plans`. Merging `staging` into `production` is what ships it — after `0005` runs ([DeveloperToDo.md §1](DeveloperToDo.md)) |
| Database | ✅ `0001`–`0004` applied · ⏳ `0005_beta.sql` is written and tested but **has not been run** in Supabase. It must run before the release is pushed ([DeveloperToDo.md §1.2](DeveloperToDo.md)) |
| Legal and compliance | ✅ Privacy, Terms, Refunds, Cookies and Data-deletion pages, all updated for documents. Also a consent-gated cookieless analytics banner, self-hosted fonts and self-service account deletion |
| Domain | ✅ `drivetag-ai.com` and `api.drivetag-ai.com` both resolve and serve. The Namecheap records are settled ([DeveloperToDo.md §7](DeveloperToDo.md)) — and the apex `A` record must stay on Vercel, never point at Lemon Squeezy ([§2.1](DeveloperToDo.md)) |
| Google verification | ✅ Search Console + Cloud domain verification recorded done · ⚠️ brand verification, restricted-scope verification and CASA still pending ([DeveloperToDo.md §4](DeveloperToDo.md)) |
| Payments | ⏳ Lemon Squeezy chosen and named as Merchant of Record in Terms, Privacy, Refunds and Cookies (legal entity: **Sold through Link, LLC**). **Checkout is not built** — the plan buttons say "Coming soon", and plans and credits are set by hand ([DeveloperToDo.md §5](DeveloperToDo.md)). Prices exclude VAT/sales tax, which Lemon Squeezy adds at checkout |

**Your to-do list** (DNS, database migration, Google, hosting settings, security, decisions) is in **[DeveloperToDo.md](DeveloperToDo.md)**.

### Where the code lives right now

Three places, and they disagree. This is worth knowing before reading anything below as "done":

- **`staging` — `c3d6635`.** The full closed-beta release: `/beta` sign-ups, the admin card, the Drive-reconnect warning, beta pricing, Lemon Squeezy named in the legal pages, VAT wording, migration `0005_beta.sql`, and the backend test suite at 152 passing tests.
- **`production` — `76eb2a6`.** Everything up to and including document sorting, plus five accidental debug JSON files (`backend/h.json`, `backend/m.json`, `backend/p.json`, `frontend/r2.json`, `frontend/r3.json`). They're saved `curl` outputs, nothing reads them, and they should be deleted.
- **The working tree.** `frontend/src/pages/Beta.tsx` has two uncommitted fixes: a 401/403/404/405 from the public sign-up endpoint now reads as "Beta sign-up isn't live on this server yet" instead of leaking the backend's raw "Missing bearer token", and the Privacy Policy link in the consent label opens in a new tab so reading it no longer wipes a half-filled form.

Shipping the release is: commit the working tree, run `0005`, set `ADMIN_EMAILS` and `GOOGLE_APP_TESTING` on DigitalOcean, delete the five debug files, merge `staging` into `production`, push. The ordered version is [DeveloperToDo.md §1](DeveloperToDo.md). Nothing applies migrations automatically.

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
| **Creator** | 5 | 3 | $9.99/mo: 1,000 images | $7.99/mo: 500 documents | $14.99/mo: both (save $2.99) |
| **Studio** *(Recommended)* | 15 | 5 | $29.99/mo: 5,000 images | $24.99/mo: 2,000 documents | $44.99/mo: both (save $9.99) |
| **Enterprise** | 50 | 15 | $99.99/mo: 25,000 images | $79.99/mo: 7,500 documents | $149.99/mo: both (save $29.99) |

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

## What's next

Two lists, because they need different hands. Nothing in the first list can be done without an account you own, and nothing in the second is a code change.

### Claude does next (code) — ask for these

1. **Lemon Squeezy checkout and webhook.** *Blocked on the IDs in "You do next".* Hosted-checkout links on the plan cards, then `POST /webhook/lemonsqueezy` with HMAC signature verification, handling `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled` and `subscription_expired`. Packs call `grant_credits(user, kind, amount, ..., 'purchase', provider_reference)`; subscriptions set `subscriptions.plan` / `status` / `period_anchor`. The plan ids in [`backend/src/config/plans.js`](backend/src/config/plans.js) are the mapping key, which is why each Lemon Squeezy variant should be named after its plan id.
2. **Fix `schemaProblem()`** in `backend/src/repositories/usage.repo.js`. It blames *any* Supabase RPC error on a missing migration, so a dead or rotated API key boots the server saying "The database is missing supabase/migrations/0002_work_processes.sql (Invalid API key)" — sending you to re-run a migration that is already applied. It should report an auth failure as an auth failure.
3. **Delete the five accidental debug JSON files** on `production`: `backend/h.json`, `backend/m.json`, `backend/p.json`, `frontend/r2.json`, `frontend/r3.json`. Saved `curl` output, committed by accident, read by nothing — or do it yourself with the `git rm` in [DeveloperToDo.md §1.1](DeveloperToDo.md).
4. **Cleanup release.** Remove the legacy `/api/drive/config`, `/raw-status` and `/organize` endpoints. Then, in a later migration, drop the v1 SQL functions that only the pre-document backend calls.
5. **Nice to have.** A "re-sort" action for already-sorted files, `.xlsx`/`.pptx` support, and a Google Drive Picker.

### You do next (accounts, keys, money) — [DeveloperToDo.md](DeveloperToDo.md) has the steps

1. **Ship the closed-beta release** ([§1](DeveloperToDo.md)), in order: run `0005_beta.sql` in the Supabase SQL editor, set the new DigitalOcean variables, merge `staging` into `production` and push, then check the deploy. Until this happens, `/beta` doesn't exist for anyone but you.
2. **Check `SUPABASE_SERVICE_ROLE_KEY` on DigitalOcean.** You've moved to the new Supabase keys everywhere that's been verified, but nobody has confirmed this one. Judge it by **prefix** — it must start with `sb_secret_`, never by length. If it's still a legacy `eyJ…` key when you disable legacy keys, every `/api/*` request fails with "Invalid or expired token", all sorting stops, and `/health` stays green so nothing alerts you.
3. **Collect the Lemon Squeezy values Claude needs** ([§2.3](DeveloperToDo.md)): the Store ID, one Variant ID per purchasable thing (9 paid plans, doubled where a yearly price exists, plus 6 packs), an API key and a webhook signing secret. Put the checkout on a **subdomain CNAME** — the apex `A` record stays on Vercel ([§2.1](DeveloperToDo.md)).
4. **Confirm Drive watches now register** ([§4](DeveloperToDo.md)). Search Console + Cloud domain verification is recorded done; check whether webhooks work and, if so, move `AUTO_SYNC_INTERVAL_SECONDS` to `0`. Until that's confirmed, sorting stays on the polling fallback. Brand verification, restricted-scope verification and OAuth branding are still open.
5. **Run the beta** ([§3](DeveloperToDo.md)): approve sign-ups into Google test users, set `BETA_DISCOUNT_PERCENT` and `BETA_DISCOUNT_CODE`, do the outreach.
6. **Open business decisions** ([§6](DeveloperToDo.md)), plus the Google Cloud budget alert in [§7](DeveloperToDo.md).

Once the release ships, the closed beta runs while checkout is built: `/beta` collects sign-ups, your dashboard turns them into Google test users, and approved testers see a Lemon Squeezy discount code once one is configured.

**What a beta discount does to those margins.** The AI cost per file doesn't move when the price does, so a discount cuts margin far faster than it cuts price. At full allowance use:

| Discount | Images C/S/E | Documents C/S/E | Images + Documents C/S/E |
|---|---|---|---|
| none | 72% / 63% / 49% | 59% / 55% / 50% | 64% / 53% / 41% |
| 30% off | 62% / 49% / 29% | 44% / 38% / 31% | 50% / 35% / 17% |
| 50% off | 48% / 31% / **2%** | 24% / 16% / **6%** | 33% / **10%** / **−14%** |

Complete Enterprise breaks even at a **42.8%** discount and loses money beyond it — at 50% off it costs about $10 a month per fully-used subscriber. Keeping every plan above a 20% floor means capping a blanket discount at about **28%**.

Two things soften this: real usage sits well below the full allowance, and beta testers are the least likely people to max out an Enterprise plan. But if you want to advertise 50%, scope it to Creator and Studio rather than applying it to everything.
