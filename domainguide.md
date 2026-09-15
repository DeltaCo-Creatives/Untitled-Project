# domainguide.md — Wiring up drivetag-ai.com

You bought `drivetag-ai.com` on Namecheap (plus SSL, DNS, and domain privacy add-ons). This is the walkthrough for pointing it at your live backend (DigitalOcean) and frontend (Vercel), verifying it with Google, and updating every env var that currently still says `localhost` or a placeholder ngrok URL.

This isn't cosmetic — owning and verifying this domain is what unblocks the Drive webhook. ForDev.md §7b and tutorial.md §4 already explained why: Google will only deliver push notifications to a domain you've verified in Cloud Console, and neither `*.ondigitalocean.app` nor a free ngrok subdomain can ever be verified. This domain is the fix.

## Domain layout

- `drivetag-ai.com` → Vercel (the frontend)
- `api.drivetag-ai.com` → DigitalOcean (the backend)

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
