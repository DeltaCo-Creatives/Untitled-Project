import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fail loudly instead of drifting to another port: CORS_ORIGINS and Supabase's redirect allowlist only name these.
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
