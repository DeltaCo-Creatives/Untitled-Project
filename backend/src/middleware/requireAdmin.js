import { isAdmin } from "../services/beta.service.js";
import { HttpError } from "../utils/httpError.js";

/**
 * Must run after requireAuth — req.user.email comes from Supabase's verified token.
 * This is the actual authorization check for every admin-only route (the beta signups
 * routes and everything under /api/admin). The frontend's `me.admin` flag only decides
 * whether to render admin UI; it is never authorisation on its own, so every admin
 * route re-checks this server-side.
 */
export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user.email)) return next(new HttpError(403, "Admins only.", { code: "not_admin" }));
  next();
}
