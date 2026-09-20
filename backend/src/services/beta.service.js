import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";
import { logger } from "../utils/logger.js";
import { findByEmail, listSignups, setAdded, setNotes, upsertSignup } from "../repositories/betaSignup.repo.js";

// Conservative: exactly one "@", at least one "." in the domain part.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeEmail(value) {
  return text(value).toLowerCase();
}

/** Empty ADMIN_EMAILS ⇒ this is always false — fail closed. */
export function isAdmin(email) {
  return env.admin.emails.includes(normalizeEmail(email));
}

/** A percent (1-90) AND a non-empty code are both required for the beta discount to exist. */
export function discountEnabled() {
  return env.beta.discountPercent >= 1 && env.beta.discountPercent <= 90 && Boolean(env.beta.discountCode);
}

/**
 * { tester, discountPercent, discountCode }. `tester` is true only once an
 * owner has marked the signup added_to_google. Never leaks the code (or a
 * nonzero percent) to anyone who isn't a tester.
 */
export async function betaStatusFor(email) {
  let signup;
  try {
    signup = await findByEmail(email);
  } catch (err) {
    // GET /api/me is the dashboard's whole load and it polls every 3 seconds while sorting.
    // Beta pricing is the least important thing in that response, so a hiccup reading this one
    // table must not take the dashboard down with it. The reason is a database error string,
    // never the signup itself.
    logger.warn("Could not read beta status", { reason: err.message });
    return { tester: false, discountPercent: 0, discountCode: null };
  }

  const tester = Boolean(signup?.added_to_google);
  if (!tester || !discountEnabled()) return { tester, discountPercent: 0, discountCode: null };
  return { tester, discountPercent: env.beta.discountPercent, discountCode: env.beta.discountCode };
}

/**
 * Body: { name, email, workType?, weeklyVolume?, consent }. Field-level errors
 * use the same { field, message } shape as utils/processValidation.js.
 */
export function validateSignupInput(body) {
  const errors = [];
  const fail = (field, message) => errors.push({ field, message });
  const input = body && typeof body === "object" ? body : {};

  const name = text(input.name);
  if (!name) fail("name", "Tell us your name.");
  else if (name.length > 120) fail("name", "Keep your name under 120 characters.");

  const email = normalizeEmail(input.email);
  if (!email) fail("email", "Enter your Google account email.");
  else if (email.length > 320) fail("email", "That email is too long.");
  else if (!EMAIL_RE.test(email)) fail("email", "Enter a valid email address.");

  const workType = text(input.workType);
  if (workType.length > 60) fail("workType", "Keep this under 60 characters.");

  const weeklyVolume = text(input.weeklyVolume);
  if (weeklyVolume.length > 40) fail("weeklyVolume", "Keep this under 40 characters.");

  if (input.consent !== true) fail("consent", "Tick the consent box so we may email you about the beta.");

  return { errors, value: { name, email, workType: workType || null, weeklyVolume: weeklyVolume || null } };
}

/** Throws a 400 with field-level details, or returns the cleaned values ready to store. */
export function assertValidSignup(body) {
  const { errors, value } = validateSignupInput(body);
  if (errors.length > 0) throw new HttpError(400, errors[0].message, { code: "invalid_signup", details: errors });
  return value;
}

/** Upserts an already-validated signup. Same outcome whether the email was new or already on the list. */
export async function saveSignup(value) {
  await upsertSignup({ ...value, consentAt: new Date().toISOString() });
  // Never log the email itself — only that a signup happened.
  logger.info("Beta signup received", { event: "beta_signup" });
}

function serializeSignup(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    workType: row.work_type,
    weeklyVolume: row.weekly_volume,
    addedToGoogle: Boolean(row.added_to_google),
    addedAt: row.added_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** Admin table data: every signup, plus how many are marked added. */
export async function listSignupsForAdmin() {
  const rows = await listSignups();
  const added = rows.filter((row) => row.added_to_google).length;
  return { signups: rows.map(serializeSignup), counts: { total: rows.length, added, pending: rows.length - added } };
}

/** Applies whichever fields are present; returns the serialized row, or null if id is unknown. */
export async function patchSignup(id, { addedToGoogle, notes }) {
  let row = null;
  if (addedToGoogle !== undefined) row = await setAdded(id, addedToGoogle);
  if (notes !== undefined) row = await setNotes(id, notes);
  return row ? serializeSignup(row) : null;
}

const CSV_COLUMNS = ["email", "name", "work_type", "weekly_volume", "added_to_google", "added_at", "created_at", "notes"];

// Excel, Numbers and Sheets evaluate a cell whose text starts with =, +, - or @ as a formula.
// `name` and `notes` arrive from a public form and this file is opened by the owner, so a signup
// named `=HYPERLINK(...)` would run on their machine (CSV injection, CWE-1236). Prefixing the
// lead character with an apostrophe makes the spreadsheet treat the whole cell as text.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function csvField(value) {
  let field = value === null || value === undefined ? "" : String(value);
  if (FORMULA_LEAD.test(field)) field = `'${field}`;
  return /[",\r\n]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** text/csv body for the admin export. Takes raw repo rows so the columns match the table exactly. */
export function signupsToCsv(rows) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((column) => csvField(row[column])).join(","));
  return lines.join("\n");
}
