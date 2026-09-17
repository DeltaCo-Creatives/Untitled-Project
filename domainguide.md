# domainguide.md — Wiring up drivetag-ai.com

> **Status (2026-09-16): not started.** Every checklist item below is open. The live DigitalOcean and Vercel URLs haven't been recorded, so it's unconfirmed whether the initial deploys this guide assumes exist yet. Fill them in below once known, and update [Handover.md](Handover.md).

You bought `drivetag-ai.com` on Namecheap (plus SSL, DNS, and domain privacy add-ons). This is the walkthrough for pointing it at your live backend (DigitalOcean) and frontend (Vercel), verifying it with Google, and updating every env var that currently still says `localhost` or a placeholder ngrok URL.

This isn't cosmetic — owning and verifying this domain is what unblocks the Drive webhook. ForDev.md §7b and tutorial.md §4 already explained why: Google will only deliver push notifications to a domain you've verified in Cloud Console, and neither `*.ondigitalocean.app` nor a free ngrok subdomain can ever be verified. This domain is the fix.

## Domain layout

- `drivetag-ai.com` → Vercel (the frontend)
- `api.drivetag-ai.com` → DigitalOcean (the backend)
- `auth.drivetag-ai.com` → Supabase custom domain (the Google sign-in redirect — §9)

A subdomain for the API keeps redirect URIs and CORS simple and is the standard pattern. Google's domain verification covers the whole domain, subdomains included, so you only verify once.

**Your current live URLs (fill these in so you have a fallback reference):**
- DigitalOcean default URL: `_____________________.ondigitalocean.app`
- Vercel default URL: `_____________________.vercel.app`

---

## 0. About the SSL certificate you bought

**You almost certainly don't need to install it anywhere.** Both Vercel and DigitalOcean App Platform auto-provision and auto-renew a free SSL certificate (Let's Encrypt) for any custom domain the moment your DNS points at them correctly — there's no step on either platform to upload your own certificate. A purchased SSL cert is for servers you manage yourself (cPanel hosting, a raw VPS) — neither applies here.

Nothing to do — just don't spend time hunting for an "upload certificate" button that won't exist. If it hasn't been issued yet, it may be worth asking Namecheap for a refund since this project has no use for it.

---

## 1. Confirm Namecheap DNS is actually active

Namecheap → **Domain List → Manage** on `drivetag-ai.com`:

- [ ] **Nameservers** are set to "Namecheap BasicDNS" (or "PremiumDNS," since you bought DNS) — not "Custom DNS." If it's pointed elsewhere, the records you add below won't do anything.
- [ ] **Domain Privacy** shows as **ON** (WhoisGuard). Usually auto-enabled at purchase — just confirm.

All the records below go in the same place: **Advanced DNS** tab on that same Manage page.

---

## 2. Point the frontend at Vercel

1. Vercel → your project → **Settings → Domains → Add** → enter `drivetag-ai.com` (add `www.drivetag-ai.com` too if you want it).
2. Vercel displays the exact record(s) to add — usually an **A record** (`@` → `76.76.21.21`) for the apex domain and/or a **CNAME** (`www` → `cname.vercel-dns.com`). Copy exactly what Vercel shows you; it can change, don't reuse a value from memory or a tutorial.
3. Namecheap → Advanced DNS → **Add New Record** → enter what Vercel gave you.
4. Wait for DNS to propagate (minutes to a few hours). Vercel's dashboard flips to a green checkmark and issues SSL automatically once it sees the record resolve.

---

## 3. Point the backend at DigitalOcean

1. DigitalOcean → App Platform → your app → **Settings → Domains → Add Domain** → enter `api.drivetag-ai.com`.
2. DO shows a **CNAME** target pointing at your app's `*.ondigitalocean.app` address — copy it.
3. Namecheap → Advanced DNS → Add New Record → **CNAME**, Host: `api`, Value: what DO gave you.
4. Wait for DNS + DO's automatic SSL to go live (shows "Active" in the DO dashboard).

---

## 4. Verify the domain with Google

This is the step that actually unblocks the webhook.

1. [Google Search Console](https://search.google.com/search-console) → **Add property → Domain** → enter `drivetag-ai.com`.
2. Google gives you a DNS **TXT** record (`google-site-verification=...`).
3. Namecheap → Advanced DNS → Add New Record → **TXT**, Host: `@`, Value: what Google gave you.
4. Wait for DNS propagation, then click **Verify** in Search Console.
5. Google Cloud Console → **APIs & Services → Domain verification** → `drivetag-ai.com` should now be selectable (verification is shared across Search Console and Cloud Console on the same Google account).

---

## 5. Add the new OAuth redirect URI

Google Cloud Console → your OAuth client → **Authorized redirect URIs** → add a third one:

```
https://api.drivetag-ai.com/api/auth/google/callback
```

(The other two — `localhost:3001` and the Supabase callback — stay. You need all three: local dev, Supabase login, and now production.)

---

## 6. Update the backend's env vars on DigitalOcean, then redeploy

| Var | New value |
|---|---|
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://api.drivetag-ai.com/api/auth/google/callback` |
| `DRIVE_WEBHOOK_URL` | `https://api.drivetag-ai.com/webhook/drive` |
| `FRONTEND_URL` | `https://drivetag-ai.com` |
| `CORS_ORIGINS` | `https://drivetag-ai.com` (comma-separate if you also serve `www`) |

These currently still hold `localhost` values / the ngrok placeholder from initial deploy — that was expected at the time, this is the step that fixes it.

---

## 7. Update Supabase

Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL** → `https://drivetag-ai.com`
- **Redirect URLs** → add `https://drivetag-ai.com/**`

(Leave the `localhost:5173` entry too, so local dev logins keep working.)

---

## 8. Confirm it all actually works

```bash
curl -s https://api.drivetag-ai.com/health
```
Expect `{"status":"ok"}` with a valid cert (no browser warning if you open it directly).

Open `https://drivetag-ai.com` in a browser — check the padlock.

Once a real user connects Drive in production, `POST /api/drive/watch` is the true test: if the domain verification (§4) didn't take, it fails with `Unauthorized WebHook callback channel` — same error ForDev.md §7b warned about. If you see that after all the above, re-check Cloud Console → Domain verification actually shows `drivetag-ai.com` as verified, not just Search Console.

---

## 9. Make Google's sign-in screen say "DriveTag AI", not `ckskwjtjydaqewwojsfj.supabase.co`

**Why it happens:** "Continue with Google" goes through Supabase's own domain, so Google shows *that* domain on the consent screen. Google only shows your app's name and logo once your brand is verified. Supabase's own docs recommend fixing both. The Drive-permission screen (the second Google prompt) goes through the backend instead, so once the backend is on `api.drivetag-ai.com` it shows your domain already.

Do these in order. The only code-level change is one env var in step 3.

### 9a. Supabase custom domain → `auth.drivetag-ai.com`

1. Supabase needs a **paid plan** plus the **Custom Domain add-on** (Project Settings → Add-ons). Check current pricing before enabling it.
2. Supabase dashboard → Project Settings → **Custom Domains** → enter `auth.drivetag-ai.com`. It shows the exact records to add.
3. Namecheap → Advanced DNS → add them exactly as shown. Usually that's:
   - **CNAME** — Host `auth` → `ckskwjtjydaqewwojsfj.supabase.co`
   - **TXT** — Host `_acme-challenge.auth` → the value Supabase shows (proves ownership and issues the SSL cert)
4. Wait for DNS, then verify and activate, either in the dashboard or with the Supabase CLI:
   ```bash
   supabase domains reverify --project-ref ckskwjtjydaqewwojsfj
   ```
   ```bash
   supabase domains activate --project-ref ckskwjtjydaqewwojsfj
   ```
   The old `ckskwjtjydaqewwojsfj.supabase.co` address keeps working after activation, so nothing breaks mid-switch.

### 9b. Register the new callback with Google

Google Cloud Console → APIs & Services → **Credentials** → the OAuth client → **Authorized redirect URIs** → **add** (don't replace the existing Supabase one yet):
```
https://auth.drivetag-ai.com/auth/v1/callback
```

### 9c. Point the frontend at the custom domain

Set `VITE_SUPABASE_URL=https://auth.drivetag-ai.com` in `frontend/.env` **and** in Vercel → Project → Environment Variables, then redeploy. No code change — `frontend/src/lib/supabase.ts` already reads this variable. Click "Continue with Google": the screen should now say `auth.drivetag-ai.com`.

### 9d. Verify your brand with Google (shows the name + logo)

Google Cloud Console → **Google Auth Platform → Branding**:
- **App name:** DriveTag AI
- **App logo:** 120×120 PNG/JPG — `frontend/public/favicon.svg` is the mark; export it at 120×120
- **User support email** and **developer contact email**
- **App home page:** `https://drivetag-ai.com`. It must be live (Vercel, §2)
- **Privacy policy** and **Terms of service** links. These pages must exist on `drivetag-ai.com`, and neither is written yet.
- **Authorized domains:** `drivetag-ai.com`, which must already be verified (§4)

Then submit for **brand verification**. Google says it takes a few business days. Until approved, Google keeps showing the domain rather than the name.

> This is **brand** verification only. Because the app requests the restricted `drive` scope, serving users beyond your test-user list *also* needs Google's separate app verification (see the warning in [ForDev.md](ForDev.md) §3).

---

## Checklist

- [ ] Confirmed Namecheap nameservers + domain privacy (§1)
- [ ] Vercel domain added, DNS record added, SSL live (§2)
- [ ] DigitalOcean domain added, DNS record added, SSL live (§3)
- [ ] Domain verified in Search Console (§4)
- [ ] Domain verified in Cloud Console → Domain verification (§4)
- [ ] Third redirect URI added to the OAuth client (§5)
- [ ] Four env vars updated on DigitalOcean + redeployed (§6)
- [ ] Supabase Site URL + redirect allowlist updated (§7)
- [ ] `/health` and the frontend both load over `https://` with a valid cert (§8)
- [ ] A real Drive-connected user can start a watch without the `Unauthorized WebHook callback channel` error (§8)
- [ ] Supabase Custom Domain add-on enabled, `auth` CNAME + `_acme-challenge` TXT added, domain activated (§9a)
- [ ] `https://auth.drivetag-ai.com/auth/v1/callback` added to the OAuth client (§9b)
- [ ] `VITE_SUPABASE_URL` switched to `https://auth.drivetag-ai.com` locally and in Vercel (§9c)
- [ ] Privacy policy + terms pages live on `drivetag-ai.com` (§9d prerequisite)
- [ ] Branding filled in and brand verification submitted/approved (§9d)
