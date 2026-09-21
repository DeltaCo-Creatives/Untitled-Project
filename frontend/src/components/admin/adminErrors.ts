import { ApiError, isAdminApiMissing } from '../../lib/api';
import { errorMessage } from '../../lib/messages';

/**
 * Every `/api/admin/*` call in the owner page goes through this so a backend that predates the
 * owner-settings API (404/401) reads as a plain "still deploying" message rather than a raw error
 * or a crash — the brief's deploy-window safety rule. Field-level `details` (from a 400
 * `invalid_setting`/`unknown_setting`) are appended so a validation failure says exactly what was
 * wrong, not just that something was.
 */
export function describeAdminError(err: unknown, fallback: string): string {
  if (isAdminApiMissing(err)) {
    return "This server doesn't have the owner settings API yet — try again after the backend deploys.";
  }
  const message = errorMessage(err, fallback);
  if (err instanceof ApiError && err.details && err.details.length > 0) {
    const extra = err.details.map((detail) => detail.message).join(' ');
    if (extra && !message.includes(extra)) return `${message} ${extra}`;
  }
  return message;
}
