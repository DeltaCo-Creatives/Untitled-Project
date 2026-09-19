# DeveloperToDo — what only you can do

Everything below needs your accounts (Supabase, Namecheap, Google, DigitalOcean, Vercel) or a business decision, so no code can do it for you. Work top to bottom: **section 1 has to happen in order before this release is pushed.** Each step says how to check that it worked.

Tick items off as you go. When a section is fully done, tell Claude, so the READMEs' status tables get updated.

---

## 1. Ship the documents release — order matters

Production (`drivetag-ai.com` and `api.drivetag-ai.com`) deploys automatically whenever the `production` branch is pushed. This release needs a database migration, which must run **before** the push.

### 1.1 Run migration `0004_documents.sql` in Supabase (before pushing)

- [ ] Supabase dashboard → project `ckskwjtjydaqewwojsfj` → **SQL Editor** → **New query**.
- [ ] Paste the **whole** of [`supabase/migrations/0004_documents.sql`](supabase/migrations/0004_documents.sql) and click **Run**.
  - It runs as one transaction, so either all of it applies or none of it does.
  - It's safe to run twice.
  - The site that's live right now keeps working after it runs: it only adds columns and functions.
- [ ] Check it worked, in a new query:

```sql
select version, applied_at from public.schema_migrations order by version;
```

Expect a row `0004_documents`.

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'subscriptions' and column_name like '%document%';
```

Expect `free_documents_used`, `period_documents_used`, `document_topup_balance`.

```sql
select * from public.usage_snapshot((select id from auth.users where email = 'YOUR-EMAIL'));
```

Expect one row with both image and document columns.

If any of these fail, **don't push**: send the error to Claude.

### 1.2 Push the release

- [ ] Ask Claude to commit and push, or commit and push the working tree to `production` yourself. Vercel and DigitalOcean both redeploy.

### 1.3 Check the deploy (about 5 minutes after pushing)

- [ ] https://api.drivetag-ai.com/api/plans shows `"families"` and `"documentPacks"`. Paste it in a browser.
- [ ] DigitalOcean → the app → **Runtime Logs**: there's no `"Schema problem"` line. That line would mean step 1.1 didn't run.
- [ ] https://drivetag-ai.com/plans shows the "What do you want to sort?" picker (Images / Documents / Images + Documents).
- [ ] Signed in, the dashboard shows image **and** document usage.

### 1.4 Smoke-test documents with your own account

- [ ] Dashboard → **New process** → choose **Documents** → pick a Raw folder and a Master folder → add destinations. For example:
  - "Invoices — bills and receipts from suppliers"
  - "Contracts — signed agreements and NDAs"
- [ ] Drop a PDF invoice and a Word file into that Raw folder. Within the polling interval, each should be renamed (e.g. `invoice_acme_q3-hosting.pdf`), moved into the right destination, and appear in Activity.
- [ ] Create a Google Doc **inside** Raw and keep typing in it. It should **not** move while you're editing. About 10½ minutes after your last edit, it's sorted automatically. If the backend restarted in between, click **Organize now**.
- [ ] Your usage shows 1 document used per file.
  - The Free plan includes 25 documents.
  - To test paid allowances, give yourself a plan (section 9).

**If something goes wrong after pushing:** revert the release commit and push again. Migration `0004` can stay, because the previous code works with it.

---

## 2. Domain: make Vercel's "Invalid Configuration" go away (Namecheap)

Namecheap → **Domain List** → `drivetag-ai.com` → **Advanced DNS**.

Why Vercel complains: the **HTTPS** toggle on your `@` record routes traffic through Namecheap's own proxy. So the internet sees Namecheap's IP (`159.198.67.67`) instead of Vercel's.

- [ ] **`A` record, host `@`**, value `216.198.79.1`: switch **HTTPS off**.
- [ ] Vercel → project → **Settings → Domains → Add Existing** → `www.drivetag-ai.com` → choose **Redirect to drivetag-ai.com**. Vercel shows a CNAME value for `www`.
- [ ] Namecheap: edit the **`CNAME` record, host `www`**. Replace `parkingpage.namecheap.com` with the value Vercel showed, and switch **HTTPS off**.
- [ ] Namecheap: the **`TXT` record with host `google`** verifies nothing there. Change its host to **`@`** and keep the same `google-site-verification=…` value. Leave the existing SPF TXT record on `@` alone.
- [ ] Leave these alone:
  - the `api` CNAME, which is the backend;
  - the `eforward` MX records, which run your email forwarding.
- [ ] The `_nnde10il…` → `dcv.ssl.com` CNAME belongs to the SSL certificate you bought at Namecheap. Vercel makes its own certificate, so you can keep or delete it.
- [ ] Check, after anything from a few minutes up to a few hours:

```bash
nslookup drivetag-ai.com 8.8.8.8
```

Expect `216.198.79.1`. Then Vercel → Domains → **Refresh** should say **Valid Configuration**.

Full walkthrough: [frontend/README.md → DNS](frontend/README.md#dns-namecheap--vercel).

---

## 3. Email addresses the legal pages publish

The Privacy Policy, Terms, Refund Policy and Data-deletion page all tell people to write to these addresses. They have to reach you.

- [ ] Namecheap → `drivetag-ai.com` → **Domain** tab → **Redirect Email**. Add:
  - `support@drivetag-ai.com` → your inbox
  - `privacy@drivetag-ai.com` → your inbox
- [ ] Send a test email to each and confirm it arrives.

---

## 4. Google: domain verification, OAuth branding, and going beyond test users

- [ ] **Search Console.** https://search.google.com/search-console → **Add property → Domain** → `drivetag-ai.com` → **Verify**. This needs the TXT fix from section 2.
- [ ] **Google Cloud Console** → APIs & Services → **Domain verification** → add `drivetag-ai.com`. It must be the same Google account that owns the Search Console property. Without this, Drive can't send webhooks to `api.drivetag-ai.com`.
- [ ] **Google Auth Platform → Branding:**
  - Application home page: `https://drivetag-ai.com/`
  - Application privacy policy link: `https://drivetag-ai.com/privacy`
  - Application terms of service link: `https://drivetag-ai.com/terms`
  - Authorized domains: `drivetag-ai.com`
- [ ] While the app is in **Testing** mode, add every Google account that will connect Drive as a **test user**. In Testing mode Drive access expires every 7 days.
- [ ] When you're ready to go public:
  - Submit for **brand verification**.
  - Submit for **restricted-scope verification**, because of the full `drive` scope.
  - Expect Google to ask for an annual **CASA** security assessment. Third-party estimates are $500–$4,500 a year; budget time and money for it.
- [ ] Optional, costs money: to make Google's sign-in screen say "DriveTag AI" instead of `ckskwjtjydaqewwojsfj.supabase.co`, set up a Supabase custom domain `auth.drivetag-ai.com` ([frontend/README.md](frontend/README.md#google-oauth-branding--verification)).

---

## 5. DigitalOcean (backend) settings

App → **Settings → App-Level Environment Variables**.

- [ ] Confirm the values:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `FRONTEND_URL` | `https://drivetag-ai.com` |
| `CORS_ORIGINS` | `https://drivetag-ai.com` |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.drivetag-ai.com/api/auth/google/callback` |
| `DRIVE_WEBHOOK_URL` | `https://api.drivetag-ai.com/webhook/drive` |
| `AUTO_SYNC_INTERVAL_SECONDS` | `60` (polling). Automatic sorting doesn't work without this until section 4's domain verification is done |

- [ ] Check the instance's RAM (App → **Settings → Resources**).
  - Each AI job can hold one image or one document of up to about 20 MB in memory.
  - On a 1 GB instance, add `MAX_CONCURRENT_AI_JOBS=10`.
  - On 2 GB or more, the default of 20 is fine.
- [ ] If `TRIAL_DAYS` is set, delete it; nothing reads it.
- [ ] After section 4 is done:
  - Redeploy. On boot the server upgrades existing polling watches to real webhooks.
  - Then optionally set `AUTO_SYNC_INTERVAL_SECONDS=0`, or keep `60` as a safety net.
  - If a user's watch still fails with `Unauthorized WebHook callback channel`, the domain isn't verified in Cloud Console yet.

---

## 6. Vercel (website) settings

- [ ] Project → **Settings → Environment Variables (Production)**:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_URL=https://api.drivetag-ai.com`
- [ ] Project → **Analytics** → **Enable**. The site only counts visitors who click "Allow analytics" in the cookie banner.
- [ ] After changing any variable, redeploy with **"Use existing build cache" turned off**. The values are baked in at build time.

---

## 7. Supabase

- [ ] **Authentication → URL Configuration:**
  - Site URL: `https://drivetag-ai.com`
  - Redirect URLs: `https://drivetag-ai.com/**` and `http://localhost:5173/**`
- [ ] **Security:** your database password was once pasted into a chat. Reset it in **Project Settings → Database**. The app doesn't use it, so nothing breaks.
- [ ] **Before the end of 2026:** Supabase is retiring the legacy `anon`/`service_role` keys.
  1. Create the new publishable and secret keys (Project Settings → API).
  2. Put them in Vercel (`VITE_SUPABASE_ANON_KEY`) and DigitalOcean (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`), and redeploy both.
  3. Then disable the legacy keys.

---

## 8. AI provider (Google AI Studio / Cloud billing)

- [ ] Keep **billing enabled** on the project behind the AI key. On the free tier Google may use submitted files to improve its products, which the Privacy Policy promises won't happen.
- [ ] An AI key was once pasted into a chat. If it's still the key in use, **rotate it**:
  1. Create a new key in AI Studio.
  2. Set `GEMINI_API_KEY` on DigitalOcean and redeploy.
  3. Delete the old key.
- [ ] Add a **budget alert**: Google Cloud Console → Billing → **Budgets & alerts**, for example at $50/month. Google's price for this model doubles on 2027-01-01. The per-file costs in README.md already assume that.

---

## 9. Managing plans and credits by hand (until checkout exists)

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
```

```sql
select public.admin_grant_document_credits('client@example.com', 250, 'Document pack 250, invoice #13');
```

```sql
-- Take credits back (fails and changes nothing if the balance would go negative)
select public.admin_grant_document_credits('client@example.com', -250, 'Refund, invoice #13');
```

```sql
-- Where someone stands (both kinds)
select * from public.usage_snapshot((select id from auth.users where email = 'client@example.com'));
```

Prices and allowances live in `backend/src/config/plans.js`. Changing a number is a code change, and adding a plan id also needs a migration.

---

## 10. Business decisions still open

- [ ] **Payment provider: Lemon Squeezy or Paddle.** Both take 5% + $0.50 per sale. Once you choose:
  - Claude builds checkout and the payment webhook.
  - The Privacy Policy must name the provider before checkout opens.
- [ ] **Final prices.** Everything shown today is a placeholder, and the margins behind them are in [README.md](README.md). Confirm or adjust.
- [ ] **Public launch vs invite-only.** Public needs section 4's verification and CASA. Invite-only can stay on the test-user list.

---

## 11. Repository housekeeping

- [ ] Stop tracking your personal Claude settings file:

```bash
git rm --cached .claude/settings.local.json
```

Then add `.claude/settings.local.json` to `.gitignore` and commit.

- [ ] Delete the leftover remote branch from an old docs pass:

```bash
git push origin --delete production-vdsjba
```

- [ ] Optional: rename `frontend/package.json`'s `"name"` from `temp-front` to `drivetag-frontend`.
