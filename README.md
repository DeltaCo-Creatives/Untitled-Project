# DriveTag AI

Automatic sorting for the **images and documents** creative agencies and freelancers juggle, run by **DeltaCo Creatives** (Indonesia).

- **AI work processes.** You point a process at a "Raw" folder in Google Drive, and every new file there is classified by advanced AI. It's then renamed with your template and moved into the Master-folder destination whose description fits best; anything that fits none goes to Unsorted.
  - **Image processes** sort photos, logos and graphics, e.g. `logos_acme-wordmark_2026-09-17.png`.
  - **Document processes** sort PDFs, Word files, Google Docs/Sheets/Slides and text files, e.g. `invoice_acme_q3-hosting.pdf` into *Invoices* or `contract_northwind_nda.docx` into *Contracts*.
- **Several AI per process.** Paid plans sort one process with several AI workers at once: Creator 3, Studio 5, Enterprise 15. A per-process manager keeps them from racing, duplicating or double-charging.
- **Zero-Retention.** DriveTag never writes a file, or text taken from one, to disk, a database or a storage bucket. Files are held in memory only while the AI reads them, then discarded once they're renamed and moved.
  - For a document, the AI reads only the first 5 pages, or the first ~12,000 characters.
  - The AI provider doesn't train on submitted content. It may keep request logs for up to 55 days, only to prevent abuse ([Privacy Policy](https://drivetag-ai.com/privacy#zero-retention)).

## Status (2026-09-19)

| Area | State |
|---|---|
| Website | ✅ Live at https://drivetag-ai.com (Vercel). Landing, pricing, Google login, onboarding, dashboard, process editor, legal pages |
| API | ✅ Live at https://api.drivetag-ai.com (DigitalOcean) |
| Image sorting | ✅ Working end to end in production |
| Document sorting | 🟡 Built and tested in this working tree. Goes live once migration `0004` is run and the release is pushed ([DeveloperToDo.md §1](DeveloperToDo.md)) |
| Plan families | 🟡 Same release: Images, Documents, and Images + Documents plans, plus image and document packs |
| Database | ✅ `0001`–`0003` applied · ⏳ `0004_documents.sql` waiting to be run |
| Legal and compliance | ✅ Privacy, Terms, Refunds, Cookies and Data-deletion pages, all updated for documents. Also a consent-gated cookieless analytics banner, self-hosted fonts and self-service account deletion |
| Domain | ⚠️ Vercel shows "Invalid Configuration" until the Namecheap records are fixed ([DeveloperToDo.md §2](DeveloperToDo.md)) |
| Google verification | ⚠️ Search Console domain verification and OAuth branding pending ([DeveloperToDo.md §4](DeveloperToDo.md)) |
| Payments | ❌ Prices are shown, checkout isn't built (Lemon Squeezy vs Paddle undecided). Plans and credits are set by hand ([DeveloperToDo.md §9](DeveloperToDo.md)) |

**Your to-do list** (DNS, database migration, Google, hosting settings, security, decisions) is in **[DeveloperToDo.md](DeveloperToDo.md)**.

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

Both apps deploy from the `production` branch. Setup steps live in each app's README.

## Plans and pricing

These are placeholder USD prices, shown on the site. Every number lives in [`backend/src/config/plans.js`](backend/src/config/plans.js) and reaches the website through `GET /api/plans`.

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

The owner's steps are in [DeveloperToDo.md](DeveloperToDo.md). On the code side:

1. **Payments.** Once the provider is chosen, build checkout and the payment webhook. The webhook calls `grant_credits(user, kind, amount, ..., 'purchase', provider_reference)` for packs, and sets `subscriptions.plan`/`status`/`period_anchor` for subscriptions.
2. **Cleanup release.** Remove the legacy `/api/drive/config`, `/raw-status` and `/organize` endpoints. Then, in a later migration, drop the v1 SQL functions that only the pre-document backend calls.
3. **Nice to have.** A "re-sort" action for already-sorted files, `.xlsx`/`.pptx` support, and a Google Drive Picker.
