# DeveloperToDo — what only you can do

Everything below needs your accounts (Supabase, Namecheap, Google, DigitalOcean, Vercel, Lemon Squeezy) or a business decision, so no code can do it for you. Work top to bottom: **section 1 has to happen in that order.** Each step says how to check that it worked.

Tick items off as you go. When a section is fully done, tell Claude, so the READMEs' status tables get updated.

The last section, [**What Claude will do when you say go**](#what-claude-will-do-when-you-say-go), is the other half of this list: the code work that's waiting on you. Nothing there needs your dashboards — it needs your word.

---

## 0. Where things stand — read this first

As of 2026-09-20:

| | State |
|---|---|
| **The code** | The whole closed-beta + Lemon Squeezy + VAT release is committed on **`staging`** (`c3d6635`). Two small `/beta` page fixes are still **uncommitted** in your working copy. |
| **`production` branch** | Still `76eb2a6`, which is the **old** code plus five accidental debug JSON files (§1.1). None of this release is on it. |
| **The live website** | `drivetag-ai.com` builds from `production`, so **there is no `/beta` page live**, no VAT line on `/plans`, and no beta banner. |
| **The live API** | `api.drivetag-ai.com` is the old build too. `GET /api/plans` has no `pricesIncludeTax` field, and `POST /api/beta/signups` answers `401 Missing bearer token`, because the beta router doesn't exist on it. |
| **Migration `0005_beta.sql`** | **Not run.** |
| **Supabase API keys** | Migrated on the browser side. The live frontend bundle uses an `sb_publishable_` key, contains no legacy JWTs, and Supabase accepts it. Your local `frontend/.env` and `backend/.env` are on the new keys too. |
| **DigitalOcean's `SUPABASE_SERVICE_ROLE_KEY`** | **Unconfirmed.** Nobody has looked. See the warning in §1.3 before you disable legacy keys. |
| **Vercel `VITE_API_URL`** | Fixed. A build failed on it earlier today; it's set now. |

So: the release is written and tested, and **nothing of it is live**. §1 is how it gets there.

Done since the last version of this list:

- [x] Supabase publishable / secret key swap — live frontend, local `frontend/.env`, local `backend/.env`.
- [x] Vercel `VITE_API_URL` fixed (the failed build was missing it; the likeliest cause was the **Preview** environment scope not having the three `VITE_*` variables, which were set for Production only).
- [~] Repository housekeeping (§8) — the branch and package rename are done; untracking `.claude/settings.local.json` is staged but uncommitted, and the five debug files are still there.
- [x] Payment provider decided: Lemon Squeezy (§2).

---

## 1. Ship the beta release — order matters

Production (`drivetag-ai.com` and `api.drivetag-ai.com`) deploys automatically whenever the `production` branch is pushed. Both halves come from that one branch.

**Why this order and not another:**

- **Database before backend.** If the backend deploys before `0005_beta.sql` has run, every beta route 500s and the boot log prints a `Schema problem` line.
- **Backend configured before the frontend is merged.** Both deploy from the same push, and Vercel is usually faster than DigitalOcean. Without `ADMIN_EMAILS` set first, you get a live `/beta` page and no way to see who signed up on it.
- **Both before you send a single outreach email.** §3.5 points strangers at `/beta`. Don't point them at it until step 1.5 passes.

### 1.1 Delete the five accidental debug files (before merging)

`production` has five files that were committed as "static JSON fixtures". They aren't fixtures. They're saved `curl` output — a `/health` response, an `Invalid or expired token` error, an `/api/plans` dump, a Supabase auth-settings dump and a Supabase `flow_state_not_found` error. Nothing in the codebase reads them, and they don't exist on `staging`, so merging won't remove them.

- [ ] Remove them as part of the release commit:

```bash
git checkout production
git pull origin production
git rm backend/h.json backend/m.json backend/p.json frontend/r2.json frontend/r3.json
git commit -m "Remove accidental debug JSON files"
```

Leave that branch checked out; step 1.4 continues from here.

> The two uncommitted `/beta` fixes in your working copy belong on `staging` first. Ask Claude to commit them, or commit them yourself, before you merge — otherwise the release ships without them and the sign-up form shows the raw `Missing bearer token` error to anyone who hits it mid-deploy.

### 1.2 Run migration `0005_beta.sql` in Supabase

- [ ] Supabase dashboard → project `ckskwjtjydaqewwojsfj` → **SQL Editor** → **New query**.
- [ ] Paste the **whole** of [`supabase/migrations/0005_beta.sql`](supabase/migrations/0005_beta.sql) and click **Run**.
  - One transaction: all of it applies or none of it does.
  - Safe to run twice.
  - The site that's live right now keeps working after it runs. It replaces one function with a better-behaved version of itself and adds one new table.
- [ ] Check it worked:

```sql
select version, applied_at from public.schema_migrations order by version;
```

Expect a row `0005_beta`.

```sql
-- The bug you reported. This now explains itself instead of naming an internal constraint.
select public.admin_grant_document_credits('YOUR-EMAIL', -250, 'testing the error');
```

Expect: `ERROR: insufficient_credits: document top-up balance is 0, cannot remove 250`. Nothing changes, and no row is written to the grants log — that's the fix. (If you actually want to remove credits, grant some first; see §5.)

```sql
select count(*) from public.beta_signups;
```

Expect `0`.

### 1.3 Check and set the DigitalOcean environment variables

App → **Settings → App-Level Environment Variables**.

**First, the one that can take the whole app down.**

> ### ⚠️ Legacy Supabase keys — do not disable them yet
>
> You've moved the browser side to the new keys. The **server** side is unconfirmed.
>
> - [ ] Open `SUPABASE_SERVICE_ROLE_KEY` on DigitalOcean and look at how it **starts**.
>   - Starts with **`sb_secret_`** → good, it's the new key.
>   - Starts with **`eyJ`** → it's still a legacy JWT. Replace it with the `sb_secret_` key from Supabase → **Settings → API Keys**, and redeploy.
> - **Judge it by the prefix, never by the length.** The two kinds of key are different lengths, and eyeballing "looks long enough" is how this gets missed.
> - **Only after that is confirmed and redeployed** may you disable legacy keys in Supabase. If you disable them while DigitalOcean still holds a JWT, every `/api/*` request fails with `Invalid or expired token`, all sorting stops — and `/health` stays green, so nothing tells you.
> - Worse, the failure lies about itself. `schemaProblem()` in `backend/src/repositories/usage.repo.js` attributes *any* Supabase RPC error to a missing migration, so a dead key prints `The database is missing supabase/migrations/0002_work_processes.sql (Invalid API key)` and sends you to re-run a migration that's been applied for weeks. That's a known defect and it's on Claude's list at the bottom of this file.

Then the four new beta variables. All are optional and everything fails closed without them, but without `ADMIN_EMAILS` you cannot see your own sign-ups.

| Variable | Value | What it does |
|---|---|---|
| `ADMIN_EMAILS` | `malvinherdyanto@gmail.com` | Who sees the **Beta sign-ups** card and may call the admin endpoints. Comma-separate for more. **Empty means nobody is an admin, including you.** |
| `GOOGLE_APP_TESTING` | `true` | Turns on the dashboard warning that Drive access expires every 7 days. **Set to `false` the day Google grants verification.** |
| `BETA_DISCOUNT_PERCENT` | leave unset for now | Beta tester discount, 1–90. Unset or `0` ⇒ no discount exists anywhere in the UI. |
| `BETA_DISCOUNT_CODE` | leave unset for now | The Lemon Squeezy discount code. Set both, or neither (§3.4). |

The rest of the variables are unchanged; the full list is in §7.

### 1.4 Merge `staging` into `production` and push

This is the step that actually deploys both halves. `staging` holds the entire release.

```bash
git merge staging
git push origin production
```

(You're still on `production` from step 1.1. There's no conflict: `staging` and `production` last shared `2eabbb7`, and nothing on `production` since then touches a file `staging` changed.)

### 1.5 Verify the deploy (about 5 minutes after pushing)

- [ ] DigitalOcean → **Runtime Logs**. No `Schema problem` line. If you see one, 1.2 didn't run — or the service key is wrong (see the warning box; the message will blame a migration either way).
- [ ] `https://api.drivetag-ai.com/health` returns `{"status":"ok"}`.
- [ ] `https://api.drivetag-ai.com/api/plans` now contains `"pricesIncludeTax":false`. If that field is missing, the backend hasn't finished deploying.
- [ ] `POST https://api.drivetag-ai.com/api/beta/signups` no longer answers `Missing bearer token`. That endpoint is public; an auth error means the old build is still up.
- [ ] `https://drivetag-ai.com/beta` loads and the form **submits successfully**. Submit a test sign-up with your own email.
- [ ] Sign in as yourself → `/dashboard` shows the **Beta sign-ups** card with that test submission in it. Sign in as anyone else and the card must not appear.
- [ ] `https://drivetag-ai.com/plans` shows "Excludes VAT/sales tax" next to the prices, and names Lemon Squeezy in the note underneath.

---

## 2. Lemon Squeezy

Lemon Squeezy is named in the legal pages as the **Merchant of Record**: the buyer's contract of sale is with them, they collect and remit VAT and sales tax, and they handle refunds and chargebacks. DriveTag never sees a card number. Their legal entity is **Sold through Link, LLC** (formerly Lemon Squeezy LLC, a Utah limited liability company) — that exact name is in `/privacy` and `/terms`. If they rename it again, those two pages are the only places to change.

Checkout itself is **not built**. The buttons say "Coming soon". Everything below is the groundwork, so that building checkout is a matter of filling in IDs rather than making decisions. The build itself is Claude's job and is waiting on §2.3.

### 2.1 ⚠️ Do not point the apex domain at Lemon Squeezy

`drivetag-ai.com` is an `A` record pointing at Vercel (`216.198.79.1`). Lemon Squeezy's custom-domain form offers an apex option and will tell you to add an `A` record on `@`. **That would take your website down** — the apex can only point at one place, and it has to stay on Vercel.

Use a subdomain:

- [ ] Lemon Squeezy → **Settings → Domains** → **+** → `checkout.drivetag-ai.com` (or `pay.`).
- [ ] Namecheap → **Advanced DNS** → add the **CNAME** they show you: host `checkout`, value `yourstore.lemonsqueezy.com`. **HTTPS / URL-redirect toggle off**, like your other records.
- [ ] Back in Lemon Squeezy, click **Verify Domain**. A "DNS not set up" error straight after saving is normal — it keeps re-checking and flips to active once the record propagates.
- [ ] Check from outside your own network: `nslookup checkout.drivetag-ai.com 8.8.8.8` should return the Lemon Squeezy target, not Namecheap's parking IP.

The apex `A` record, the `www` CNAME and the `api` CNAME all stay exactly as they are.

### 2.2 Store setup

- [ ] Store name and logo — this is what buyers see at checkout and on the receipt.
- [ ] Payout details, and the business/tax information they ask for. They can't pay you out without it, and they can't act as Merchant of Record without knowing who you are.
- [ ] Create the products. You need **one variant per purchasable thing**: 9 paid plans (× 2 for the 6 that have a yearly price — the three Enterprise tiers are monthly only) plus 6 top-up packs. That's 21 variants. The ids are in [`backend/src/config/plans.js`](backend/src/config/plans.js) — name each variant after the plan or pack id (`complete-studio`, `docs-pack-1000`, …). **This is what makes the webhook mapping unambiguous;** without it, matching a sale to a plan is guesswork.
- [ ] Enter every price **excluding tax**. The website states that prices exclude VAT and sales tax and that Lemon Squeezy adds the local rate at checkout. Tax-inclusive prices there would contradict the site.

### 2.3 The four values Claude needs before checkout can be built

Collect these, keep them out of git, and hand them over when you want that phase:

| Value | Where |
|---|---|
| Store ID | Settings → General |
| Variant ID per plan and pack | each product's variant page |
| API key | Settings → API |
| Webhook signing secret | Settings → Webhooks, when you create the endpoint |

The endpoint will be `https://api.drivetag-ai.com/webhook/lemonsqueezy`, subscribing to `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled` and `subscription_expired`. What Claude builds on top of them is spelled out at the bottom of this file.

---

## 3. Running the closed beta

While the Google OAuth app is in **Testing** status, DriveTag is invite-only whether you like it or not. Four rules come from Google, not from us:

| Google's rule | What it means for you |
|---|---|
| Max **100** test users | Every tester's email is added by hand under **Google Auth Platform → Audience → Test users**. There is no API for that list; copy-paste is the only way. |
| Refresh tokens expire after **7 days** | Sorting silently stops about once a week until the tester reconnects at `drivetag-ai.com/connect`. The dashboard warns them from day 5 (§1.3's `GOOGLE_APP_TESTING`). |
| Unverified consent screen | Testers see "Google hasn't verified this app" and must choose **Advanced → Continue**. Tell them before they hit it, or you lose them there. |
| Only listed emails can sign in | Anyone not on the list is refused by Google before they ever reach DriveTag. This is exactly why you collect emails first. |

None of this changes when verification is *submitted*. It changes when verification is *granted* (§4). Run both in parallel.

**Nothing in this section works until §1 is finished** — `/beta` isn't on the live site yet.

### 3.1 The flow, end to end

1. You send outreach (§3.5) pointing at **`drivetag-ai.com/beta`**.
2. They fill in the form: name, the Google account email they'll sign in with, what they do, rough weekly volume, and an unticked consent box.
3. The sign-up lands in `public.beta_signups`. **Nothing is emailed automatically** — no mail sender is wired up, on purpose.
4. You open `drivetag-ai.com/dashboard` signed in as an admin. The **Beta sign-ups** card is there only for you.
5. Click **Copy pending emails**, paste them into Google Auth Platform → Audience → Test users → **Add users**, Save.
6. Tick each row's **Added** box so you don't add anyone twice. The card counts how many of Google's 100 slots you've used.
7. Email them the welcome note (§3.5) yourself. Gmail mail-merge is fine at this volume.

This replaces the Tally/Google Forms + Google Sheet setup entirely: the form, the list and the "added yet?" column all live in the app, so there's no export step and no second copy of people's email addresses sitting in a spreadsheet.

### 3.2 Answering your own questions

- **"Is it the testing one I'm reaching out for?"** Yes. Until verification is granted, an account that isn't on the test-user list cannot sign in at all.
- **"Do test users still have to pay?"** Not today. Nothing can charge them — there's no checkout. They're on the **Free** plan (100 images, 25 documents, lifetime) unless you grant them more by hand (§5). When checkout exists, the beta discount below is what they pay.

### 3.3 Checking the admin view works

- [ ] Sign in at `/dashboard` as `malvinherdyanto@gmail.com` → **Beta sign-ups** card appears.
- [ ] Sign in with any other Google account → it must not appear, and `https://api.drivetag-ai.com/api/beta/signups` must answer `403` for that account.

### 3.4 Beta discounts

No code change is needed to turn this on:

1. Lemon Squeezy → **Discounts** → create one, e.g. `BETA50`, 50% off, and **limit the redemptions** — the code is shown to every approved tester, so treat it as semi-public.
2. Set `BETA_DISCOUNT_PERCENT=50` and `BETA_DISCOUNT_CODE=BETA50` on DigitalOcean, and redeploy.
3. Approved testers (rows with **Added** ticked) now see the regular price struck through and their beta price on `/plans`, with the code. Nobody else sees any of it. Unset either variable and the whole thing disappears — that's the off switch.

**Pick the number with the margins in front of you.** The AI cost per file doesn't fall when the price does, so a discount eats margin much faster than it cuts price. At full allowance use (the worst case, and the numbers behind [README.md](README.md)):

| Discount | Images C/S/E | Documents C/S/E | Images + Documents C/S/E |
|---|---|---|---|
| none | 72% / 63% / 49% | 59% / 55% / 50% | 64% / 53% / 41% |
| **30% off** | 62% / 49% / 29% | 44% / 38% / 31% | 50% / 35% / 17% |
| **50% off** | 48% / 31% / **2%** | 24% / 16% / **6%** | 33% / **10%** / **−14%** |

- **A flat 50% loses money on Images + Documents Enterprise** — about $10 a month per fully-used subscriber. Images Enterprise and Documents Enterprise land at 2% and 6%, which is break-even after hosting.
- Complete Enterprise breaks even at a **42.8%** discount.
- Keeping every plan above a 20% margin floor means capping a blanket discount at about **28%**.

Two things soften this: real usage sits well below the full allowance, and a beta tester is the least likely person to max out an Enterprise plan. **30% is the safe blanket number.** If you want to advertise 50%, build it in Lemon Squeezy as a discount limited to the Creator and Studio variants rather than a store-wide one — `BETA_DISCOUNT_PERCENT` is only what the website *displays*, so a store-wide 50% code would still apply at checkout even if the site showed something else. Keep the two in step.

> Decide before you publish it. A discount you advertise and then withdraw costs more trust than never offering one. 50% for the first 12 months is a common early-access deal; a permanent 50% is a promise you carry forever.

### 3.5 Cold outreach

**Before you send anything:** send a dozen ordinary emails from the account first so it isn't a cold sending domain, and keep to **30–50 a day**. Don't send from `support@` or `privacy@` — those only forward, and burning their reputation would hurt mail people actually need to reach you. Use your own Gmail.

**Rules, not suggestions:**
- At most **two** emails per person, ever.
- Business and role-relevant addresses only. Never scraped personal ones.
- Always identify yourself and give a one-step opt-out.
- Emailing anyone in the EU or UK brings GDPR in; emailing anyone at all brings Indonesia's PDP law in. A clear, specific reason for contacting *that person* is what keeps you right with both.

**First email.** A/B these subjects:
- *Beta invite: auto-sort your Drive files and documents*
- *Quick question about your Google Drive folders*

> Hi {{first_name}},
>
> I'm Malvin. I run DriveTag AI (drivetag-ai.com) at DeltaCo Creatives. I'm writing because {{one specific, true reason — e.g. "you run a design studio, so you're probably sitting on a few thousand client files still called IMG_4471"}}.
>
> DriveTag watches one folder in your Google Drive. Drop in an image or a document — PDF, Word, Google Doc — and it reads the file, renames it (say `invoice_acme_2026-08-31.pdf`) and moves it to the right folder. On its own, while you're not looking.
>
> Your files are never stored. They're read in memory and discarded.
>
> I'm inviting a small group of testers before launch. Two minutes to request access: drivetag-ai.com/beta
>
> Two honest heads-ups, because we're still in Google's review queue: you'll see a "Google hasn't verified this app" screen (choose Advanced → Continue), and you'll need to reconnect Drive about once a week. Both go away when the review finishes.
>
> Not for you? Reply "no" and I won't write again.
>
> Malvin
> DeltaCo Creatives, {{city}}, Indonesia · privacy@drivetag-ai.com

**Follow-up**, once, 4–5 days later:

> Hi {{first_name}} — floating this back up once, then I'll leave you alone. It's free during the beta and I'm happy to answer anything. If it's not relevant, say so and I'll close the loop.

**Welcome email**, after you've added them to the test-user list:

> Hi {{first_name}}, you're in. Sign in at drivetag-ai.com with **{{their_google_email}}** — it has to be that account, it's the one I added.
>
> Two things to expect:
>
> 1. "Google hasn't verified this app" → **Advanced** → **Continue**. We're in the review queue; this is what an app in review looks like.
> 2. Google expires our Drive access every 7 days while we're in review, so sorting will pause about weekly. The dashboard will tell you, and reconnecting takes one click at drivetag-ai.com/connect.
>
> You're on the free tier: 100 images and 25 documents, no time limit. Reply if you hit the limit and I'll sort you out.
>
> What I'd love back: tell me where it guessed wrong. That's the whole point of the beta.

### 3.6 What can't be automated

- **Adding test users.** No API exists. Copy-paste, about two minutes a batch.
- **Sending email.** No mail provider is wired into DriveTag, deliberately — it would mean storing more of people's data. Use Gmail mail-merge (e.g. YAMM) against the CSV you download from the admin card.
- **Charging testers.** No checkout yet. Set plans and credits by hand (§5).

### 3.7 Where to find people without being a pest

Your own network first, then Indonesian design and marketing communities. Freelancer groups on Facebook, LinkedIn and Discord — **post** there rather than DMing strangers. Subreddits and forums that permit self-promotion, following their rules. Personalise the first line every time; a templated blast gets reported as spam and takes your sending domain down with it.

---

## 4. Google: verification, branding, and going beyond test users

Partly done. What remains is the long pole for a public launch.

- [x] Search Console property, Cloud domain verification, branding links, test users.
- [ ] Submit for **brand verification**.
- [ ] Submit for **restricted-scope verification**, because of the full `drive` scope.
- [ ] Expect Google to ask for an annual **CASA** security assessment. Third-party estimates are $500–$4,500 a year; budget time and money.
- [ ] The day **OAuth app** verification is granted: set `GOOGLE_APP_TESTING=false` on DigitalOcean and redeploy, so testers stop being told about a 7-day expiry that no longer applies.
- [ ] Separately from the above: Drive **webhooks** are gated on Cloud Console *domain* verification, not on OAuth app verification, and that is already recorded as done. So check the runtime logs for a watch registering successfully; once one does, you can drop `AUTO_SYNC_INTERVAL_SECONDS` to `0` (§7). Until you see it, leave polling on.
- [ ] Optional, costs money: to make Google's sign-in screen say "DriveTag AI" instead of `ckskwjtjydaqewwojsfj.supabase.co`, set up a Supabase custom domain `auth.drivetag-ai.com` ([frontend/README.md](frontend/README.md#google-oauth-branding--verification)).

---

## 5. Managing plans, credits and sign-ups by hand

Run these in the Supabase **SQL Editor**; they only work there. Plan ids:

| Family | Plan ids |
|---|---|
| — | `free` |
| Images | `creator`, `studio`, `enterprise` |
| Documents | `docs-creator`, `docs-studio`, `docs-enterprise` |
| Images + Documents | `complete-creator`, `complete-studio`, `complete-enterprise` |

```sql
-- Put someone on a plan (a plan change restarts their monthly period)
select public.admin_set_plan('client@example.com', 'complete-studio');
```

```sql
-- Sell an image pack / a document pack (never expire)
select public.admin_grant_credits('client@example.com', 1000, 'Image pack 1000, invoice #12');
select public.admin_grant_document_credits('client@example.com', 250, 'Document pack 250, invoice #13');
```

```sql
-- Take credits back. Refused, with a readable message, if it would go below zero —
-- and in that case nothing is written to the grants log either. (Needs 0005.)
select public.admin_grant_document_credits('client@example.com', -250, 'Refund, invoice #13');
```

```sql
-- Where someone stands (both kinds)
select * from public.usage_snapshot((select id from auth.users where email = 'client@example.com'));
```

```sql
-- Beta sign-ups: mark someone added to Google's test-user list without the dashboard
select public.admin_mark_beta_added('client@example.com');
```

```sql
-- Beta sign-ups: delete one on request (the Privacy Policy promises this)
delete from public.beta_signups where lower(email) = lower('client@example.com');
```

The last three need `0005_beta.sql` (§1.2). Prices and allowances live in `backend/src/config/plans.js`. Changing a number is a code change; adding a plan id also needs a migration.

---

## 6. Business decisions still open

- [x] **Payment provider** — Lemon Squeezy (§2).
- [ ] **Build checkout.** Needs §2.3's four values. Until then every purchase is manual (§5).
- [ ] **The beta discount number** (§3.4). Decide before you advertise it.
- [ ] **Final prices.** Everything shown today is a placeholder; the margins behind them are in [README.md](README.md). Confirm or adjust.
- [ ] **Public launch vs invite-only.** Public needs §4's verification and CASA. Invite-only can stay on the test-user list indefinitely, capped at 100.

---

## 7. Settings reference (done, but you'll come back here)

<details>
<summary>DNS (Namecheap) — done</summary>

Apex `A @ 216.198.79.1` with the HTTPS toggle **off**; `www` CNAME to Vercel's value, HTTPS off, set to redirect to the apex; the Google TXT record on host `@`, not `google`; `api` CNAME to `drivetag-ai-geirr.ondigitalocean.app`; MX eforward records kept; the `dcv.ssl.com` CNAME is unrelated and stays. Do **not** switch to Vercel nameservers. Adding Lemon Squeezy means one more CNAME on a subdomain (§2.1) — never the apex.
</details>

<details>
<summary>Email forwards — done</summary>

Namecheap → `drivetag-ai.com` → **Domain** tab → **Redirect Email**: `support@` and `privacy@` both forward to your inbox. The Privacy Policy, Terms, Refund Policy and Data-deletion page all publish these.
</details>

**DigitalOcean** — App → **Settings → App-Level Environment Variables**:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_SERVICE_ROLE_KEY` | must start `sb_secret_` — **unconfirmed, see §1.3** |
| `SUPABASE_ANON_KEY` | the `sb_publishable_` key |
| `FRONTEND_URL` | `https://drivetag-ai.com` |
| `CORS_ORIGINS` | `https://drivetag-ai.com` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.drivetag-ai.com/api/auth/google/callback` |
| `DRIVE_WEBHOOK_URL` | `https://api.drivetag-ai.com/webhook/drive` |
| `AUTO_SYNC_INTERVAL_SECONDS` | `60` (polling) until §4's verification lands |
| `MAX_CONCURRENT_AI_JOBS` | `10` on a 1 GB instance; the default 20 is fine at 2 GB+ |
| `ADMIN_EMAILS` | §1.3 |
| `GOOGLE_APP_TESTING` | §1.3 |
| `BETA_DISCOUNT_PERCENT`, `BETA_DISCOUNT_CODE` | §3.4 |

The complete list, with what each one does, is in [backend/README.md](backend/README.md).

**Vercel** — Settings → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the `sb_publishable_` key) and `VITE_API_URL=https://api.drivetag-ai.com`. Analytics enabled.

- Set all three for **every** environment scope you build in, not just Production. A build failed earlier today with "Missing VITE_API_URL", and a Preview build without them will fail the same way — `vite build` refuses to run without all three.
- After changing any variable, redeploy with **"Use existing build cache" turned off** — the values are baked in at build time.

**Supabase** — Site URL `https://drivetag-ai.com`; redirect URLs `https://drivetag-ai.com/**` and `http://localhost:5173/**`.

- [x] New publishable + secret API keys created, and set on the frontend and in both local `.env` files.
- [ ] Confirm DigitalOcean's `SUPABASE_SERVICE_ROLE_KEY` is the `sb_secret_` one (§1.3).
- [ ] **Only then**, and before the end of 2026, disable the legacy `anon` / `service_role` keys.

**AI provider** — billing stays enabled on the project behind the key (on the free tier Google may use submitted files to improve its products, which the Privacy Policy rules out). Still worth doing: a **budget alert** in Google Cloud Console → Billing → Budgets & alerts, say $50/month. Google's price for this model doubles on 2027-01-01, and README.md's per-file costs already assume that.

---

## 8. Repository housekeeping — two items left

- [ ] `.claude/settings.local.json` — added to `.gitignore` (line 34); `git rm --cached` has been run, so untracking is staged in the working tree but **not yet committed** (the file stays on your machine).
- [x] Remote branch `production-vdsjba` deleted — it pointed at `f7b33a0`, already part of `production`, so nothing was lost.
- [x] `frontend/package.json` renamed from `temp-front` to `drivetag-frontend`.
- [ ] The five debug JSON files on `production` (§1.1) — not done, and it's the one piece of housekeeping left.

---

## What Claude will do when you say go

Code work, waiting on you. Nothing here needs a dashboard; it needs a decision or a value. Ask for them by name.

| # | Ask for | What you hand over first | What you get |
|---|---|---|---|
| 0 | **Commit the two `/beta` fixes onto `staging`** | nothing | The auth-shaped-error message and the new-tab consent link in `frontend/src/pages/Beta.tsx`, committed before the merge. Do this first — see §1.1. |
| 1 | **Lemon Squeezy checkout + webhook** | §2.3's four values: Store ID, the 21 variant IDs, an API key, the webhook signing secret | Hosted-checkout links on every plan card and top-up pack, and `POST /webhook/lemonsqueezy` with HMAC signature verification. Handlers for `order_created` (calls `grant_credits(...)` for packs), `subscription_created` / `subscription_updated` / `subscription_cancelled` / `subscription_expired` (set `subscriptions.plan`, `status` and `period_anchor`). Manual §5 SQL stops being the only way to sell anything. |
| 2 | **Fix the `schemaProblem()` lie** | nothing | `backend/src/repositories/usage.repo.js` currently blames a missing migration for *any* Supabase RPC error, so a bad API key reads as "run 0002". It'll tell the difference between an auth failure and an absent function. |
| 3 | **Delete the five debug JSON files** | nothing — or do it yourself with §1.1's command | The `git rm` in §1.1, committed on `production` as part of the release. |
| 4 | **The legacy-endpoint cleanup release** | nothing | Removes the transitional single-folder shims — `/api/drive/config`, `/api/drive/raw-status`, `/api/drive/organize`, and the `config` / `subscription` / `entitled` fields on `/api/me`. They map onto your first work process and nothing in the current frontend calls them. Ship it once `production` and `staging` are level, not during a deploy window. |
| 5 | **`helmet` and app-wide rate limiting** | nothing | Security headers plus a limiter on every route. Today only `POST /api/beta/signups` is limited, by an in-memory single-instance Map. |
| 6 | **Re-sorting an already-sorted file** | a decision on what "re-sort" should mean | `processed_files` is unique on `(user_id, file_id)`, so a file is sorted automatically at most once and there is no "run it again" action. |

Ask for #0 and #3 together, as part of the §1 release. Ask for #1 when the Lemon Squeezy store is set up. #2, #5 and #6 can be done any time.
