# DriveTag AI

Automated visual-asset sorting for creative agencies and freelancers, run by **DeltaCo Creatives** (Indonesia).

- **AI work processes.** You point a process at a "Raw" folder in Google Drive. Every new image is classified by advanced AI, renamed with your template (e.g. `logos_acme-wordmark_2026-09-17.png`), tagged with your own fields, and moved into the Master-folder destination whose description fits best. Anything that fits none goes to Unsorted.
- **Several AI per process.** Paid plans sort one process with several AI workers at once (Creator 3, Studio 5, Enterprise 15). A per-process manager keeps them from racing, duplicating or double-charging.
- **Zero-Retention.** DriveTag never writes an image to disk, a database or a storage bucket. Each image is held in memory only while it's classified, then discarded once the file is renamed and moved. The AI provider doesn't train on submitted images. It may keep request logs for up to 55 days, only to prevent abuse ([Privacy Policy](https://drivetag-ai.com/privacy#zero-retention)).

## Status (2026-09-19)

| Area | State |
|---|---|
| Website | ✅ Live at https://drivetag-ai.com (Vercel) — Landing, pricing, Google login, onboarding, dashboard, process editor |
| API | ✅ Live at https://api.drivetag-ai.com (DigitalOcean) — Drive OAuth, work processes, multi-AI sorting, plans and usage metering, account deletion |
| Database | ✅ Supabase, migrations `0001`–`0003` applied |
| Sorting | ✅ Working end to end in production |
| Legal and compliance | ✅ `/privacy`, `/terms`, `/refunds`, `/cookies`, `/data-deletion`. Also a consent-gated cookieless analytics banner, self-hosted fonts and self-service account deletion |
| Domain | ⚠️ Vercel shows "Invalid Configuration" until the Namecheap records are fixed — see [frontend/README.md → DNS](frontend/README.md#dns-namecheap--vercel) |
| Google verification | ⚠️ Search Console domain verification and OAuth branding pending. The privacy and terms links now exist |
| Payments | ❌ Prices are shown, checkout is not built (Lemon Squeezy vs Paddle undecided). Plans and credits are set by hand ([backend/README.md → Operations](backend/README.md)) |
| Document sorting | ❌ Priced and shown as "Coming soon"; the pipeline isn't built — strategy below |

## Documentation

| Doc | Use it for |
|---|---|
| **README.md** | This page: product, status, pricing and the documents strategy |
| [backend/README.md](backend/README.md) | API setup, every env var, credentials, database and SQL helpers, deployment to DigitalOcean, operations, API reference |
| [frontend/README.md](frontend/README.md) | Web app setup, Vercel deployment and DNS, Supabase auth URLs, Google branding, design system, consent, legal pages, accessibility |
| [CLAUDE.md](CLAUDE.md) | Architecture and the non-obvious design decisions — read before changing code |

## Repository layout

```
backend/     Node.js + Express 5 API — DigitalOcean App Platform (source dir /backend)
frontend/    React 19 + Vite + Tailwind 4 — Vercel (root dir frontend)
supabase/    database migrations, the schema source of truth
tests/       naming-template vectors both filename implementations must pass
```

Both apps deploy from the `production` branch. Setup steps live in each app's README.

## Plans and pricing

Placeholder USD prices, shown on the site. Every number lives in [`backend/src/config/plans.js`](backend/src/config/plans.js) and reaches the website through `GET /api/plans`.

| Plan | Price | Work processes | AI per process | Images |
|---|---|---|---|---|
| Free | $0 | 1 | 1 | 100 total, no time limit |
| Creator | $9.99/mo or $99.90/yr | 5 | 3 | 1,000 / month |
| Studio *(Recommended)* | $29.99/mo or $299.90/yr | 15 | 5 | 5,000 / month |
| Enterprise | $99.99/mo | 50 | 15 | 25,000 / month |

- **Image packs:** 250 images for $4.99, 1,000 for $14.99 and 5,000 for $49.99. Packs never expire and are used after the plan's allowance.
- **Terms:**
  - Yearly billing is 2 months free.
  - Taxes are calculated at checkout.
  - There are no overage fees: sorting pauses when an allowance runs out.
  - Refunds: 14 days on a first payment, and 14 days on unused packs ([Refund Policy](https://drivetag-ai.com/refunds)).
- **Why "Recommended" and not "Most popular":** nobody has paid yet, so a popularity claim would be fake social proof. Switch the label once it's true.

## Document sorting: cost strategy

**The risk.** Documents (PDF, Word, Google Docs, text) vary wildly in size. Sending whole files to the AI would make one 1,000-page PDF cost about 160 times a 5-page one: roughly $0.84 against $0.005 at 2027 prices. That one variable is what could bankrupt a flat-priced plan.

**What was measured.** Model `gemini-3.6-flash` was measured on 2026-09-19. The per-document figures are estimated from Google's published token rates.

| Unit | Tokens | Cost now | Cost from 2027-01-01 |
|---|---|---|---|
| Image, default settings | ~1,460 in + ~420 thinking/out | $0.0028 | $0.0055 |
| Image, shipped settings (medium resolution, low thinking) | ~900 in + ~64 out | **$0.0009** | **$0.0018** |
| Document, first 5 pages only (estimate) | ~3,140 in + ~64 out | $0.0026 | $0.0052 |

Google's price for this model doubles on 2027-01-01, to $1.50 / $7.50 per million input / output tokens. The shipped image settings cut cost about 3× at the same routing quality. Without that change, a fully-used Enterprise plan would lose money in 2027.

**Decision.** Documents get **their own allowance**, not an image-credit multiplier. Cost is protected by engineering, not by charging more:

1. **Page cap.** The AI reads only the first 5 pages, or the equivalent text, which is enough to name and file any document. One document is one document credit, whatever its length.
2. **Size cap.** Files over 20 MB are skipped before any AI call and never charged.
3. **Hard stop.** Allowances stop at zero and there is no overage billing, the same as images today. That means no surprise bills for customers and no unbounded cost for us.
4. **Same plumbing.** The same atomic charge-on-success and per-process AI worker limits apply.

**Why not "1 document = 3 image credits".** A shared credit pool makes allowances unpredictable: "I bought 1,000 images, why do I have 400 left?" It also overcharges most documents. With the page cap, a one-page invoice costs the AI about the same as an image (~900 input tokens), and only a document of 5 or more pages reaches ~2.9×. The competitors closest to us meter per file:

- Renamer.ai: $9.95 for 200 files.
- NameQuick: $12 for 500.
- AI Renamer: $10 for 200 credits.

Separate allowances are clearer, and at about 1.7¢ per document they're still more generous than any of those.

**Document prices** (shown as "Coming soon" until the pipeline ships):

| Offer | Price | Documents | Notes |
|---|---|---|---|
| Free plan | $0 | 25 total | included |
| Creator + Documents | +$4.99/mo | 300 / month | add-on, uses the plan's processes and AI workers |
| Studio + Documents | +$14.99/mo | 1,000 / month | add-on |
| Enterprise + Documents | +$39.99/mo | 3,000 / month | add-on |
| Docs Starter | $7.99/mo | 500 / month | documents only, 3 processes, 3 AI per process |
| Docs Pro | $24.99/mo | 2,000 / month | 10 processes, 5 AI per process |
| Docs Business | $79.99/mo | 7,500 / month | 30 processes, 15 AI per process |
| Document packs | $5.99 / $19.99 | 250 / 1,000 | never expire |

**Margins.** These are gross margins at 2027 AI prices, assuming every allowance is fully used. They include Merchant-of-Record fees of 5% + $0.50 per transaction (5% only for an add-on billed with its plan), and exclude hosting.

| Offer | AI cost | Margin |
|---|---|---|
| Creator | $1.83 | $7.16 (72%) |
| Studio | $9.15 | $18.84 (63%) |
| Enterprise | $45.75 | $48.74 (49%) |
| Image packs 250 / 1,000 / 5,000 | $0.46 / $1.83 / $9.15 | 76% / 79% / 76% |
| Document add-ons Creator / Studio / Enterprise | $1.56 / $5.19 / $15.57 | 64% / 60% / 56% |
| Docs Starter / Pro / Business | $2.60 / $10.38 / $38.93 | 56% / 51% / 46% |
| Document packs 250 / 1,000 | $1.30 / $5.19 | 65% / 67% |

Real usage sits below the full allowance, so real margins are higher. A Free user costs about $0.31 in AI over their lifetime (100 images + 25 documents).

The fixed costs to plan for are hosting (DigitalOcean, Vercel, Supabase) and Google's annual CASA security assessment. CASA is required for the full `drive` scope; third-party estimates run $500–$4,500 a year.

**Building the document pipeline (next).**

1. **Migration `0004`.** Add a process type (`image` or `document`). Add document usage counters and a document credit ledger, and extend `complete_processed_file` to charge the right bucket.
2. **In-memory extraction** for each file type. Never write to disk.

   | File type | How |
   |---|---|
   | PDF | send the first 5 pages inline |
   | Google Docs | Drive `files.export` to text (10 MB export limit) |
   | `.docx` | extract text in memory (converting through Drive would create a copy) |
   | Plain text | read directly |

3. **A document prompt and schema**, reusing destinations, naming templates and tag fields.
4. **UI.** Add a document-process section on the dashboard and switch `DOCUMENTS.available` on in `plans.js`.

## Next steps

1. **DNS.** Make Vercel's domain check pass and verify the domain with Google ([frontend/README.md](frontend/README.md#dns-namecheap--vercel)).
2. **Google OAuth branding.** Home page `https://drivetag-ai.com/`, privacy policy `https://drivetag-ai.com/privacy`, terms of service `https://drivetag-ai.com/terms`. Then submit for brand and restricted-scope verification.
3. **Payments.** Choose Lemon Squeezy or Paddle, then build checkout and the webhook. The webhook calls `grant_image_credits(..., 'purchase', provider_reference)` for packs and sets `subscriptions.plan`/`status`/`period_anchor` for subscriptions. Name the provider in the Privacy Policy before checkout opens.
4. **Document pipeline**, as planned above.
5. **Cleanup release.** Remove the legacy `/api/drive/config`, `/raw-status` and `/organize` endpoints; `0003` is already applied.
6. **Supabase keys.** Move from the legacy `anon`/`service_role` keys to publishable/secret keys before Supabase retires them at the end of 2026.
7. **Security housekeeping** (unconfirmed whether done). The Supabase Postgres password and an AI API key were once pasted into a chat: reset the password (Supabase → Project Settings → Database) and rotate the key if it's still in use. Also stop tracking `.claude/settings.local.json`, which is a personal file.
