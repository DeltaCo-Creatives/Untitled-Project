import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are missing. Add them to frontend/.env (or the hosting environment) and rebuild.',
  );
}

export const supabase = createClient(
  // Placeholders only keep `npm run dev` from crashing; production builds refuse to run without real values (vite.config.ts).
  supabaseUrl?.startsWith('http') ? supabaseUrl : 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  // PKCE: if a sign-in is ever redirected to the wrong address, it carries a one-time code bound to this
  // browser instead of a live access/refresh token in the URL.
  { auth: { flowType: 'pkce' } },
);
