import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts (GDPR: LG München I, 3 O 17493/20 — no calls to Google's font CDN).
// Weight axis only, latin script: matches the -wght@500;600;700 / 400;600;700;800 the Google Fonts link used.
import '@fontsource-variable/fredoka/wght.css'
import '@fontsource-variable/nunito/wght.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
