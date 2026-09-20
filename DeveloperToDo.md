# DeveloperToDo — what only you can do

Everything below needs your accounts (Supabase, Namecheap, Google, DigitalOcean, Vercel, Lemon Squeezy) or a business decision, so no code can do it for you. Each step says how to check that it worked.

**The beta release has shipped, so §1 is now a record of what was done.** Start at §0. The next thing to ship is **checkout** — it's built and tested but not committed, not deployed and not connected to a store; the ordered steps are **§2.5**. **§2.1** records a DNS incident that briefly broke the live site for a share of your visitors — it's already fixed, but it's worth reading once for the standing rule it left behind.

Tick items off as you go. When a section is fully done, tell Claude, so the READMEs' status tables get updated.

The last section, [**What Claude will do when you say go**](#what-claude-will-do-when-you-say-go), is the other half of this list: the code work that's waiting on you. Nothing there needs your dashboards — it needs your word.

---

## 0. Where things stand — read this first

As of 2026-09-20:

| | State |
|---|---|
| **The code (live)** | ✅ The whole closed-beta + Lemon Squeezy + VAT release is **live**. `production` is `392236b`. The working copy is checked out on `staging` (`540af6b`), which is three commits behind — the trees are identical, only the refs differ, because production's extra commits add then remove the debug files. The uncommitted checkout release sits on top of that checkout. |
| **The code (working tree)** | ⚠️ The **checkout release is built and tested but uncommitted** — Lemon Squeezy checkout links, the signed webhook, `helmet`, app-wide rate limiting, the printed receipt, and the new AI-worker counts. 205 backend tests pass, the frontend builds. **None of it is live**, and nothing is committed, so a `git status` full of changes is expected. |
| **Migration `0006_checkout.sql`** | ❌ **Not run.** It exists in the repo and is the first step of §2.5. Until it's run, the webhook's subscription handler has no `apply_subscription_state` to call. Run it **before** the code that needs it is deployed. |
| **Lemon Squeezy store** | ❌ Not created. No store, no products, no variants, no webhook endpoint, no signing secret. Checkout fails closed without them: every buy button stays "Coming soon" (§2.5). |
| **The live website** | ✅ `drivetag-ai.com` serves the release. The live bundle contains `/beta`, and the form submits successfully against the live API. |
| **The live API** | ✅ `api.drivetag-ai.com` serves `pricesIncludeTax` and `merchantOfRecord` on `GET /api/plans`, and `POST /api/beta/signups` answers `{"received":true}` with no bearer token — the sign-up path works end to end. |
| **Migration `0005_beta.sql`** | ✅ **Run.** `0001`–`0005` are all applied. |
| **Supabase API keys** | ✅ Both sides migrated. Browser on `sb_publishable_`, DigitalOcean on `sb_secret_`, local `.env` files too. |
| **DigitalOcean** | ✅ `ADMIN_EMAILS` set, so the **Beta sign-ups** card is visible to you and nobody else. `GOOGLE_APP_TESTING` is still unset (§4). |
| **Vercel `VITE_API_URL`** | ✅ Set, across the environment scopes you build in. |
| **Repository housekeeping** | ✅ Done. The five debug JSON files are deleted, `.claude/settings.local.json` is untracked and ignored (§8). |
| **DNS** | ✅ **Resolved, same day.** The apex briefly had a second `A` record pointing at Lemon Squeezy; it's deleted, and the apex resolves to Vercel only. Record and standing rule: **§2.1**. |

So: the beta release shipped and §1 is now a record rather than a to-do. Two small leftovers live in §1.6 and §1.7, and both get swept up by the checkout release. **Your next block of work is §2.5** — it's the only thing standing between a working checkout and a live one. Everything else worth your time is §3 and §4.

Done since the last version of this list:

- [x] The beta release shipped — migration, environment variables, merge, push, verified live (§1).
- [x] **Checkout built** (uncommitted): a Lemon Squeezy checkout link per plan and pack with the buyer's account id attached, a signature-verified `POST /webhook/lemonsqueezy` that grants plans and credits, `helmet` and app-wide rate limiting, and the printed-receipt confirmation page. Waiting on §2.5 — your store, and one real test purchase.
- [x] Supabase publishable / secret key swap finished on **both** sides, browser and server.
- [x] Vercel `VITE_API_URL` fixed (the failed build was missing it; the likeliest cause was the **Preview** environment scope not having the three `VITE_*` variables, which were set for Production only).
- [x] Repository housekeeping (§8) — branch rename, package rename, `.claude/settings.local.json` untracked, debug files deleted.
- [x] Payment provider decided: Lemon Squeezy (§2).

---

## 1. Ship the beta release — ✅ done, 2026-09-20

**This is a record now, not a to-do.** The release is live. 1.1–1.5 are kept ticked so you can see what was done and in what order. 1.6 and 1.7 are the two small leftovers.

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
- [ ] `GOOGLE_APP_TESTING` — **still unset.** Moved to §4, where it belongs with the rest of the Google track.
- [ ] `BETA_DISCOUNT_PERCENT` / `BETA_DISCOUNT_CODE` — still unset on purpose. §3.4 is the decision, not the dashboard.

The rest are unchanged; the full list is in §7, and disabling the old legacy Supabase keys is the last item there.

### 1.4 Merge `staging` into `production` and push — done

- [x] `540af6b` (the release plus the two `/beta` form fixes) → `f851715` (merge `staging` into `production`) → `392236b` (the debug-file removal). Both halves deployed from that push. Note the two branches are **not** level: `production` is three commits ahead of `staging`, though their trees are identical.

### 1.5 Verify the deploy — done

- [x] DigitalOcean → **Runtime Logs**: no `Schema problem` line.
- [x] `https://api.drivetag-ai.com/health` → `{"status":"ok"}`.
- [x] `https://api.drivetag-ai.com/api/plans` carries `pricesIncludeTax` and `merchantOfRecord`.
- [x] `POST https://api.drivetag-ai.com/api/beta/signups` → `{"received":true}`. Public, no bearer token, working.
- [x] The live frontend bundle contains `/beta`, and the form submits.
- [ ] Two things nobody has eyeballed in a browser yet, worth five minutes:
  - `https://drivetag-ai.com/plans` shows the "excludes VAT/sales tax" line and names Lemon Squeezy underneath. (The API serves `pricesIncludeTax` and `merchantOfRecord`, so the data is there; this is confirming the page renders it.)
  - Sign in as yourself → the **Beta sign-ups** card is on `/dashboard`; sign in with any other Google account → it is *not* (§3.3).

### 1.6 Redeploy the backend so the new AI-worker counts take effect

The AI workers per process changed — **Creator 3 → 2, Studio 5 → 3, Enterprise 15 → 10**; Free stays at 1. It's written in `backend/src/config/plans.js` but **not committed**, so it isn't live.

It costs you nothing in margin. `aiPerProcess` is used in exactly one place in the whole backend — the concurrency limit in `runProcessQueue` — and a file is one AI call however many workers pull it, so every margin figure in [README.md](README.md) still stands. What changes is speed, and honesty:

| Tier | Allowance | Workers | Time to clear a full backlog (est. 4s/file) |
|---|---|---|---|
| Creator | 1,000 images | 3 → **2** | 22m → 33m |
| Studio | 5,000 | 5 → **3** | 1h07 → 1h51 |
| Enterprise | 25,000 | 15 → **10** | unchanged if the deployed cap is 10 — `MAX_CONCURRENT_AI_JOBS` is recommended at `10` on a 1 GB instance (confirm the deployed value; the code default is `20`) |

Enterprise's old "15" was never deliverable on the instance you're paying for. 10 is simply the true number.

- [ ] Ask Claude to commit it (closing table, #1). It's part of the same uncommitted checkout release, so it ships with **§2.5 step 5** — one push redeploys DigitalOcean on its own; there is no separate deploy for this.
- [ ] Check afterwards: `https://api.drivetag-ai.com/api/plans` shows `"aiPerProcess":2` on `creator` and `10` on `enterprise`, and the Creator card on `/plans` reads "2 AI workers sorting each process at once".

> **Before you sell an Enterprise seat:** confirm what `MAX_CONCURRENT_AI_JOBS` is actually set to on DigitalOcean — nobody has read it back from the dashboard yet. If it's the recommended `10`, Enterprise's 10 workers exactly equal the server-wide cap, and that queue is FIFO rather than fair across users, so one Enterprise customer could occupy every slot while everyone else waits. Move the app to 2 GB and set `MAX_CONCURRENT_AI_JOBS=20` first (§7). Twenty in-flight jobs hold roughly 360 MB of file buffers.

### 1.7 Delete the test sign-up row

A test submission was made against the live form while verifying 1.5. Clear it so your first real tester is genuinely the first row:

```sql
delete from public.beta_signups where lower(email) = 't@example.com';
```

---

## 2. Lemon Squeezy

Lemon Squeezy is named in the legal pages as the **Merchant of Record**: the buyer's contract of sale is with them, they collect and remit VAT and sales tax, and they handle refunds and chargebacks. DriveTag never sees a card number. Their legal entity is **Sold through Link, LLC** (formerly Lemon Squeezy LLC, a Utah limited liability company) — that exact name is in `/privacy` and `/terms`. If they rename it again, those two pages are the only places to change.

**Checkout is now built** — buy buttons, the checkout link, the signed webhook, the receipt — but it is uncommitted, undeployed and unconfigured, so today every button still says "Coming soon". That's deliberate: with no store slug and no variant ids set, `GET /api/plans` reports `checkoutEnabled: false` and nothing is marked `purchasable`, so the UI can't offer a button that would lead nowhere. Everything below is the groundwork; **§2.5 is the ordered list that turns it on.**

### First — what Lemon Squeezy's "Domains" setting actually is

You asked, and the answer explains the mess in §2.1.

Lemon Squeezy runs **its own storefront and checkout pages** for you, at `yourstore.lemonsqueezy.com`. The **Domains** setting is cosmetic: it makes *those Lemon Squeezy pages* answer on a domain of yours instead, so the checkout tab says `checkout.drivetag-ai.com` rather than `…lemonsqueezy.com`.

Three things follow from that:

- **It has nothing to do with serving DriveTag.** Your app is on Vercel. Lemon Squeezy's servers know nothing about it — which is exactly why pointing the apex at them replaced your site with a 403.
- **It is entirely optional.** The default `yourstore.lemonsqueezy.com` checkout works, converts and costs nothing. Skipping it changes nothing about the money.
- **If you do want it, it must be a subdomain.** `checkout.drivetag-ai.com`, never the apex. The apex has exactly one address and it belongs to Vercel.

So yes: for our purposes, the Domains setting was unnecessary. §2.1 is how to undo it.

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

**If you still want a branded checkout address** (entirely optional, still open — `yourstore.lemonsqueezy.com` works fine and costs nothing):

- [ ] Namecheap → add `A` record, host `checkout`, value `3.33.255.208`, **HTTPS off**.
- [ ] Lemon Squeezy → **Settings → Domains** → **+** → `checkout.drivetag-ai.com`, then **Verify Domain**. A "DNS not set up" error straight after saving is normal; it re-checks on its own.
- [ ] Keep the `lemonsqueezy-verification` TXT record on `@`. It is how they prove you own the domain and it conflicts with nothing.
- [ ] Check: `nslookup checkout.drivetag-ai.com 8.8.8.8` returns `3.33.255.208`, and `nslookup drivetag-ai.com 8.8.8.8` still returns only Vercel.

The apex `A` record, the `www` CNAME and the `api` CNAME otherwise stay exactly as they are.

### 2.2 Store setup

- [ ] Store name and logo — this is what buyers see at checkout and on the receipt.
- [ ] Payout details, and the business/tax information they ask for. They can't pay you out without it, and they can't act as Merchant of Record without knowing who you are.
- [ ] Create the products. You need **one variant per purchasable thing**: 9 paid plans (× 2 for the 6 that have a yearly price — the three Enterprise tiers are monthly only) plus 6 top-up packs. That's 21 variants. The ids are in [`backend/src/config/plans.js`](backend/src/config/plans.js) — name each variant after the plan or pack id (`complete-studio`, `docs-pack-1000`, …). **This is what makes the webhook mapping unambiguous;** without it, matching a sale to a plan is guesswork.
- [ ] Enter every price **excluding tax**. The website states that prices exclude VAT and sales tax and that Lemon Squeezy adds the local rate at checkout. Tax-inclusive prices there would contradict the site.
- [ ] **Set each product's redirect URL to `https://drivetag-ai.com/checkout/success`.** This is easy to miss and nothing in the code can do it for you: a plain checkout link carries no redirect parameter, so the destination after payment is a per-product setting in Lemon Squeezy. Leave it unset and the buyer lands on Lemon Squeezy's own thank-you page, never sees the receipt, and never returns to DriveTag — the purchase still works and the webhook still grants it, but the experience ends on someone else's website. Set it on **every** product, including the packs.

### 2.3 The three values the running app needs

**Three, not four.** An earlier version of this list said four and counted an API key. There is no API key — the code never asks for one and never stores one, because a plain checkout link needs none (§2.4). If Lemon Squeezy's dashboard offers you one, you can leave it where it is.

You don't hand these to Claude. They are **environment variables you set yourself on DigitalOcean**, so the secret never passes through a chat or a commit:

| Value | Where you get it | Environment variable | Needed for |
|---|---|---|---|
| Store subdomain slug | your store URL — the `yourstore` in `yourstore.lemonsqueezy.com` | `LEMONSQUEEZY_STORE` | building the checkout URLs. It's the slug, **not** the numeric Store ID. |
| Variant id per plan and pack | each product's variant page | `LEMONSQUEEZY_VARIANTS` | knowing *which* plan or pack was bought. A JSON map of our id to theirs, e.g. `{"creator":"111","creator-yearly":"112","pack-250":"210"}` — yearly prices use `<planId>-yearly`. |
| Webhook signing secret | Settings → Webhooks, when you create the endpoint | `LEMONSQUEEZY_WEBHOOK_SECRET` | **the important one** — it's what proves a "they paid" message really came from Lemon Squeezy. Empty, and the webhook refuses every request. |

All three fail closed. Miss the store slug or the variants and the buttons stay "Coming soon" instead of sending someone to a broken link; miss the secret and no payment is ever acted on. Nothing half-works quietly.

The endpoint will be `https://api.drivetag-ai.com/webhook/lemonsqueezy`, subscribing to `order_created`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_payment_success`, `subscription_payment_failed` and `order_refunded`. §2.4 explains what each direction does; §2.5 is the order to do it all in.

### 2.4 How DriveTag will connect to Lemon Squeezy

You guessed "via API". Half right — and the half that isn't is the half that matters.

There are two directions, and only one of them is an API.

**Outbound — sending someone off to pay. No API key needed.**

- Every plan and pack gets a plain link: `https://<your-store>.lemonsqueezy.com/checkout/buy/<VARIANT_ID>`. That's it. It's a URL, not a call.
- The buyer's DriveTag account id rides along in that link as a parameter (`checkout[custom][user_id]=…`). **This is the single most important detail in the whole integration** — it's the thread that ties a payment back to an account. Without it, a payment arrives with an email address and a hope.
- Lemon Squeezy's `lemon.js` renders that same checkout as an **overlay on our own page**, in an iframe, so the buyer never visually leaves `drivetag-ai.com`. That's what got built: the script is fetched on the first click and not before, and if it fails to load, is missing its API, or takes longer than four seconds, the browser just goes to the link instead. A slow script never costs you a sale.
- Their REST API (`POST /v1/checkouts`) only earns its keep for bespoke cases — prefilled email, a custom expiry, per-customer pricing. It needs the API key. We don't use it, which is why §2.3 is three values.
- One trap worth knowing: opening a checkout link converts it into a single-use `/checkout/?cart=…` URL. Never copy that out of your address bar and paste it into an email — it belongs to one buyer.

**Inbound — finding out that they actually paid. This is a webhook, and it is mandatory.**

- Lemon Squeezy `POST`s to `https://api.drivetag-ai.com/webhook/lemonsqueezy` the moment money moves. **That message is what grants the plan or the credits** — not the buyer's browser, which could simply close mid-redirect, and which we could never trust anyway.
- Every message is signed: an `X-Signature` header carrying a hash of the exact body, keyed with your webhook signing secret. We recompute it and compare. That's why §2.3's signing secret is the value that actually gates this feature.
- It has to answer `200`. If it doesn't, they retry three more times with widening gaps (roughly 5s, 25s, 125s) and then give up.
- The user id you sent in the checkout link comes straight back in the payload, so the webhook knows whose account to upgrade.

**Two things worth knowing about how it was built**, neither of which needs anything from you:

- `backend/src/app.js` parses JSON for every route, which throws the raw body away — and the raw body is exactly what the signature is computed over. So the Lemon Squeezy webhook is mounted *before* that parser and reads the raw bytes itself. The Drive webhook is unaffected; it authenticates with a shared-secret header rather than a body hash.
- **The payment webhook does the work before it answers**, which is the opposite of the Drive one. Drive gets an instant `200` and the sorting happens afterwards, because a missed notification is recoverable — the next sweep picks the file up. A missed payment is not recoverable: nobody retries it and the customer has already been charged. So this webhook grants the plan or the credits first and only then answers `200`; anything that goes wrong answers `500` so Lemon Squeezy redelivers. Every handler is written to be safe to run twice, which is what makes those redeliveries harmless rather than a double grant.

**In one sentence:** a link sends them to pay with their user id attached, and a signed webhook comes back to tell us they did — there is no API key in any of it.

### 2.5 Ship the checkout release — in this order

The code is written and tested. What's left is yours, and **the order matters**: each step is useless or dangerous before the one above it. Don't skip ahead to the deploy because the tests are green.

#### Step 1 — Run `0006_checkout.sql` in Supabase

Supabase → **SQL Editor** on project `ckskwjtjydaqewwojsfj` → paste [`supabase/migrations/0006_checkout.sql`](supabase/migrations/0006_checkout.sql) → Run.

- Check: `select version, applied_at from public.schema_migrations order by version;` lists `0001` through `0006`.
- **Before the deploy, not after.** The webhook's subscription handlers call `apply_subscription_state`, which this migration creates. Deploying first means the first person who subscribes hits a function that doesn't exist.
- It's safe to run now, while the old code is still live: it only adds a function and replaces `grant_credits` with a version that behaves identically for today's callers. The second thing it buys you is that a redelivered payment can't grant the same credits twice.

#### Step 2 — Create the store, the products and the 21 variants

All of §2.2. The part that matters most for this step is the naming:

- **Name every variant after the plan or pack id**, exactly: `creator`, `studio`, `enterprise`, `docs-creator`, `docs-studio`, `docs-enterprise`, `complete-creator`, `complete-studio`, `complete-enterprise`, `pack-250`, `pack-1000`, `pack-5000`, `docs-pack-250`, `docs-pack-1000`, `docs-pack-5000` — plus a yearly variant for each of the six Creator and Studio plans (the three Enterprise tiers are monthly only). **9 + 6 + 6 = 21.**
- You'll be copying each variant's id into `LEMONSQUEEZY_VARIANTS` by hand in the next step. Naming them after our ids is what stops that being guesswork at 1am.
- Prices **excluding tax** (§2.2), because the website says so.

#### Step 3 — Set `LEMONSQUEEZY_STORE` and `LEMONSQUEEZY_VARIANTS` on DigitalOcean

App → **Settings → App-Level Environment Variables**.

- `LEMONSQUEEZY_STORE` = the subdomain slug only. If your checkout lives at `drivetag.lemonsqueezy.com`, it's `drivetag`.
- `LEMONSQUEEZY_VARIANTS` = one JSON object mapping our id to their variant id, yearly as `<planId>-yearly`:

```json
{"creator":"111","creator-yearly":"112","studio":"113","studio-yearly":"114","enterprise":"115","pack-250":"210","docs-pack-250":"211"}
```

  (That's a shape, not your ids — fill in all 21.) A map that isn't valid JSON is ignored and logged once, which reads as "the buttons never turned on", so paste it somewhere that shows you a syntax error first.

- A plan or pack appears as purchasable **only if it has an entry here.** You can turn the whole thing on for two plans first and add the rest later; that's a legitimate way to go slowly.

#### Step 4 — Create the webhook endpoint and set the signing secret

Lemon Squeezy → **Settings → Webhooks** → **+**.

- URL: `https://api.drivetag-ai.com/webhook/lemonsqueezy`
- Events: `order_created`, `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_payment_success`, `subscription_payment_failed`, `subscription_cancelled`, `subscription_expired`. All eight — each one is handled, and a missing subscription event means a customer's plan silently stops matching what they're paying.
- Copy the signing secret it gives you into `LEMONSQUEEZY_WEBHOOK_SECRET` on DigitalOcean. Never into git, never into a chat.
- Until that variable is set, the webhook answers `503` to everything — including to Lemon Squeezy, which will show the deliveries as failing. That's the fail-closed behaviour, not a bug.

#### Step 5 — Deploy

Ask Claude to commit and push the release (closing table, #1). DigitalOcean and Vercel each redeploy from the `production` push on their own.

- This same push carries the AI-worker change (§1.6) and `helmet` + rate limiting. One deploy, not three.
- Check after: no `Schema problem` line in DigitalOcean's **Runtime Logs**, `https://api.drivetag-ai.com/health` is `{"status":"ok"}`, and `https://api.drivetag-ai.com/api/plans` now shows `"checkoutEnabled":true` with `"purchasable":true` on the plans you mapped.
- If `checkoutEnabled` is `false`, it's step 3, not the deploy: one of the two variables is missing or the JSON didn't parse.

#### Step 6 — Make one real test-mode purchase, end to end. Non-negotiable.

Put the store in **test mode**, use Lemon Squeezy's test card, and buy one plan as yourself, through the actual website.

- [ ] The buy button on `/plans` opens the checkout overlay without leaving `drivetag-ai.com`.
- [ ] Payment completes and you land on `/checkout/success`, and the receipt prints.
- [ ] **`/dashboard` shows the plan you bought** — this is the one that matters. It means the webhook arrived, its signature verified, and the plan was written to your account.
- [ ] DigitalOcean **Runtime Logs** show the webhook handled, and Lemon Squeezy's webhook page shows a `200`.
- [ ] Buy a top-up pack too, and confirm the credits appear. Packs and plans go through different handlers.
- [ ] Then put the store back into live mode.

**Why this can't be skipped.** Everything about this integration is unit-tested — the signature check, every event handler, the refund clamp, the idempotency guard, the link building — and *not one of those tests has ever touched real money.* They prove the code does what the code intends; they can't prove your store slug is right, your variant ids are pasted in the right order, the webhook URL has no typo, or that the secret you copied is the one that store actually signs with. Each of those is silent: the buyer pays, Lemon Squeezy keeps the money, and your side never hears about it. Then you have a customer who has been charged for a plan they don't have — the single worst bug this product can ship, and the only one that costs somebody else's money to discover.

A test purchase takes ten minutes. **The first person to find out that checkout works must not be a customer.**

#### Step 7 — Housekeeping, the same day

- [ ] Delete the leftover test sign-up row (§1.7): `delete from public.beta_signups where lower(email) = 't@example.com';`
- [ ] Look at `/plans` in a browser signed out, then signed in. The "launching soon" copy is gated on `checkoutEnabled`, so it should have disappeared on its own the moment step 5 landed. If a buy button and a "paid plans launch soon" line are on screen together, say so — that's a false claim on a page taking money.
- [ ] Tell Claude the section is done, so the READMEs stop describing checkout as unbuilt.

---

## 3. Running the closed beta

While the Google OAuth app is in **Testing** status, DriveTag is invite-only whether you like it or not. Four rules come from Google, not from us:

| Google's rule | What it means for you |
|---|---|
| Max **100** test users | Every tester's email is added by hand under **Google Auth Platform → Audience → Test users**. There is no API for that list; copy-paste is the only way. |
| Refresh tokens expire after **7 days** | Sorting silently stops about once a week until the tester reconnects at `drivetag-ai.com/connect`. The dashboard warns them from day 5 — but only once `GOOGLE_APP_TESTING=true` is set, which it isn't yet (§4). |
| Unverified consent screen | Testers see "Google hasn't verified this app" and must choose **Advanced → Continue**. Tell them before they hit it, or you lose them there. |
| Only listed emails can sign in | Anyone not on the list is refused by Google before they ever reach DriveTag. This is exactly why you collect emails first. |

None of this changes when verification is *submitted*. It changes when verification is *granted* (§4). Run both in parallel.

**This is all live now.** `drivetag-ai.com/beta` is up, the form submits, and sign-ups land in `public.beta_signups` — verified end to end on 2026-09-20. Nothing here is waiting on a deploy any more; it's waiting on you sending the first email. Two housekeeping items before you do: set `GOOGLE_APP_TESTING` (§4), and delete the test row (§1.7).

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
- **"Do test users still have to pay?"** Not today. Nothing can charge them: checkout is built but not switched on (§2.5), so there is no button that takes money. They're on the **Free** plan (100 images, 25 documents, lifetime) unless you grant them more by hand (§5). Once §2.5 is done, the beta discount below is what they'd pay.

### 3.3 Checking the admin view works

`ADMIN_EMAILS` is set (§1.3), so this should pass — but nobody has looked yet, and it's two minutes:

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
- **Charging testers.** Not until §2.5 is finished. Until then, set plans and credits by hand (§5) — and that stays the tool for comped accounts and goodwill afterwards.

### 3.7 Where to find people without being a pest

Your own network first, then Indonesian design and marketing communities. Freelancer groups on Facebook, LinkedIn and Discord — **post** there rather than DMing strangers. Subreddits and forums that permit self-promotion, following their rules. Personalise the first line every time; a templated blast gets reported as spam and takes your sending domain down with it.

---

## 4. Google: verification, branding, and going beyond test users

Partly done. What remains is the long pole for a public launch.

- [x] Search Console property, Cloud domain verification, branding links, test users.
- [ ] **Set `GOOGLE_APP_TESTING=true` on DigitalOcean now** (App → Settings → App-Level Environment Variables) and redeploy. Until it's set, testers get no warning that their Drive connection expires every 7 days — they just find sorting quietly stopped. It's a one-word variable and it's the cheapest thing on this page.
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

The last three need `0005_beta.sql`, which is applied (§1.2), so all of these work today. Prices and allowances live in `backend/src/config/plans.js`. Changing a number is a code change; adding a plan id also needs a migration.

---

## 6. Business decisions still open

- [x] **Payment provider** — Lemon Squeezy (§2).
- [x] **Build checkout** — built, tested, uncommitted. Turning it on is §2.5, and it's yours, not Claude's: the store, the 21 variants, the three environment variables, the webhook, and one real test purchase. Until that's done every purchase is still manual (§5).
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
| `ADMIN_EMAILS` | ✅ set — `malvinherdyanto@gmail.com` (§1.3) |
| `GOOGLE_APP_TESTING` | not set yet — §4 |
| `BETA_DISCOUNT_PERCENT`, `BETA_DISCOUNT_CODE` | §3.4 |
| `LEMONSQUEEZY_STORE` | not set — the store subdomain slug (§2.5 step 3) |
| `LEMONSQUEEZY_VARIANTS` | not set — the JSON id → variant map (§2.5 step 3) |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | not set — the signing secret (§2.5 step 4) |

The three `LEMONSQUEEZY_*` variables are all optional and all fail closed: unset means "checkout is off", never "checkout is broken".

The complete list, with what each one does, is in [backend/README.md](backend/README.md).

**Vercel** — Settings → Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the `sb_publishable_` key) and `VITE_API_URL=https://api.drivetag-ai.com`. Analytics enabled.

- Set all three for **every** environment scope you build in, not just Production. A build failed earlier today with "Missing VITE_API_URL", and a Preview build without them will fail the same way — `vite build` refuses to run without all three.
- After changing any variable, redeploy with **"Use existing build cache" turned off** — the values are baked in at build time.

**Supabase** — Site URL `https://drivetag-ai.com`; redirect URLs `https://drivetag-ai.com/**` and `http://localhost:5173/**`.

- [x] New publishable + secret API keys created and set everywhere: the live frontend, DigitalOcean, and both local `.env` files.
- [ ] **Last step, before the end of 2026:** disable the legacy `anon` / `service_role` keys in Supabase. Everything now runs on the new keys, so this should be uneventful — but check DigitalOcean's `SUPABASE_SERVICE_ROLE_KEY` still starts `sb_secret_` immediately before you do it, and watch one `/api/*` request afterwards. If a stale JWT were still in use, every `/api/*` call would fail with `Invalid or expired token`, all sorting would stop, and `/health` would stay green, so nothing would tell you.
  - It used to lie about itself, too: `schemaProblem()` in `backend/src/repositories/usage.repo.js` blamed *any* Supabase error on a missing migration, so a dead key printed "the database is missing `0002_work_processes.sql`" and sent you to re-run a migration applied weeks ago. **Fixed in the uncommitted checkout release** — an auth-shaped error now says to check `SUPABASE_SERVICE_ROLE_KEY` instead. Deploy §2.5 before you retire the legacy keys, so the log tells you the truth if something goes wrong.

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

**Checkout, the webhook, the receipt, `helmet` + rate limiting and the `schemaProblem()` fix used to be on this list. They're built** — they've moved into §2.5, where what's left is yours rather than Claude's. What remains here:

| # | Ask for | What you hand over first | What you get |
|---|---|---|---|
| 1 | **Commit and push the checkout release** | nothing | Everything in the working tree — checkout, the signed webhook, the receipt, `helmet`, rate limiting, the `schemaProblem()` fix, and the Creator 2 / Studio 3 / Enterprise 10 worker counts (§1.6) — is written and tested but uncommitted, so none of it is live. One commit, one push, both halves deploy. **Do §2.5 steps 1–4 first**, so the code lands on a database and a store that are ready for it. |
| 2 | ~~`drivetag-pending-checkout` in the Cookie Policy~~ | — | **Done.** The buy button stores the chosen plan id in `sessionStorage` so the success page knows what to confirm, and `/cookies` now discloses it. |
| 3 | **The legacy-endpoint cleanup release** | nothing | Removes the transitional single-folder shims — `/api/drive/config`, `/api/drive/raw-status`, `/api/drive/organize`, and the `config` / `subscription` / `entitled` fields on `/api/me`. They map onto your first work process and nothing in the current frontend calls them. Deliberately kept **out** of the checkout release: if checkout misbehaves, a rollback then means exactly one thing. Ship it after §2.5 has been live and quiet for a few days. |
| 4 | **Yearly billing in the UI** | a decision on whether to offer it at launch | The yearly prices exist (two months free on the six Creator and Studio plans) and the backend builds a yearly checkout link, but the buy button always sends `monthly` and the receipt prices off the monthly figure to match. Making yearly reachable is a toggle on the plan cards plus the same toggle through to the receipt. Create the six `-yearly` variants (§2.5 step 2) either way — adding them later is fine, but so is having them ready. |
| 5 | **Re-sorting an already-sorted file** | a decision on what "re-sort" should mean | `processed_files` is unique on `(user_id, file_id)`, so a file is sorted automatically at most once and there is no "run it again" action. |

Ask for #1 the moment §2.5 steps 1–4 are done — nothing else on this page can move until it's pushed. #2 goes with it. #3, #4 and #5 can be done any time, and none of them is urgent while the beta is small.
