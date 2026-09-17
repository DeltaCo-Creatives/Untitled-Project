import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// VITE_* values are baked into the bundle at build time. A production build missing one
// silently shipped `http://localhost:3001` as the API address, so fail the build instead.
const REQUIRED_AT_BUILD = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_URL']

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), 'VITE_')
    const missing = REQUIRED_AT_BUILD.filter((name) => !env[name])
    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.join(', ')} for this build. Set them in frontend/.env locally, or in Vercel → Settings → Environment Variables, then rebuild.`,
      )
    }
    // Vercel sets VERCEL=1 while building. A deployed site can never reach the builder's localhost.
    if (process.env.VERCEL && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(env.VITE_API_URL)) {
      throw new Error(
        `VITE_API_URL is ${env.VITE_API_URL} in a Vercel build. Set it to https://api.drivetag-ai.com in Vercel → Settings → Environment Variables, then redeploy.`,
      )
    }
  }

  return {
    plugins: [react()],
    // Fail loudly instead of drifting to another port: Supabase's redirect allowlist names these.
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  }
})
