# Lemon Squeezy setup — the whole thing, field by field

This is the only document you need to take DriveTag from "prices are displayed" to "people can pay".
Work top to bottom. Nothing here needs a developer; every value you produce goes into the owner settings page
at [`drivetag-ai.com/admin`](https://drivetag-ai.com/admin) or into DigitalOcean.

For what Lemon Squeezy *is* to us and why the apex domain must never point at it, see
[DeveloperToDo.md §2](DeveloperToDo.md). This file is the mechanics.

---

## 0. Before you start

| | |
|---|---|
| Time | About 90 minutes for 21 variants, once you have the rhythm |
| You need | A Lemon Squeezy account with the store created and payout details accepted |
| You produce | 1 store slug · 21 variant ids · 1 webhook signing secret |
| You do **not** need | An API key. Nothing in DriveTag uses one. If the dashboard offers you one, leave it alone. |

**One rule that matters more than the rest:** a product in Lemon Squeezy is matched back to a DriveTag plan by
its **variant id**, which you copy into DriveTag. Nothing else is used for matching — not the product name, not
the price. Names are for humans; the id is the wiring.

---

## 1. Store settings

**Settings → General**

- [ ] Store name: `DriveTag AI`. Buyers see this on the checkout and on their card statement line.
- [ ] Note the **store slug** — the `something` in `something.lemonsqueezy.com`. You need it later.
- [ ] Currency: **USD**. Every price in `backend/src/config/plans.js` is USD, and DriveTag does not convert.

**Settings → Payouts** — complete this or you cannot be paid, and Lemon Squeezy cannot act as Merchant of
Record for you until it knows who you are.

**Settings → Domains** — **skip it.** A custom domain here only rebrands Lemon Squeezy's own hosted pages, and
pointing your apex at it takes drivetag-ai.com down. It happened once already; see
[DeveloperToDo.md §2.1](DeveloperToDo.md). With the checkout overlay the buyer never leaves drivetag-ai.com
anyway, so it buys you nothing.

---

## 2. The 21 products

You create **one product per row** below. The `Name` column is what you type into the product's Name field.
The **Key** column is what DriveTag calls it — you will paste each variant's id into the box labelled with that
key on `/admin`.

Lemon Squeezy creates a **default variant** for every product automatically, so you do **not** need to touch
the "Variants → Add variant" section at all. One product = one variant. Leave that section empty.

> **Monthly and yearly are separate products.** Lemon Squeezy prices one billing interval per variant, so a
> plan with both intervals needs two. That is why there are 21 rows for 9 plans and 6 packs.

### Subscriptions — 15 products

| Key (paste the variant id under this on `/admin`) | Name | Pricing | Repeat every | Price |
|---|---|---|---|---|
| `creator` | DriveTag AI — Images Creator | Subscription | 1 Month | 9.99 |
| `creator-yearly` | DriveTag AI — Images Creator (yearly) | Subscription | 1 Year | 99.90 |
| `studio` | DriveTag AI — Images Studio | Subscription | 1 Month | 29.99 |
| `studio-yearly` | DriveTag AI — Images Studio (yearly) | Subscription | 1 Year | 299.90 |
| `enterprise` | DriveTag AI — Images Enterprise | Subscription | 1 Month | 99.99 |
| `docs-creator` | DriveTag AI — Documents Creator | Subscription | 1 Month | 7.99 |
| `docs-creator-yearly` | DriveTag AI — Documents Creator (yearly) | Subscription | 1 Year | 79.90 |
| `docs-studio` | DriveTag AI — Documents Studio | Subscription | 1 Month | 24.99 |
| `docs-studio-yearly` | DriveTag AI — Documents Studio (yearly) | Subscription | 1 Year | 249.90 |
| `docs-enterprise` | DriveTag AI — Documents Enterprise | Subscription | 1 Month | 79.99 |
| `complete-creator` | DriveTag AI — Images + Documents Creator | Subscription | 1 Month | 14.99 |
| `complete-creator-yearly` | DriveTag AI — Images + Documents Creator (yearly) | Subscription | 1 Year | 149.90 |
| `complete-studio` | DriveTag AI — Images + Documents Studio | Subscription | 1 Month | 44.99 |
| `complete-studio-yearly` | DriveTag AI — Images + Documents Studio (yearly) | Subscription | 1 Year | 449.90 |
| `complete-enterprise` | DriveTag AI — Images + Documents Enterprise | Subscription | 1 Month | 149.99 |

The three Enterprise tiers are **monthly only** — that is a deliberate pricing decision, not an omission.

### One-off packs — 6 products

| Key | Name | Pricing | Price |
|---|---|---|---|
| `pack-250` | DriveTag AI — 250 image credits | Single payment | 4.99 |
| `pack-1000` | DriveTag AI — 1,000 image credits | Single payment | 14.99 |
| `pack-5000` | DriveTag AI — 5,000 image credits | Single payment | 49.99 |
| `docs-pack-250` | DriveTag AI — 250 document credits | Single payment | 5.99 |
| `docs-pack-1000` | DriveTag AI — 1,000 document credits | Single payment | 19.99 |
| `docs-pack-5000` | DriveTag AI — 5,000 document credits | Single payment | 79.99 |

These prices come from `backend/src/config/plans.js`, which is the single source of truth for what the website
displays. **If you change a price in Lemon Squeezy, change it there too**, or the site advertises one number and
charges another.

---

## 3. Filling in the Add Product form

Every field on the form, in the order it appears, and what to do with it.

### General
- **Name** — from the table above, exactly.
- **Description** — optional, shown on the checkout. One honest line, e.g. *"1,000 images sorted every month,
  in your own Google Drive."* Do not restate the price.

### Pricing
- **Single payment / Subscription / Lead magnet / Pay what you want** — `Subscription` for the 15 plans,
  `Single payment` for the 6 packs. Never Lead magnet or Pay what you want.
- **Pricing model** — `Standard pricing`. Not package, not graduated, not volume. DriveTag meters credits
  itself; letting Lemon Squeezy meter as well would double-count.
- **Price per unit** — the price from the table. **Enter it tax-exclusive.** The website says prices exclude
  VAT and sales tax and that Lemon Squeezy adds the local rate at checkout. Entering a tax-inclusive figure
  makes the site a liar and quietly cuts your margin.
- **Repeat payment every** — `1` + `Month`, or `1` + `Year` for the yearly rows. Subscriptions only.
- **Usage is metered?** — **off.** DriveTag counts credits in its own database.
- **Subscription includes a setup fee?** — **off.** A setup fee is a hidden fee; the site promises there are none.
- **Subscription has free trial?** — **off.** The Free plan is the trial, and it has no time limit. A card-up-front
  trial that auto-charges is the dark pattern this project has repeatedly refused to ship.
- **Tax category** — `Software as a service (SaaS) - business use`, for all 21. This is what makes Lemon Squeezy
  charge the right VAT in each country. Getting it wrong means they remit the wrong tax on your behalf.

### Media
Optional. A 1600×1200 image shows on the checkout. It helps trust; it is not required.

### Files
**Leave empty.** DriveTag is not a download. A buyer gets access inside the app, granted by the webhook.

### Links
**Leave empty.** These are extra buttons on the receipt; we use the Confirmation modal instead (below).

### Variants
**Leave empty.** Lemon Squeezy already made the default variant. Adding one here creates a *second* variant and
then you have two ids for one product and no way to tell which the buyer used.

### Settings
- **Generate license keys** — **off.** DriveTag has no licence keys; access is tied to the Google account.
- **Display product on storefront** — your choice. Off keeps your Lemon Squeezy storefront empty and sends
  everyone through drivetag-ai.com, which is what the buy buttons do anyway.

### Confirmation modal — **this is how the buyer gets back to you**

There is **no "Redirect URL" field** anywhere on this form. Lemon Squeezy's hosted checkout ends on a
confirmation modal, and its button is the way back. Set it on **every one of the 21 products**:

| Field | Value |
|---|---|
| Title | `Thanks — your DriveTag plan is live` |
| Message | `Head back to DriveTag and your new allowance will be waiting.` |
| Button text | `Go to DriveTag` |
| Button link | `https://drivetag-ai.com/checkout/success` |

You can inject order data into that link with square-bracket placeholders — `[order_id]`, `[order_identifier]`,
`[email]`, `[name]`, `[total]`. **Don't.** The success page deliberately ignores everything in the query string
and reads the truth from your account instead, because a URL parameter is something a stranger can edit.

### Email receipt
Same idea, for the emailed receipt:

| Field | Value |
|---|---|
| Thank you note | `Your plan is active. Drop files in your Raw folder and DriveTag will sort them.` |
| Button text | `Open DriveTag` |
| Button link | `https://drivetag-ai.com/dashboard` |

Then **Publish product**.

---

## 4. Collecting the 21 variant ids

After publishing, open the product and copy its **checkout link** — Lemon Squeezy shows this as "Share" or
"Copy checkout link" on the product. The number at the end of that URL **is** the variant id:

```
https://<your-store>.lemonsqueezy.com/checkout/buy/123456
                                                  ^^^^^^ this is the variant id
```

Copy that number. Do this for all 21.

The checkout link is the reliable place to read it, because it is the same id DriveTag puts in the buy button —
if you copy it from there, you cannot copy the wrong one. (The dashboard may also show the id elsewhere; it
doesn't matter, as long as the number matches the one in this link.)

**Where it goes:** `drivetag-ai.com/admin` → **Payments**. There is one labelled box per row in the table above
— paste each number into the box with the matching key. You are not writing JSON and you are not redeploying;
the page saves it to the database and the buy buttons come alive within about thirty seconds.

A plan goes live **on its own** as soon as its variant id is filled in. You can do Creator first, test it, and
add the rest later. Anything still blank keeps saying "Coming soon".

---

## 5. The webhook — the part that actually grants the plan

Without this, someone pays and **nothing happens in DriveTag**. The checkout link only takes the money; the
webhook is what turns that into a plan or credits.

**Settings → Webhooks → +**

| Field | Value |
|---|---|
| Callback URL | `https://api.drivetag-ai.com/webhook/lemonsqueezy` |
| Signing secret | Generate one, or type a long random string. **Copy it before you save.** |

Tick these events, all of them:

| Event | What DriveTag does |
|---|---|
| `order_created` | A pack purchase adds credits. Subscription orders are ignored here — `subscription_created` handles those. |
| `order_refunded` | Takes the pack credits back. If they're already spent, the customer keeps them — that is intentional. |
| `subscription_created` | Sets the plan and starts the billing period. |
| `subscription_updated` | Catch-all; keeps the stored plan and status in step. |
| `subscription_payment_success` | Marks the subscription active. |
| `subscription_payment_failed` | Marks it past due. Sorting continues during the grace period. |
| `subscription_cancelled` | **Does not** downgrade anyone. Lemon Squeezy's "cancelled" means "won't renew"; the customer keeps what they paid for until it expires. |
| `subscription_expired` | Downgrades to Free. |

**The signing secret goes in DigitalOcean, not in the admin page.** It is a secret, and secrets never go into
the database or onto a web page:

DigitalOcean → your backend app → **Settings → App-Level Environment Variables**

| Variable | Value |
|---|---|
| `LEMONSQUEEZY_WEBHOOK_SECRET` | the signing secret you just copied |

Redeploy after saving.

Every request is verified as an HMAC-SHA256 of the exact bytes Lemon Squeezy sent. An unsigned or mis-signed
request is refused; a correctly signed one that fails to apply returns an error so Lemon Squeezy redelivers it
(three more times, at roughly 5s, 25s and 125s). Redelivery is safe — a repeated purchase can only ever be
granted once.

> **While `LEMONSQUEEZY_WEBHOOK_SECRET` is unset**, this endpoint refuses everything. Calling it from a
> terminal returns a `504` rather than the `503` the app sends, because DigitalOcean's edge rewrites it. That
> is cosmetic. The proof the request reached the app is a `ls_webhook_unconfigured` line in the runtime logs.

---

## 6. The one test you must not skip

Nothing above has been proven by an automated test, because no test can make a real card payment. **Do this
before you tell a single person that payments are open.**

1. Lemon Squeezy → **Settings → General** → switch the store to **Test mode**.
2. On drivetag-ai.com, sign in as yourself and buy the cheapest pack (`pack-250`, $4.99).
3. Pay with Lemon Squeezy's test card.
4. Check, in order:
   - [ ] The overlay opens over drivetag-ai.com — you never leave the site.
   - [ ] After paying you land on `/checkout/success` and the receipt prints.
   - [ ] Your image credits went up by 250 on `/dashboard`.
   - [ ] Lemon Squeezy → Webhooks → the delivery shows **200**, not a red failure.
5. Refund that test order in Lemon Squeezy, and confirm the 250 credits come back off.
6. Switch the store out of Test mode.

If step 4's webhook delivery is red, open it and read the response. A `401` means the signing secret in
DigitalOcean doesn't match the one in Lemon Squeezy. A `504`/`503` means `LEMONSQUEEZY_WEBHOOK_SECRET` isn't
set on the backend, or the backend hasn't been redeployed since you set it.

---

## 7. What connects to what

A one-page map, for when something misbehaves.

```
  plans.js  ──prices & ids──▶  GET /api/plans  ──▶  the buy button on /plans
     │                                                      │
     │                                        POST /api/checkout (signed in)
     │                                                      │
     │                                                      ▼
     └──variant id, from /admin──▶  <store>.lemonsqueezy.com/checkout/buy/<variantId>
                                        ?checkout[custom][user_id]=<your DriveTag user id>
                                                              │
                                              buyer pays in the overlay
                                                              │
                        ┌─────────────────────────────────────┴───────────────────┐
                        ▼                                                          ▼
      POST /webhook/lemonsqueezy  (server to server, signed)      the overlay returns them
                        │                                          to /checkout/success
         grants the plan or the credits                                    │
                        └──────────────▶  GET /api/me  ◀────────────────────┘
                                          the receipt prints from this,
                                          never from the URL
```

**`checkout[custom][user_id]` is the single thread holding this together.** DriveTag adds it to the checkout
link server-side, and the webhook reads it back to know whose account to credit. A payment that arrives without
it cannot be attributed to anyone — which is why the buy button is never shown to a signed-out visitor.

---

## 8. Where each value lives, and why

| Value | Lives in | Why there |
|---|---|---|
| Store slug | `/admin` → Payments | Configuration, not a secret. Changing it must not need a deploy. |
| The 21 variant ids | `/admin` → Payments | Same. Labelled boxes, saved to the database. |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | DigitalOcean env | A secret. Never in the database, never on a page. |
| Prices, allowances, plan ids | `backend/src/config/plans.js` | Code, because the website renders them and they must be reviewable. |
| Beta discount % and code | `/admin` → Closed beta | Configuration. See [DeveloperToDo.md §3.4](DeveloperToDo.md) before you pick a number — a blanket 50% loses money on the top plan. |
| An API key | Nowhere | DriveTag doesn't use one. Plain checkout links need none. |

---

## 9. Common problems

| What you see | What it means |
|---|---|
| A plan still says "Coming soon" after saving | Its variant id box is blank, or the id has a stray space. Each plan is independent. |
| Buy button says "Sign in to subscribe" | You're signed out. A purchase can't be attributed to an account, so checkout is not offered. |
| Paid, but the plan didn't change | The webhook. Check the delivery in Lemon Squeezy — a red entry tells you the status; §5's notes decode it. |
| Webhook shows `401` | The signing secret in DigitalOcean doesn't match Lemon Squeezy's. |
| Webhook shows `504` or `503` | `LEMONSQUEEZY_WEBHOOK_SECRET` isn't set, or the backend wasn't redeployed after you set it. |
| Tax looks wrong on a checkout | The product's **Tax category** isn't `Software as a service (SaaS) - business use`. |
| The site shows one price, the checkout another | `plans.js` and the Lemon Squeezy product have drifted. `plans.js` is what the website promises; make Lemon Squeezy match it. |
| The whole site went down after a DNS change | You pointed the apex at Lemon Squeezy. [DeveloperToDo.md §2.1](DeveloperToDo.md). |
