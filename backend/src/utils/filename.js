// Keep in sync with frontend/src/lib/filename.ts, which renders the editor's
// live preview. Both are checked against tests/filename-vectors.json.
//
// Deliberately no node: imports, so the two files stay line-for-line comparable.

const MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/tiff": ".tif",
};

export const SUPPORTED_MIME_TYPES = Object.keys(MIME_EXTENSIONS);

/** Tokens a rename template may use, besides {tag:<key>} for custom tag fields. */
export const TEMPLATE_TOKENS = ["destination", "subject", "style", "genre", "date", "original", "process"];

const MAX_BASE_LENGTH = 150;
const LITERAL_ALLOWED = /^[A-Za-z0-9 _\-.()]*$/;
const SEPARATORS = "-_. ";

export function slugify(value, fallback = "") {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining accents so "über" → "uber", not "u-ber"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Splits a template into literal text and {token} parts. Unbalanced braces become an error part. */
export function parseTemplate(template) {
  const parts = [];
  const text = String(template ?? "");
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("{", index);
    const strayClose = text.indexOf("}", index);
    if (strayClose !== -1 && (open === -1 || strayClose < open)) {
      parts.push({ type: "error", value: text.slice(index, strayClose + 1) });
      index = strayClose + 1;
      continue;
    }
    if (open === -1) {
      parts.push({ type: "literal", value: text.slice(index) });
      break;
    }
    if (open > index) parts.push({ type: "literal", value: text.slice(index, open) });
    const close = text.indexOf("}", open);
    if (close === -1) {
      parts.push({ type: "error", value: text.slice(open) });
      break;
    }
    parts.push({ type: "token", value: text.slice(open + 1, close).trim() });
    index = close + 1;
  }
  return parts;
}

/** Human-readable problems with a template; an empty array means it's valid. */
export function validateTemplate(template, tagKeys = []) {
  const errors = [];
  const text = String(template ?? "");
  if (!text.trim()) return ["The naming template can't be empty."];

  let tokens = 0;
  for (const part of parseTemplate(text)) {
    if (part.type === "error") {
      errors.push(`"${part.value}" has an unmatched brace.`);
    } else if (part.type === "literal") {
      if (!LITERAL_ALLOWED.test(part.value)) {
        errors.push(`"${part.value}" can only use letters, numbers, spaces and - _ . ( ).`);
      }
    } else {
      tokens += 1;
      const tagMatch = /^tag:(.+)$/.exec(part.value);
      if (tagMatch) {
        if (!tagKeys.includes(tagMatch[1])) errors.push(`{${part.value}} doesn't match any of this process's tag fields.`);
      } else if (!TEMPLATE_TOKENS.includes(part.value)) {
        errors.push(`{${part.value}} isn't a naming token.`);
      }
    }
  }
  if (tokens === 0) errors.push("Add at least one token, like {subject}, so files don't all get the same name.");
  return errors;
}

function extensionOf(originalName) {
  const name = String(originalName ?? "");
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  const extension = name.slice(dot).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

function withoutExtension(originalName) {
  const name = String(originalName ?? "");
  return extensionOf(name) ? name.slice(0, name.lastIndexOf(".")) : name;
}

function tokenValue(token, values) {
  const tagMatch = /^tag:(.+)$/.exec(token);
  if (tagMatch) return values.tags?.[tagMatch[1]];
  if (token === "original") return withoutExtension(values.original);
  return values[token];
}

function trimStartSeparators(text) {
  let start = 0;
  while (start < text.length && SEPARATORS.includes(text[start])) start += 1;
  return text.slice(start);
}

function trimEndSeparators(text) {
  let end = text.length;
  while (end > 0 && SEPARATORS.includes(text[end - 1])) end -= 1;
  return text.slice(0, end);
}

function trimSeparators(text) {
  return trimEndSeparators(trimStartSeparators(text));
}

function renderBase(template, values) {
  const parts = parseTemplate(template).map((part) =>
    part.type === "token"
      ? { type: "token", text: slugify(tokenValue(part.value, values)) }
      : // Stored templates are validated on save; still never let a stray character into Drive.
        { type: "literal", text: part.value.replace(/[^A-Za-z0-9 _\-.()]/g, "-") },
  );

  // An empty token takes the separator next to it along, so "{a}_{b}_{c}" with
  // no {b} gives "a_c", while a deliberate "{a} - {c}" keeps its " - ".
  parts.forEach((part, index) => {
    if (part.type !== "token" || part.text) return;
    const before = parts[index - 1];
    const after = parts[index + 1];
    if (before?.type === "literal" && before.text) before.text = trimEndSeparators(before.text);
    else if (after?.type === "literal") after.text = trimStartSeparators(after.text);
  });

  const joined = trimSeparators(parts.map((part) => part.text).join(""));
  return trimSeparators(joined.slice(0, MAX_BASE_LENGTH));
}

/**
 * The name a sorted file gets, e.g. "{destination}_{subject}_{date}" →
 * "logos_acme-wordmark_2026-09-17.png". Every token value is slugged; empty
 * tokens don't leave doubled separators behind. Drive allows duplicate names
 * in a folder, so similar images can share a name and stay distinct by ID.
 *
 * values: { destination, subject, style, genre, date, original, process, tags: { key: value } }
 */
export function renderFileName(template, values, { originalName, mimeType } = {}) {
  const base = renderBase(template, values) || renderBase("{subject}", values) || "image";
  const extension = extensionOf(originalName) || MIME_EXTENSIONS[mimeType] || "";
  return `${base}${extension}`;
}
