import { createClient } from "@supabase/supabase-js";
import { env } from "../src/config/env.js";

/**
 * Prints a Supabase access token for a test user, so the authenticated API
 * can be exercised with curl before the frontend is wired up.
 *
 *   npm run token -- you@example.com yourpassword
 */
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: npm run token -- <email> <password>");
  console.error("Create the user first in Supabase > Authentication > Users.");
  process.exit(1);
}

if (!env.supabase.anonKey) {
  console.error("SUPABASE_ANON_KEY is not set in backend/.env.");
  console.error("Get it from Supabase > Project Settings > API > anon/public.");
  process.exit(1);
}

const client = createClient(env.supabase.url, env.supabase.anonKey, {
  auth: { persistSession: false },
});

const { data, error } = await client.auth.signInWithPassword({ email, password });

if (error) {
  console.error(`Sign-in failed: ${error.message}`);
  process.exit(1);
}

console.log(data.session.access_token);
console.error(`\n(expires ${new Date(data.session.expires_at * 1000).toISOString()})`);
