# DeveloperToDo — what only you can do

Everything below needs your accounts (Supabase, Namecheap, Google, DigitalOcean, Vercel, Lemon Squeezy) or a business decision, so no code can do it for you. Each step says how to check that it worked.

**The beta and checkout releases have both shipped, so §1 is now a record of what was done.** Start at §0. The next thing to ship is the **owner settings page at `/admin`** — built and tested, but uncommitted, and its migration `0007_admin.sql` hasn't been run yet; the ordered steps are **§2.5**. Lemon Squeezy's dashboard now has a document of its own, [**LemonSqueezySetup.md**](LemonSqueezySetup.md): this list tells you *when* and *why*, that one tells you *which field*. **§2.1** records a DNS incident that briefly broke the live site for a share of your visitors — it's already fixed, but it's worth reading once for the standing rule it left behind.

Tick items off as you go. When a section is fully done, tell Claude, so the READMEs' status tables get updated.

The last section, [**What Claude will do when you say go**](#what-claude-will-do-when-you-say-go), is the other half of this list: the code work that's waiting on you. Nothing there needs your dashboards — it needs your word.

---

## 0. Where things stand — read this first

As of 2026-09-21:

| | State |
|---|---|
| **The code (live)** | ✅ The closed-beta, VAT **and checkout** releases are all live. `production` is `aa9f464`, and the working copy is on that branch. Checkout links, the signed `POST /webhook/lemonsqueezy`, `helmet`, app-wide rate limiting, the printed receipt, the `schemaProblem()` fix and the new AI-worker counts (§1.6) are all deployed. |
| **The code (working tree)** | ⚠️ The **owner settings page at `/admin` is built and tested but uncommitted** — a 21-box variant editor, the beta discount, the Google testing toggle, account lookup with plan and credit changes, and database-backed settings behind all of it. 242 backend tests pass, the frontend builds. **None of it is live**, so a `git status` full of changes is expected. |
| **Migration `0007_admin.sql`** | ❌ **Not run.** It's step 1 of §2.5. It creates `app_settings` plus two admin SQL helpers. The release is deliberately written to survive its absence — settings fall back to environment values and the log says so once — but until it's run, nothing you type into `/admin` can save. |
| **Migrations `0001`–`0006`** | ✅ All applied. `0006_checkout.sql` was run before the checkout deploy, as it had to be. |
| **Lemon Squeezy store** | ❌ Not created. No store, no products, no variants, no webhook endpoint, no signing secret. Every buy button says "Coming soon", which is correct: `GET /api/plans` reports `checkoutEnabled: false` until a store slug and at least one variant id exist. |
| **A real purchase** | ❗ **Never tested, not even in test mode.** Every part of checkout is unit-tested and not one of those tests has touched real money. §2.5 step 7, and it is not optional. |
| **The live website** | ✅ `drivetag-ai.com` serves the release. Verified in a real browser on 2026-09-21: `/plans` shows "Excludes VAT/sales tax" under each of the 9 priced cards, names Lemon Squeezy as Merchant of Record once, and still shows "Coming soon" on all 9. |
| **The live API** | ✅ `api.drivetag-ai.com/api/plans` serves `checkoutEnabled`, `pricesIncludeTax` and `merchantOfRecord`. `POST /api/beta/signups` answers `{"received":true}` with no bearer token. |
| **Supabase API keys** | ✅ Both sides migrated. Browser on `sb_publishable_`, DigitalOcean on `sb_secret_`, local `.env` files too. |
| **DigitalOcean** | ✅ `ADMIN_EMAILS` set, which is what makes the admin card — and, after this release, `/admin` — yours and nobody else's. `LEMONSQUEEZY_WEBHOOK_SECRET` is **not** set (§2.5 step 6). |
| **Vercel `VITE_API_URL`** | ✅ Set, across the environment scopes you build in. |
| **Repository housekeeping** | ✅ Done. The five debug JSON files are deleted, `.claude/settings.local.json` is untracked and ignored (§8). |
| **DNS** | ✅ **Resolved, 2026-09-20.** The apex briefly had a second `A` record pointing at Lemon Squeezy; it's deleted, and the apex resolves to Vercel only. Record and standing rule: **§2.1**. |

> ### The one thing to keep straight in this release
>
> **The store slug and the 21 variant ids go into `/admin`, not into DigitalOcean.** They're configuration: the page saves them to the database and the buy buttons come alive within about thirty seconds, with no redeploy and no environment variable.
>
> **Only `LEMONSQUEEZY_WEBHOOK_SECRET` stays an environment variable**, because it is a secret, and secrets never go in the database or onto a web page.
>
> The same split applies to the beta discount (§3.4) and the Google testing flag (§4): both move to `/admin`. And `ADMIN_EMAILS` stays environment-only *by design* — it is the root of trust for `/admin` itself, so there is no settings key and no write path that can change it. A request that tries to set `adminEmails`, the webhook secret or the service-role key is rejected whole, even if it also carries a legitimate key.

So: §1 is a record rather than a to-do, and checkout is deployed but not yet *connected* to anything. **Your next block of work is §2.5** — it's the only thing standing between a working checkout and a live one. Everything else worth your time is §3 and §4.

Done since the last version of this list:

- [x] **The checkout release shipped** — `0006_checkout.sql` run, merged, pushed, live. Checkout links, the signed webhook, `helmet`, rate limiting, the receipt page and the `schemaProblem()` fix are all in production.
- [x] The AI-worker counts went live with it — Creator 2, Studio 3, Enterprise 10 (§1.6).
- [x] **The owner settings page built** (uncommitted): `/admin`, with Payments, Closed beta, Google, Accounts and the existing Beta sign-ups card. Five settings — and only five: the store slug, the variant map, the beta discount percent, the beta discount code and the Google testing flag — now resolve `database → environment → default`, so those five stop being redeploys. Everything else in the app still reads its environment variable directly.
- [x] **[LemonSqueezySetup.md](LemonSqueezySetup.md) written** — every field of every form, all 21 products with their exact names and prices, the webhook and its eight events, a wiring diagram and a troubleshooting table. §2 defers to it now instead of repeating it.
- [x] The beta release shipped — migration, environment variables, merge, push, verified live (§1).
- [x] Supabase publishable / secret key swap finished on **both** sides, browser and server.
- [x] Vercel `VITE_API_URL` fixed (the failed build was missing it; the likeliest cause was the **Preview** environment scope not having the three `VITE_*` variables, which were set for Production only).
- [x] Repository housekeeping (§8) — branch rename, package rename, `.claude/settings.local.json` untracked, debug files deleted.
- [x] Payment provider decided: Lemon Squeezy (§2).

---

## 1. Ship the beta release — ✅ done, 2026-09-20

**This is a record now, not a to-do.** The release is live, and so are the two leftovers that used to sit in 1.6 and 1.7 — both went out with the checkout release. 1.1–1.7 are kept ticked so you can see what was done and in what order.

Production (`drivetag-ai.com` and `api.drivetag-ai.com`) deploys automatically whenever the `production` branch is pushed, and both halves come from that one branch. That's still true — it's how 1.6 will happen.

### 1.1 Delete the five accidental debug files — done

- [x] `backend/h.json`, `backend/m.json`, `backend/p.json`, `frontend/r2.json`, `frontend/r3.json` removed in `392236b`. They were saved `curl` output committed as "static JSON fixtures"; nothing in the codebase read them, and nothing missed them.

### 1.2 Run migration `0005_beta.sql` in Supabase — done

- [x] Run in the **SQL Editor** on project `ckskwjtjydaqewwojsfj`. `select version, applied_at from public.schema_migrations order by version;` now lists `0001` through `0005`, and the backend boots with no `Schema problem` line.

What it bought you: the `beta_signups` table behind `/beta`, and the fix for the bug you reported — a credit removal that would go below zero now refuses itself with a readable message and writes nothing to the grants log, instead of naming an internal constraint. The SQL for both is in §5.

### 1.3 Check and set the DigitalOcean environment variables — done

App → **Settings → App-Level Environment Variables**.

- [x] `SUPABASE_SERVICE_ROLE_KEY` confirmed to start **`sb_secret_`**. That closes the Supabase key migration on both sides. If you ever rotate it again: **judge it by the prefix, never the length** — the two kinds of key are different lengths, and "looks long enough" is how this gets missed.
- [x] `ADMIN_EMAILS` = `malvinherdyanto@gmail.com`. This is what makes the **Beta sign-ups** card appear for you and nobody else. Empty would mean nobody is an admin, including you.
- [ ] `GOOGLE_APP_TESTING` — **still unset**, and after the admin release you won't set it here at all: it becomes a switch on `/admin` → **Google** (§4).
- [ ] `BETA_DISCOUNT_PERCENT` / `BETA_DISCOUNT_CODE` — still unset on purpose, and likewise moving to `/admin` → **Closed beta**. §3.4 is the decision, not the dashboard.

The rest are unchanged; the full list is in §7, and disabling the old legacy Supabase keys is the last item there.

### 1.4 Merge `staging` into `production` and push — done

- [x] `540af6b` (the release plus the two `/beta` form fixes) → `f851715` (merge `staging` into `production`) → `392236b` (the debug-file removal). Both halves deployed from that push. Note the two branches are **not** level: `production` is four commits ahead of `staging` (three at the time, plus the later checkout merge), though their trees are identical.

### 1.5 Verify the deploy — done

- [x] DigitalOcean → **Runtime Logs**: no `Schema problem` line.
- [x] `https://api.drivetag-ai.com/health` → `{"status":"ok"}`.
- [x] `https://api.drivetag-ai.com/api/plans` carries `pricesIncludeTax` and `merchantOfRecord`.
- [x] `POST https://api.drivetag-ai.com/api/beta/signups` → `{"received":true}`. Public, no bearer token, working.
- [x] The live frontend bundle contains `/beta`, and the form submits.
- [x] Both browser checks done.
  - `https://drivetag-ai.com/plans` — **verified in a real browser on 2026-09-21.** "Excludes VAT/sales tax" appears once under every priced card (9 in total), the fuller sentence naming Lemon Squeezy as Merchant of Record appears once, and "Coming soon" still shows on all 9 because `checkoutEnabled` is correctly `false` until the variant ids are in.
  - The **Beta sign-ups** card appears for you and for nobody else — confirmed by you (§3.3).

### 1.6 Redeploy the backend so the new AI-worker counts take effect — done

The AI workers per process changed — **Creator 3 → 2, Studio 5 → 3, Enterprise 15 → 10**; Free stays at 1. It shipped with the checkout release and is live.

It costs you nothing in margin. `aiPerProcess` is used in exactly one place in the whole backend — the concurrency limit in `runProcessQueue` — and a file is one AI call however many workers pull it, so every margin figure in [README.md](README.md) still stands. What changes is speed, and honesty:

| Tier | Allowance | Workers | Time to clear a full backlog (est. 4s/file) |
|---|---|---|---|
| Creator | 1,000 images | 3 → **2** | 22m → 33m |
| Studio | 5,000 | 5 → **3** | 1h07 → 1h51 |
| Enterprise | 25,000 | 15 → **10** | unchanged if the deployed cap is 10 — `MAX_CONCURRENT_AI_JOBS` is recommended at `10` on a 1 GB instance (confirm the deployed value; the code default is `20`) |

Enterprise's old "15" was never deliverable on the instance you're paying for. 10 is simply the true number.

- [x] Committed and deployed with the checkout release. No separate deploy was needed.
- [ ] Worth one look if you haven't: `https://api.drivetag-ai.com/api/plans` should show `"aiPerProcess":2` on `creator` and `10` on `enterprise`, and the Creator card on `/plans` should read "2 AI workers sorting each process at once".

> **Before you sell an Enterprise seat:** confirm what `MAX_CONCURRENT_AI_JOBS` is actually set to on DigitalOcean — nobody has read it back from the dashboard yet. If it's the recommended `10`, Enterprise's 10 workers exactly equal the server-wide cap, and that queue is FIFO rather than fair across users, so one Enterprise customer could occupy every slot while everyone else waits. Move the app to 2 GB and set `MAX_CONCURRENT_AI_JOBS=20` first (§7). Twenty in-flight jobs hold roughly 360 MB of file buffers.

### 1.7 Delete the test sign-up row

- [x] **Done.** A test submission was made against the live form while verifying 1.5; it has been deleted, so your first real tester is genuinely the first row. For reference, the statement was:

```sql
delete from public.beta_signups where lower(email) = 't@example.com';
```

---

## 2. Lemon Squeezy

Lemon Squeezy is named in the legal pages as the **Merchant of Record**: the buyer's contract of sale is with them, they collect and remit VAT and sales tax, and they handle refunds and chargebacks. DriveTag never sees a card number. Their legal entity is **Sold through Link, LLC** (formerly Lemon Squeezy LLC, a Utah limited liability company) — that exact name is in `/privacy` and `/terms`. If they rename it again, those two pages are the only places to change.

**Checkout is built and deployed** — buy buttons, the checkout link, the signed webhook, the receipt — but it is **unconfigured**, so today every button still says "Coming soon". That's deliberate: with no store slug and no variant ids set, `GET /api/plans` reports `checkoutEnabled: false` and nothing is marked `purchasable`, so the UI can't offer a button that would lead nowhere. **§2.5 is the ordered list that turns it on.**

> ### The dashboard mechanics live in one document now
>
> **[LemonSqueezySetup.md](LemonSqueezySetup.md)** is the field-by-field walkthrough: the store settings, all 21 products with their exact names and prices, every field on the Add Product form and what to leave empty, the tax category, how to read a variant id off a checkout link, the webhook and its eight events, a wiring diagram and a troubleshooting table.
>
> **This section no longer repeats any of that**, on purpose — two copies of a 21-row product list would drift within a week, and the wrong one would be the one you followed at 1am. What stays here is the part that isn't mechanics: the hazard in §2.1, where each value you produce ends up (§2.3), how the two halves connect (§2.4), and the order to do it all in (§2.5).
>
> One thing that *is* mechanics but is worth knowing before you open that document: Lemon Squeezy's **Domains** setting is cosmetic — it only rebrands *their* hosted pages, it has nothing to do with serving DriveTag, and pointing the apex at it takes the site down. Skip it. §2.1 is what happened the one time it wasn't skipped.

### 2.1 Resolved: the apex must never point at Lemon Squeezy — standing rule

**This happened once already, on 2026-09-20 — keep it from happening again.** A second `A` record for `@` → `3.33.255.208` (Lemon Squeezy) was added alongside Vercel's `216.198.79.1`. Both were published, so DNS handed out both and each visitor's resolver picked one. Measured the same day: Google's resolver (`8.8.8.8`) returned the **Lemon Squeezy address first, every time**, and that address answered `HTTP 403` for `drivetag-ai.com`. The site looked fine from the office only because the local resolver had Vercel cached.

Lemon Squeezy's own dialog says *"You can have only one A record associated with your primary domain. If your domain is already associated with an A record, amend it to the Lemon Squeezy IP address."* Following that literally replaces your website with their storefront. **The apex can only point at one place, and it has to stay on Vercel — never let anything, including a future Lemon Squeezy setup step, add a second `A` record on `@`.**

**Fixed the same day:**

- [x] Namecheap → **Advanced DNS** → deleted the `A` record `@ → 3.33.255.208`. Kept `A @ → 216.198.79.1` with **HTTPS off**.
- [x] Lemon Squeezy → **Settings → Domains** → the `drivetag-ai.com` row → **…** → removed it.
- [x] Verified from outside the office network, more than once, on 2026-09-20:

```bash
nslookup drivetag-ai.com 8.8.8.8   →  216.198.79.1   (only — no 3.33.255.208)
curl https://drivetag-ai.com/       →  HTTP 200 via 216.198.79.1, three times out of three
curl https://drivetag-ai.com/beta   →  HTTP 200
```

Only `216.198.79.1` now resolves. If a second address ever reappears, roughly half the internet gets a 403 again — check with the same `nslookup` before assuming it's fine.

**If you still want a branded checkout address** (entirely optional, still open, and [LemonSqueezySetup.md](LemonSqueezySetup.md) tells you to skip it — with the overlay the buyer never sees that address anyway, and `yourstore.lemonsqueezy.com` works fine and costs nothing):

- [ ] Namecheap → add `A` record, host `checkout`, value `3.33.255.208`, **HTTPS off**.
- [ ] Lemon Squeezy → **Settings → Domains** → **+** → `checkout.drivetag-ai.com`, then **Verify Domain**. A "DNS not set up" error straight after saving is normal; it re-checks on its own.
- [ ] Keep the `lemonsqueezy-verification` TXT record on `@`. It is how they prove you own the domain and it conflicts with nothing.
- [ ] Check: `nslookup checkout.drivetag-ai.com 8.8.8.8` returns `3.33.255.208`, and `nslookup drivetag-ai.com 8.8.8.8` still returns only Vercel.

The apex `A` record, the `www` CNAME and the `api` CNAME otherwise stay exactly as they are.

### 2.2 Store, products and variants — follow LemonSqueezySetup.md

All of it is there and none of it is here: **[LemonSqueezySetup.md](LemonSqueezySetup.md)**, §1 for the store settings and §2–§4 for the 21 products and their ids. About 90 minutes.

Three things that document will tell you, repeated once here because they're the ones that go wrong quietly:

- **21 products**, one per purchasable thing — 9 paid plans, 6 of them again as a yearly product, plus 6 top-up packs. The three Enterprise tiers are **monthly only**, by decision. (The app agrees: asking for a yearly Enterprise checkout resolves to nothing, so a stray `enterprise-yearly` variant can't sell a price the website never advertised.)
- **Every price excluding tax.** The website says prices exclude VAT and sales tax and that Lemon Squeezy adds the local rate. A tax-inclusive figure there makes the site a liar and eats your margin.
- **There is no "Redirect URL" field** on the Add Product form — an earlier version of this list said there was, and that was wrong. The way back is the **Confirmation modal → Button link**, set to `https://drivetag-ai.com/checkout/success` on all 21. The overlay also returns buyers on its own now, by listening for Lemon Squeezy's `Checkout.Success` event, so the button is the fallback for anyone who pays outside it.

### 2.3 The three values you produce — and where each one goes

**Three, not four.** An earlier version of this list said four and counted an API key. There is no API key — the code never asks for one and never stores one, because a plain checkout link needs none (§2.4). If Lemon Squeezy's dashboard offers you one, leave it where it is.

**This is the single most confusable thing in this release, so it gets its own table.** Two of the three now go into the app's own settings page; only the secret is still an environment variable.

| Value | Where you get it | Where you put it | Needed for |
|---|---|---|---|
| Store subdomain slug | your store URL — the `yourstore` in `yourstore.lemonsqueezy.com` | **`/admin` → Payments** | building the checkout URLs. It's the slug, **not** the numeric Store ID. |
| Variant id × 21 | each product's checkout link — the number on the end | **`/admin` → Payments**, one labelled box per plan and pack | knowing *which* plan or pack was bought. No JSON to hand-write any more; the boxes are labelled with our ids. |
| Webhook signing secret | Settings → Webhooks, when you create the endpoint | **DigitalOcean env `LEMONSQUEEZY_WEBHOOK_SECRET`** | **the important one** — it's what proves a "they paid" message really came from Lemon Squeezy. Empty, and the webhook refuses every request. |

**Why the split:** the first two are configuration — they belong to the running app, they're not sensitive, and changing one should never need a redeploy. The third is a secret, and secrets stay in the environment where no browser session can read them back. The settings page can't be talked into storing it either: the webhook secret, the Supabase service-role key and `ADMIN_EMAILS` are not settings keys at all, and a request naming any of them is rejected whole.

`LEMONSQUEEZY_STORE` and `LEMONSQUEEZY_VARIANTS` still exist as environment variables and still work — the app resolves every setting **database → environment → default**. Treat them as a fallback you shouldn't need. If a value ever comes from the wrong place, `/admin` tells you which source it's reading, and one click clears a database override so the environment applies again.

All three fail closed. Miss the store slug or the variants and the buttons stay "Coming soon" instead of sending someone to a broken link; miss the secret and no payment is ever acted on. Nothing half-works quietly.

The endpoint is `https://api.drivetag-ai.com/webhook/lemonsqueezy`, subscribing to all eight of `order_created`, `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_success` and `subscription_payment_failed`. [LemonSqueezySetup.md §5](LemonSqueezySetup.md) says what DriveTag does with each; §2.5 below is the order to do it all in.

### 2.4 How DriveTag connects to Lemon Squeezy

You guessed "via API". Half right — and the half that isn't is the half that matters. There are two directions, and only one of them is an API. [LemonSqueezySetup.md §7](LemonSqueezySetup.md) draws it; this is the short version.

**Outbound — sending someone off to pay. No API key needed.** Every plan and pack is a plain link, `https://<your-store>.lemonsqueezy.com/checkout/buy/<VARIANT_ID>`, with the buyer's DriveTag account id attached as `checkout[custom][user_id]=…`. **That parameter is the thread that ties a payment back to an account**; without it a payment arrives with an email address and a hope. Lemon Squeezy's `lemon.js` renders the same checkout as an overlay on our page, and if the script fails, is missing its API or takes longer than four seconds, the browser just follows the link instead — a slow script never costs you a sale. Their REST API (`POST /v1/checkouts`) is for bespoke cases we don't have, which is why there's no API key anywhere in this.

One trap worth knowing: opening a checkout link turns it into a single-use `/checkout/?cart=…` URL. Never copy that out of your address bar into an email — it belongs to one buyer.

**Inbound — finding out that they actually paid. A webhook, and it is mandatory.** Lemon Squeezy `POST`s the moment money moves, and **that message is what grants the plan or the credits** — not the buyer's browser, which could close mid-redirect and which we could never trust anyway. Every message carries an `X-Signature` hash of the exact body, keyed with your signing secret; we recompute and compare. It has to answer `200`, or they retry three more times (roughly 5s, 25s, 125s) and give up.

**Two things worth knowing about how it was built**, neither of which needs anything from you:

- `backend/src/app.js` parses JSON for every route, which throws the raw body away — and the raw body is exactly what the signature is computed over. So the Lemon Squeezy webhook is mounted *before* that parser and reads the raw bytes itself. The Drive webhook is unaffected; it authenticates with a shared-secret header rather than a body hash.
- **The payment webhook does the work before it answers**, which is the opposite of the Drive one. Drive gets an instant `200` and the sorting happens afterwards, because a missed notification is recoverable — the next sweep picks the file up. A missed payment is not recoverable: nobody retries it and the customer has already been charged. So this webhook grants the plan or the credits first and only then answers `200`; anything that goes wrong answers `500` so Lemon Squeezy redelivers. Every handler is written to be safe to run twice, which is what makes those redeliveries harmless rather than a double grant.

**In one sentence:** a link sends them to pay with their user id attached, and a signed webhook comes back to tell us they did — there is no API key in any of it.

### 2.5 Turn checkout on — in this order

Checkout is already deployed. What's left is the owner settings page that holds its configuration, and then the configuration itself. **The order matters**: each step is useless before the one above it, and the page you'll type the variant ids into doesn't exist until step 2 is pushed.

Steps 1–3 are about half an hour. Step 4 is the 90-minute one.

#### Step 1 — Run `0007_admin.sql` in Supabase

Supabase → **SQL Editor** on project `ckskwjtjydaqewwojsfj` → paste [`supabase/migrations/0007_admin.sql`](supabase/migrations/0007_admin.sql) → Run.

- Check: `select version, applied_at from public.schema_migrations order by version;` lists `0001` through `0007`.
- It adds three things: `app_settings`, the table `/admin` saves into; `admin_user_lookup`, which resolves an email to an account for the Accounts screen; and `admin_set_plan_by_id`, the backend-reachable sibling of the `admin_set_plan` you already run by hand in §5.
- **`app_settings` is configuration only, never secrets.** Anything in it is readable by whoever holds an admin session, which is exactly why the webhook signing secret isn't allowed anywhere near it.
- **Before the deploy, as usual** — though this one is unusually forgiving. The new code is written to survive a missing `app_settings`: it logs once and falls back to environment values, so a deploy that beat you to it degrades instead of breaking. Run it first anyway; until you do, nothing you type into `/admin` can save.

#### Step 2 — Deploy

Ask Claude to commit and push the release (closing table, #1). DigitalOcean and Vercel each redeploy from the `production` push on their own.

- Check after: no `Schema problem` line in DigitalOcean's **Runtime Logs**, and `https://api.drivetag-ai.com/health` is `{"status":"ok"}`.
- Nothing visible changes for your users. `/plans` still says "Coming soon" — correctly, because no variant ids exist yet.

#### Step 3 — Open `/admin` and confirm it's yours alone

Go to `https://drivetag-ai.com/admin` signed in as yourself. Do both halves, the same way you checked the Beta sign-ups card in §3.3:

- [ ] Signed in as `malvinherdyanto@gmail.com` → the **Owner settings** page loads, with Payments, Closed beta, Google, Accounts and the Beta sign-ups card. There's a link to it on your dashboard too.
- [ ] Signed in with another Google account → you get "This page is for the account owner" and no settings. **Check this one for real.** It should hold even if it didn't: `me.admin` only decides what renders, and every `/api/admin/*` call re-checks your email server-side, so a curious visitor typing the URL gets a 403 from the API regardless of what the page draws.
- [ ] The header says `ADMIN_EMAILS: 1 address configured`. If it says 0, `ADMIN_EMAILS` is empty on DigitalOcean and nobody is an admin, including you.

While you're here: each setting shows where its value came from — **database**, **environment** or **default** — and anything overridden in the database can be cleared back to the environment with one click.

#### Step 4 — Create the store, the 21 products and the webhook

Follow **[LemonSqueezySetup.md](LemonSqueezySetup.md)** end to end (§2 and §2.2 above are the summary). Come out of it with: the store slug, 21 variant ids, and the webhook signing secret.

Two decisions it makes for you that are worth knowing you agreed to: skip **Settings → Domains** entirely (§2.1), and set every product's **Confirmation modal → Button link** to `https://drivetag-ai.com/checkout/success`.

#### Step 5 — Put the store slug and the 21 variant ids into `/admin`

`https://drivetag-ai.com/admin` → **Payments**.

- The store slug is the subdomain only. If your checkout lives at `drivetag.lemonsqueezy.com`, it's `drivetag`.
- Then one labelled box per purchasable thing, in the same order as LemonSqueezySetup.md's tables. Paste each variant id into the box with the matching name. No JSON, no environment variable, no redeploy.
- **A plan goes live on its own as soon as its box is filled.** You can do Creator first, test it end to end, and add the rest afterwards — that's a legitimate way to go slowly. Anything still blank keeps saying "Coming soon".
- Changes take effect within about thirty seconds (the backend re-reads settings on a short cycle rather than blocking every request on the database).
- Check: `https://api.drivetag-ai.com/api/plans` now shows `"checkoutEnabled":true`, with `"purchasable":true` on exactly the plans you filled in. If it's still `false`, the store slug is empty or no box has been saved — it's this step, not the deploy.

#### Step 6 — Set `LEMONSQUEEZY_WEBHOOK_SECRET` on DigitalOcean

The one value that does **not** go in `/admin`. App → **Settings → App-Level Environment Variables** → `LEMONSQUEEZY_WEBHOOK_SECRET` = the signing secret from step 4. Never into git, never into a chat. Redeploy after saving.

- Until it's set, the webhook refuses everything and Lemon Squeezy shows the deliveries failing. That's fail-closed, not a bug. The proof a request reached the app at all is a `ls_webhook_unconfigured` line in the runtime logs.

#### Step 7 — Make one real test-mode purchase, end to end. Non-negotiable.

Put the store in **test mode**, use Lemon Squeezy's test card, and buy as yourself, through the actual website. [LemonSqueezySetup.md §6](LemonSqueezySetup.md) has the same list with the failure codes decoded.

- [ ] The buy button on `/plans` opens the checkout overlay without leaving `drivetag-ai.com`.
- [ ] Payment completes and you land on `/checkout/success`, and the receipt prints.
- [ ] **`/dashboard` shows what you bought** — this is the one that matters. It means the webhook arrived, its signature verified, and the plan or credits were written to your account.
- [ ] DigitalOcean **Runtime Logs** show the webhook handled, and Lemon Squeezy's webhook page shows a `200`.
- [ ] Buy a top-up pack too, and confirm the credits appear. Packs and plans go through different handlers.
- [ ] Refund the test order in Lemon Squeezy and confirm the pack credits come back off.
- [ ] Then put the store back into live mode.

**Why this can't be skipped.** Everything about this integration is unit-tested — the signature check, every event handler, the refund clamp, the idempotency guard, the link building — and *not one of those tests has ever touched real money.* They prove the code does what the code intends; they can't prove your store slug is right, your variant ids are pasted into the right boxes, the webhook URL has no typo, or that the secret you copied is the one that store actually signs with. Each of those is silent: the buyer pays, Lemon Squeezy keeps the money, and your side never hears about it. Then you have a customer who has been charged for a plan they don't have — the single worst bug this product can ship, and the only one that costs somebody else's money to discover.

A test purchase takes ten minutes. **The first person to find out that checkout works must not be a customer.**

#### Step 8 — Then use the page you just shipped

With `/admin` open and proven, the things that used to mean a redeploy or a hand-written SQL statement are now just the page. Nothing here blocks anything else — do them whenever:

- [ ] **Google** → turn on the 7-day reconnect warning (§4).
- [ ] **Closed beta** → set the discount percent and code, once you've decided the number (§3.4). Read the margin warning on the page first; it's the same one.
- [ ] **Accounts** → is how you comp a tester or fix a credit balance from now on (§5).

#### Step 9 — Housekeeping, the same day

- [x] ~~Delete the leftover test sign-up row~~ — done (§1.7).
- [ ] Look at `/plans` in a browser signed out, then signed in. The "launching soon" copy is gated on `checkoutEnabled`, so it should disappear on its own the moment step 5 lands. If a buy button and a "paid plans launch soon" line are on screen together, say so — that's a false claim on a page taking money.
- [ ] Tell Claude the section is done, so the READMEs stop describing checkout as unconfigured.

---

## 3. Running the closed beta

While the Google OAuth app is in **Testing** status, DriveTag is invite-only whether you like it or not. Four rules come from Google, not from us:

| Google's rule | What it means for you |
|---|---|
| Max **100** test users | Every tester's email is added by hand under **Google Auth Platform → Audience → Test users**. There is no API for that list; copy-paste is the only way. |
| Refresh tokens expire after **7 days** | Sorting silently stops about once a week until the tester reconnects at `drivetag-ai.com/connect`. The dashboard warns them from day 5 — but only once the Google testing flag is on, which it isn't yet (§4). |
| Unverified consent screen | Testers see "Google hasn't verified this app" and must choose **Advanced → Continue**. Tell them before they hit it, or you lose them there. |
| Only listed emails can sign in | Anyone not on the list is refused by Google before they ever reach DriveTag. This is exactly why you collect emails first. |

None of this changes when verification is *submitted*. It changes when verification is *granted* (§4). Run both in parallel.

**This is all live now.** `drivetag-ai.com/beta` is up, the form submits, and sign-ups land in `public.beta_signups` — verified end to end on 2026-09-20, and the test row has been deleted (§1.7). Nothing here is waiting on a deploy any more; it's waiting on you sending the first email. One housekeeping item before you do: turn on the Google testing flag (§4), which is a switch on `/admin` once §2.5 has shipped.

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
- **"Do test users still have to pay?"** Not today. Nothing can charge them: checkout is deployed but unconfigured (§2.5), so there is no button that takes money. They're on the **Free** plan (100 images, 25 documents, lifetime) unless you grant them more by hand (§5). Once §2.5 is done, the beta discount below is what they'd pay.

### 3.3 Checking the admin view works

**Verified.** `ADMIN_EMAILS` is set (§1.3) and both halves were checked by hand:

- [x] Signed in at `/dashboard` as `malvinherdyanto@gmail.com` → **Beta sign-ups** card appears.
- [x] Signed in with another Google account → it does not appear.

Re-check this after any change to `ADMIN_EMAILS`, and note that the card is only a rendering decision — every `/api/beta/signups*` route re-checks admin status server-side, so hiding it is never the security boundary. The same is true of `/admin` and every `/api/admin/*` route it calls; §2.5 step 3 is the same two-account check for that page.

### 3.4 Beta discounts

No code change and no redeploy is needed to turn this on:

1. Lemon Squeezy → **Discounts** → create one, e.g. `BETA50`, 50% off, and **limit the redemptions** — the code is shown to every approved tester, so treat it as semi-public.
2. `drivetag-ai.com/admin` → **Closed beta** → set the percent and the code, and save. (It used to be `BETA_DISCOUNT_PERCENT` / `BETA_DISCOUNT_CODE` on DigitalOcean plus a redeploy; those variables still work as a fallback, but the page is the route now.) The page shows a live worked example — pick a plan and it tells you what a tester would actually pay.
3. Approved testers (rows with **Added** ticked) now see the regular price struck through and their beta price on `/plans`, with the code. Nobody else sees any of it. Set the percent to `0`, or clear the override, and the whole thing disappears — that's the off switch.

**The decision is still yours, and it hasn't changed** just because the switch moved. The page carries an abbreviated version of the warning below; this is the full one.

**Pick the number with the margins in front of you.** The AI cost per file doesn't fall when the price does, so a discount eats margin much faster than it cuts price. At full allowance use (the worst case, and the numbers behind [README.md](README.md)):

| Discount | Images C/S/E | Documents C/S/E | Images + Documents C/S/E |
|---|---|---|---|
| none | 72% / 63% / 49% | 59% / 55% / 50% | 64% / 53% / 41% |
| **30% off** | 62% / 49% / 29% | 44% / 38% / 31% | 50% / 35% / 17% |
| **50% off** | 48% / 31% / **2%** | 24% / 16% / **6%** | 33% / **10%** / **−14%** |

- **A flat 50% loses money on Images + Documents Enterprise** — about $10 a month per fully-used subscriber. Images Enterprise and Documents Enterprise land at 2% and 6%, which is break-even after hosting.
- Complete Enterprise breaks even at a **42.8%** discount.
- Keeping every plan above a 20% margin floor means capping a blanket discount at about **28%**.

Two things soften this: real usage sits well below the full allowance, and a beta tester is the least likely person to max out an Enterprise plan. **30% is the safe blanket number.** If you want to advertise 50%, build it in Lemon Squeezy as a discount limited to the Creator and Studio variants rather than a store-wide one — the percent on `/admin` is only what the website *displays*, so a store-wide 50% code would still apply at checkout even if the site showed something else. Keep the two in step.

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
- **Charging testers.** Not until §2.5 is finished. Until then, set plans and credits by hand (§5) — and that stays the tool for comped accounts and goodwill afterwards.

### 3.7 Where to find people without being a pest

Your own network first, then Indonesian design and marketing communities. Freelancer groups on Facebook, LinkedIn and Discord — **post** there rather than DMing strangers. Subreddits and forums that permit self-promotion, following their rules. Personalise the first line every time; a templated blast gets reported as spam and takes your sending domain down with it.

---

## 4. Google: verification, branding, and going beyond test users

Partly done. What remains is the long pole for a public launch.

- [x] Search Console property, Cloud domain verification, branding links, test users.
- [ ] **Turn the Google testing flag on.** From §2.5 onward this is a switch: `drivetag-ai.com/admin` → **Google** → "Warn testers about the 7-day reconnect". No environment variable, no redeploy. (`GOOGLE_APP_TESTING=true` on DigitalOcean still works as a fallback, and is the only way to do it before the admin release ships.) Until it's on, testers get no warning that their Drive connection expires every 7 days — they just find sorting quietly stopped. It's one click and it's the cheapest thing on this page.
- [ ] Submit for **brand verification**.
- [ ] Submit for **restricted-scope verification**, because of the full `drive` scope.
- [ ] Expect Google to ask for an annual **CASA** security assessment. Third-party estimates are $500–$4,500 a year; budget time and money.
- [ ] The day **OAuth app** verification is granted: turn that same switch back off on `/admin`, so testers stop being told about a 7-day expiry that no longer applies. (If you set the environment variable instead, set it to `false` there and redeploy.)
- [ ] Separately from the above: Drive **webhooks** are gated on Cloud Console *domain* verification, not on OAuth app verification, and that is already recorded as done. So check the runtime logs for a watch registering successfully; once one does, you can drop `AUTO_SYNC_INTERVAL_SECONDS` to `0` (§7). Until you see it, leave polling on.
- [ ] Optional, costs money: to make Google's sign-in screen say "DriveTag AI" instead of `ckskwjtjydaqewwojsfj.supabase.co`, set up a Supabase custom domain `auth.drivetag-ai.com` ([frontend/README.md](frontend/README.md#google-oauth-branding--verification)).

---

## 5. Managing plans, credits and sign-ups by hand

**The normal route is `drivetag-ai.com/admin` → Accounts.** Look an account up by email, and you get who they are, what plan they're on and where their credits stand. From there:

- **Set plan** — pick a plan and a status. A plan change can restart their monthly period or leave it where it is; it's a tick box, so you choose rather than remember. It never relabels a real Lemon Squeezy subscriber as a manual one, so nudging a paying customer's plan can't corrupt who bills them.
- **Grant or remove credits** — image or document, an amount, and a **reason** that is required, not optional. A negative amount asks you to confirm before it goes through, and a removal that would take someone below zero is refused with a readable message and writes nothing.

**The SQL below still works and is the fallback** — for when you're already in the Supabase SQL editor, for anything the page doesn't cover (the beta sign-up statements), or for the day the admin page itself is what's broken. Run these in the Supabase **SQL Editor**; they only work there. Plan ids:

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

The last three need `0005_beta.sql`, which is applied (§1.2), so all of these work today. Prices and allowances live in `backend/src/config/plans.js`. Changing a number is a code change; adding a plan id also needs a migration.

These email-taking helpers stay **SQL-editor-only on purpose** — they're revoked from the key the backend uses, so no web request can reach them however it's shaped. The admin page gets there a different way: it looks the email up, then calls user-id-based functions, which is why `0007_admin.sql` exists at all. Same outcome, two doors, neither of which widens the other.

---

## 6. Business decisions still open

- [x] **Payment provider** — Lemon Squeezy (§2).
- [x] **Build checkout** — built, tested and **deployed**. Turning it on is §2.5, and it's yours, not Claude's: the store, the 21 variant ids into `/admin`, the signing secret into DigitalOcean, and one real test purchase. Until that's done every purchase is still manual (§5).
- [ ] **The beta discount number** (§3.4). Decide before you advertise it.
- [ ] **Final prices.** Everything shown today is a placeholder; the margins behind them are in [README.md](README.md). Confirm or adjust.
- [ ] **Public launch vs invite-only.** Public needs §4's verification and CASA. Invite-only can stay on the test-user list indefinitely, capped at 100.

---

## 7. Settings reference (done, but you'll come back here)

<details>
<summary>DNS (Namecheap) — done</summary>

Apex `A @ 216.198.79.1` with the HTTPS toggle **off** — and **only** that one apex `A` record; the second one that briefly pointed at Lemon Squeezy was deleted the same day it appeared (§2.1). Then: `www` CNAME to Vercel's value, HTTPS off, set to redirect to the apex; the Google TXT record on host `@`, not `google`; `api` CNAME to `drivetag-ai-geirr.ondigitalocean.app`; MX eforward records kept; the `lemonsqueezy-verification` TXT on `@` is harmless and stays; the `dcv.ssl.com` CNAME is unrelated and stays. Do **not** switch to Vercel nameservers. Attaching Lemon Squeezy means one more record on a **subdomain** (§2.1) — never the apex.
</details>

<details>
<summary>Email forwards — done</summary>

Namecheap → `drivetag-ai.com` → **Domain** tab → **Redirect Email**: `support@` and `privacy@` both forward to your inbox. The Privacy Policy, Terms, Refund Policy and Data-deletion page all publish these.
</details>

**DigitalOcean** — App → **Settings → App-Level Environment Variables**:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_` key — ✅ confirmed (§1.3) |
| `SUPABASE_ANON_KEY` | the `sb_publishable_` key |
| `FRONTEND_URL` | `https://drivetag-ai.com` |
| `CORS_ORIGINS` | `https://drivetag-ai.com` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.drivetag-ai.com/api/auth/google/callback` |
| `DRIVE_WEBHOOK_URL` | `https://api.drivetag-ai.com/webhook/drive` |
| `AUTO_SYNC_INTERVAL_SECONDS` | `60` (polling) until §4's verification lands |
| `MAX_CONCURRENT_AI_JOBS` | Recommended `10` on a 1 GB instance (code default `20`) — unconfirmed against the DigitalOcean dashboard; move to 2 GB and raise it to `20` if it's still 10 before selling an Enterprise seat (§1.6) |
| `ADMIN_EMAILS` | ✅ set — `malvinherdyanto@gmail.com` (§1.3). **Environment-only, always.** It's what gates `/admin`, so there is no setting, no endpoint and no page that can change it. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ❌ not set — the signing secret (§2.5 step 6). **The one Lemon Squeezy value that belongs here**, because it's a secret. |
| `GOOGLE_APP_TESTING` | not set — and don't: it's a switch on `/admin` → Google now (§4). Kept as a fallback only. |
| `BETA_DISCOUNT_PERCENT`, `BETA_DISCOUNT_CODE` | not set — `/admin` → Closed beta (§3.4). Fallback only. |
| `LEMONSQUEEZY_STORE` | not set — **goes in `/admin` → Payments** (§2.5 step 5), not here. Fallback only. |
| `LEMONSQUEEZY_VARIANTS` | not set — **the 21 ids go in `/admin` → Payments** (§2.5 step 5), one labelled box each, not as JSON here. Fallback only. |

**The bottom four rows moved.** Since the admin release, the app resolves those settings **database → environment → default**, so a value typed into `/admin` wins and the environment variable is only what applies when nothing has been set on the page. Leave them unset and use the page; `/admin` shows you which source each value came from, so there's never a guess about which one is live. The one exception is the row above them: the webhook secret stays an environment variable, and always will.

Everything Lemon Squeezy-related fails closed wherever you set it: no store slug or no variant ids means "checkout is off", and no signing secret means "no payment is ever acted on". Never "broken", never half-working quietly.

The complete list, with what each one does, is in [backend/README.md](backend/README.md).

**Vercel** — Settings → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the `sb_publishable_` key) and `VITE_API_URL=https://api.drivetag-ai.com`. Analytics enabled.

- Set all three for **every** environment scope you build in, not just Production. A build failed earlier today with "Missing VITE_API_URL", and a Preview build without them will fail the same way — `vite build` refuses to run without all three.
- After changing any variable, redeploy with **"Use existing build cache" turned off** — the values are baked in at build time.

**Supabase** — Site URL `https://drivetag-ai.com`; redirect URLs `https://drivetag-ai.com/**` and `http://localhost:5173/**`.

- [x] New publishable + secret API keys created and set everywhere: the live frontend, DigitalOcean, and both local `.env` files.
- [ ] **Last step, before the end of 2026:** disable the legacy `anon` / `service_role` keys in Supabase. Everything now runs on the new keys, so this should be uneventful — but check DigitalOcean's `SUPABASE_SERVICE_ROLE_KEY` still starts `sb_secret_` immediately before you do it, and watch one `/api/*` request afterwards. If a stale JWT were still in use, every `/api/*` call would fail with `Invalid or expired token`, all sorting would stop, and `/health` would stay green, so nothing would tell you.
  - It used to lie about itself, too: `schemaProblem()` in `backend/src/repositories/usage.repo.js` blamed *any* Supabase error on a missing migration, so a dead key printed "the database is missing `0002_work_processes.sql`" and sent you to re-run a migration applied weeks ago. **Fixed, and live** — an auth-shaped error now says to check `SUPABASE_SERVICE_ROLE_KEY` instead, so the log will tell you the truth if something goes wrong.

**AI provider** — billing stays enabled on the project behind the key (on the free tier Google may use submitted files to improve its products, which the Privacy Policy rules out). Still worth doing: a **budget alert** in Google Cloud Console → Billing → Budgets & alerts, say $50/month. Google's price for this model doubles on 2027-01-01, and README.md's per-file costs already assume that.

---

## 8. Repository housekeeping — ✅ done

- [x] `.claude/settings.local.json` untracked and ignored (`.gitignore` line 34). It stays on your machine; it no longer travels through git.
- [x] Remote branch `production-vdsjba` deleted — it pointed at `f7b33a0`, already part of `production`, so nothing was lost.
- [x] `frontend/package.json` renamed from `temp-front` to `drivetag-frontend`.
- [x] The five debug JSON files deleted from `production` (§1.1).

---

## What Claude will do when you say go

Code work, waiting on you. Nothing here needs a dashboard; it needs a decision or a value. Ask for them by name.

**Checkout, the webhook, the receipt, `helmet` + rate limiting and the `schemaProblem()` fix used to be on this list. They're live.** What remains here:

| # | Ask for | What you hand over first | What you get |
|---|---|---|---|
| 1 | **Commit and push the admin release** | nothing | Everything in the working tree — the `/admin` owner settings page, database-backed settings with `database → environment → default` precedence, the `/api/admin/*` endpoints, and `0007_admin.sql` — is written and tested but uncommitted, so none of it is live. One commit, one push, both halves deploy. **Do §2.5 step 1 first** (run the migration), so the code lands on a database that's ready for it. |
| 2 | ~~`drivetag-pending-checkout` in the Cookie Policy~~ | — | **Done.** The buy button stores the chosen plan id in `sessionStorage` so the success page knows what to confirm, and `/cookies` now discloses it. |
| 3 | **The legacy-endpoint cleanup release** | nothing | Removes the transitional single-folder shims — `/api/drive/config`, `/api/drive/raw-status`, `/api/drive/organize`, and the `config` / `subscription` / `entitled` fields on `/api/me`. They map onto your first work process and nothing in the current frontend calls them. Deliberately kept **out** of the checkout and admin releases: if either misbehaves, a rollback then means exactly one thing. Ship it after §2.5 has been live and quiet for a few days. |
| 4 | **Yearly billing in the UI** | a decision on whether to offer it at launch | The yearly prices exist (two months free on the six Creator and Studio plans) and the backend builds a yearly checkout link, but the buy button always sends `monthly` and the receipt prices off the monthly figure to match. Making yearly reachable is a toggle on the plan cards plus the same toggle through to the receipt. Create the six `-yearly` products (§2.5 step 4) either way — adding them later is fine, but so is having them ready. |
| 5 | **Re-sorting an already-sorted file** | a decision on what "re-sort" should mean | `processed_files` is unique on `(user_id, file_id)`, so a file is sorted automatically at most once and there is no "run it again" action. |

Ask for #1 the moment §2.5 step 1 is done — `/admin` doesn't exist until it's pushed, and steps 3 and 5 both need that page. #3, #4 and #5 can be done any time, and none of them is urgent while the beta is small.
