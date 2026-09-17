/**
 * An expected, user-facing failure (400/402/404/409). errorHandler shows its
 * message, code and details even in production, unlike unexpected errors.
 */
export class HttpError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}
