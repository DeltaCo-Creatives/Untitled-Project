import { supabase } from "../lib/supabase.js";

/**
 * Validates the Supabase access token via the Auth API rather than verifying a
 * JWT locally, so it keeps working across Supabase's signing-key rotations
 * without this service holding the JWT secret.
 */
export async function requireAuth(req, res, next) {
  const header = req.header("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "Invalid or expired token" });

  req.user = data.user;
  next();
}
