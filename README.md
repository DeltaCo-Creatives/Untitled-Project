# DriveTag AI

Automated visual-asset tagging for creative agencies and freelancers. Watches a Google Drive "Raw" folder, classifies new images with Gemini Flash, then renames and moves them into a destination folder. See [ProjectStructure.md](ProjectStructure.md) for the full product blueprint and [CLAUDE.md](CLAUDE.md) for architecture notes.

The backend is built (Drive OAuth, folder config, watch channels, the Gemini pipeline, rename/move). The frontend is not started. **Start with [ForDev.md](ForDev.md)** for setup order and [tutorial.md](tutorial.md) for each credential — it walks through Supabase, Google Cloud, and secrets setup step by step.

## Backend quickstart

```bash
cd backend
npm install
cp .env.example .env   # fill in GEMINI_API_KEY and GOOGLE_DRIVE_WEBHOOK_TOKEN
npm run dev
```

This starts the Express server on `http://localhost:3001` with:
- `GET /health` — liveness check
- `POST /webhook/drive` — Google Drive push-notification receiver

### Testing the Gemini pipeline

```bash
cd backend
npm run test:gemini                       # uses test-assets/sample.jpg, or a placeholder pixel if absent
npm run test:gemini path/to/your/photo.jpg # classify a specific image
```

Prints the `{genre, subject, style}` JSON Gemini returns for the image.

### Testing the webhook locally with ngrok

Google Drive push notifications require a public HTTPS URL, so local testing goes through ngrok.

1. Install ngrok and authenticate once:
   ```bash
   npm install -g ngrok
   ngrok config add-authtoken <your-authtoken-from-ngrok.com>
   ```
2. Start the backend in one terminal:
   ```bash
   cd backend && npm run dev
   ```
3. In a second terminal, expose it:
   ```bash
   ngrok http 3001
   ```
   ngrok prints a public URL like `https://abcd1234.ngrok-free.app` — this forwards to your local server.
4. Simulate a Drive push notification against either the local server or the ngrok URL:
   ```bash
   curl -X POST http://localhost:3001/webhook/drive \
     -H "X-Goog-Channel-ID: test-channel" \
     -H "X-Goog-Resource-ID: test-resource" \
     -H "X-Goog-Resource-State: update" \
     -H "X-Goog-Channel-Token: $GOOGLE_DRIVE_WEBHOOK_TOKEN"
   ```
   A `200 OK` with no body means the endpoint accepted it; check the backend's console log for the parsed notification. Omitting/mismatching the token header should get a `403`.
5. Registering a real Drive `watch()` channel against the ngrok URL requires OAuth credentials, which is out of scope until Loop A (auth) is built — this step only proves the receiver shape.
