import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials are missing. Please add them to your .env.local file.');
}

let validUrl = supabaseUrl;
if (!validUrl || !validUrl.startsWith('http')) {
  validUrl = 'https://placeholder.supabase.co';
}

// Create a single supabase client for interacting with your database
export const supabase = createClient(
  validUrl,
  supabaseAnonKey || 'placeholder'
);
