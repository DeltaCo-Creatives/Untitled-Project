# tutorial.md — Getting Every Credential

How to obtain each value in `backend/.env` and `frontend/.env`, where it comes from, and how to check it works. There are no `.env.example` templates in the repo (deleted in commit `0bdd63d`), so the quick-reference table below is the list of variables. For the wider setup order (database migration, deployment, cron) see [ForDev.md](ForDev.md); this file is only about credentials.

## Three rules

1. **Never paste a key into a chat, issue, screenshot, or commit.** If you do, rotate it — assume it's public.
2. `.env` files are gitignored and stay on your machine. Production values go in the hosting platform's encrypted env var settings, never in the repo.
3. Anything named `VITE_*` **ships to the browser**. It is public by definition. Never put a secret there.

## Quick reference

| Variable | Where it comes from | Secret? | Status |
|---|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio | 🔴 Yes | You fill |
| `GEMINI_MODEL` | Model ID string, not a credential. Code default `gemini-3.6-flash` | No | Optional (see §1) |
| `GOOGLE_CLIENT_ID` | Google Cloud → Credentials | 🟡 Semi-public | You fill |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → Credentials | 🔴 Yes | You fill |
| `GOOGLE_OAUTH_REDIRECT_URI` | You choose; must match Cloud config | No | ✅ Pre-set |
| `DRIVE_WEBHOOK_URL` | Your tunnel/domain — a URL, not a secret | No | You fill (§4) |
| `GOOGLE_DRIVE_WEBHOOK_TOKEN` | Random, self-generated | 🔴 Yes | ✅ Pre-generated |
| `SUPABASE_URL` | Supabase → Settings → API | No | ✅ Pre-set |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | 🔴 **Very** | You fill |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API | No | You fill |
| `TOKEN_ENCRYPTION_KEY` | Random, self-generated | 🔴 Yes | ✅ Pre-generated |
| `OAUTH_STATE_SECRET` | Random, self-generated | 🔴 Yes | ✅ Pre-generated |
| `FRONTEND_URL`, `CORS_ORIGINS`, `PORT`, `TRIAL_DAYS` | Configuration | No | ✅ Pre-set |

The values you obtain from a service are `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DRIVE_WEBHOOK_URL`, plus `SUPABASE_ANON_KEY` for the token helper. Everything marked Pre-set or Pre-generated is a default or a random secret you create yourself (§5).

`.env` files don't travel through git — each working copy needs its own, and every copy should share the same `TOKEN_ENCRYPTION_KEY`. See [Handover.md](Handover.md) for the current state.

To confirm at any time which are still empty:

```bash
cd backend && npm run dev
```

It refuses to start and names exactly what's missing.

---

## 1. GEMINI_API_KEY

**Where:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

1. Sign in with your Google account.
2. **Create API key** → pick a Cloud project (or let it create one).
3. Copy the key — it starts with `AIza...` or `AQ.`.

Paste it into `backend/.env`:

```bash
cd backend && sed -i 's|^GEMINI_API_KEY=.*|GEMINI_API_KEY=PASTE_YOUR_KEY_HERE|' .env
```

Or just open `backend/.env` in your editor and fill the blank — same thing.

**Verify:**

```bash
cd backend && npm run test:gemini
```

### Which model ID to use

The code defaults to `gemini-3.6-flash`. `gemini-2.5-flash` has been retired for new users and returns 404 — if your `.env` still sets it, change or delete that line. When Google retires a model, the 404 message names its replacement.

`GEMINI_MODEL` is a plain string, and a wrong one fails with a confusing `404 model not found`. Rather than guess, ask your key what it can actually reach:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY" | grep '"name"'
```

That prints the exact IDs available to you. Pick the Flash one you want and set it:

```bash
cd backend && sed -i 's|^GEMINI_MODEL=.*|GEMINI_MODEL=exact-id-from-that-list|' .env
```

**Free tier has low rate limits** and will throttle a real workload. Enable billing on the Cloud project before onboarding actual users — Flash models are inexpensive per image, but the request-per-minute cap is the thing that bites.

---

## 2. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET

Both come from the same place. This is a different credential from the Gemini key, and a different Google product (Cloud, not AI Studio) — though the same account is fine.

**Where:** [console.cloud.google.com](https://console.cloud.google.com)

1. Create or select a project (e.g. `drivetag-ai`).
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**. Nothing works without this.
3. **APIs & Services → OAuth consent screen**:
   - User type **External**
   - App name, support email, developer email
   - **Scopes** → add `https://www.googleapis.com/auth/drive`
   - **Test users** → add your own Google address. While the app is unverified only listed test users can sign in.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type: **Web application**
   - **Authorized redirect URIs** — add *both*:
     ```
     http://localhost:3001/api/auth/google/callback
     https://ckskwjtjydaqewwojsfj.supabase.co/auth/v1/callback
     ```
     The first is this backend's Drive flow; the second is Supabase's Google login. One client serves both. Production adds a third, `https://api.drivetag-ai.com/api/auth/google/callback` ([domainguide.md](domainguide.md) §5).
5. Copy **Client ID** and **Client secret** into `backend/.env`.
6. Paste the *same* pair into Supabase → **Authentication → Providers → Google** (enable it there too).

The client ID is embedded in consent URLs and isn't really secret; the **client secret is**. Treat the pair as secret in practice.

---

## 3. SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, SUPABASE_URL

**Where:** Supabase dashboard → your project → **Project Settings → API**

Three values live on that page:

- **Project URL** → `SUPABASE_URL`. Already set for you: `https://ckskwjtjydaqewwojsfj.supabase.co`
- **anon / public** → `SUPABASE_ANON_KEY`. Safe for browsers; row-level security constrains it. The backend only uses it for `npm run token`.
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY`. 🔴 **This bypasses all row-level security.** It's equivalent to full database access. Backend only — never in the frontend, never in a `VITE_*` var, never in git.

Both keys are long JWTs beginning `eyJ...`. It's easy to grab the wrong one — check the label carefully, since swapping them causes either mysterious permission errors (anon where service_role belongs) or a serious security hole (the reverse).

**Verify** (after running the §2 migration from ForDev.md):

```bash
cd backend && npm run dev
```

Then, having created a test user under **Authentication → Users**:

```bash
cd backend && npm run token -- you@example.com yourpassword
```

A printed token means URL + anon key are right. A 200 from an authed route means service_role is right:

```bash
curl -s http://localhost:3001/api/me -H "Authorization: Bearer PASTE_TOKEN"
```

---

## 4. DRIVE_WEBHOOK_URL

**Not a credential** — it's the public HTTPS address Google posts notifications to. But it's the fiddliest value here.

Google will only deliver to a domain that is **verified in your Cloud project**, and you can't verify a domain you don't own. That rules out free ngrok subdomains and DigitalOcean's default `*.ondigitalocean.app`. Symptom when it's wrong: `changes.watch` fails with `Unauthorized WebHook callback channel`.

**The workable path:**

1. Own a domain — done: `drivetag-ai.com`. Its full wiring, including the production value `https://api.drivetag-ai.com/webhook/drive`, is in [domainguide.md](domainguide.md).
2. Verify it in [Google Search Console](https://search.google.com/search-console) via DNS TXT record.
3. Add it in Google Cloud Console → **APIs & Services → Domain verification**.
4. Point a subdomain at your local server:
   - **Cloudflare Tunnel** — free if your DNS is on Cloudflare:
     ```bash
     cloudflared tunnel --url http://localhost:3001
     ```
     (bind it to a named subdomain for a stable URL)
   - **ngrok paid** — reserve a custom domain like `dev.yourdomain.com`
5. Set the value including the path:
   ```
   DRIVE_WEBHOOK_URL=https://dev.yourdomain.com/webhook/drive
   ```

**While you're still just testing the endpoint itself,** a plain free ngrok URL is fine — you can verify the receiver without Google by curling it directly (ForDev.md §7). You only hit the verification wall when you call `POST /api/drive/watch`.

Whenever this URL changes, restart the backend and re-register the watch — existing channels point at the old address.

---

## 5. The three already generated for you

`TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`, and `GOOGLE_DRIVE_WEBHOOK_TOKEN` are random values you invent, not things you fetch. They're already in your `backend/.env`. You never need to obtain them anywhere.

To make a new one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- `TOKEN_ENCRYPTION_KEY` — must be exactly 64 hex chars. **Rotating it makes every stored Google refresh token undecryptable and forces all users to reconnect Drive.** The most disruptive value in the file.
- `OAUTH_STATE_SECRET` — safe to rotate; only invalidates OAuth redirects in flight.
- `GOOGLE_DRIVE_WEBHOOK_TOKEN` — safe to rotate, but re-register watch channels afterwards, since Google echoes the value it was given at registration and the webhook will start returning 403 on the old ones.

---

## 6. Frontend variables

The frontend reads its own file — `frontend/.env` (gitignored; `.env.local` also works). There's no template in the repo:

```
VITE_SUPABASE_URL=https://ckskwjtjydaqewwojsfj.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key from §3>
VITE_GOOGLE_CLIENT_ID=<client ID from §2>
```

All three are public — they're compiled into the JavaScript bundle. That's expected and fine. The **service_role key must never appear here.**

You'll also need `VITE_API_URL` (e.g. `http://localhost:3001`) once the frontend starts calling the backend — it doesn't yet.

---

## 7. What you do *not* need

**The Postgres connection string** (`postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres`) is not used anywhere in this project. The backend talks to Supabase over its REST API with the service_role key, and the migration runs in the dashboard SQL Editor. You'd only want the connection string for CLI tooling like `psql`, Drizzle, or Prisma.

That password grants direct database access and bypasses row-level security entirely, so there's no reason to have it in a `.env` here.

---

## 8. Rotating a leaked credential

| Credential | Where to rotate | Side effect |
|---|---|---|
| `GEMINI_API_KEY` | AI Studio → delete key, create new | None |
| `GOOGLE_CLIENT_SECRET` | Cloud → Credentials → client → Reset secret | Users re-consent; update Supabase provider too |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → rotate | Backend must restart with the new value |
| Postgres password | Supabase → Settings → Database → Reset | None for this app (unused) |
| `TOKEN_ENCRYPTION_KEY` | Generate new | ⚠️ All users must reconnect Drive |
| `OAUTH_STATE_SECRET` | Generate new | In-flight OAuth redirects fail |
| `GOOGLE_DRIVE_WEBHOOK_TOKEN` | Generate new | Re-register all watch channels |

After rotating anything, update it in `backend/.env` locally **and** in DigitalOcean/Vercel env vars for production.

---

## 9. Final check

With all blanks filled:

```bash
cd backend && npm run dev
```

Expected: `{"level":"info","message":"DriveTag AI backend started",...}`. Any missing variable is named explicitly instead.

```bash
curl -s http://localhost:3001/health
```

Expected: `{"status":"ok"}`.

Then continue with [ForDev.md](ForDev.md) §8 for the full end-to-end loop.
