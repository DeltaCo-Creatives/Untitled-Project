// Keep in sync with frontend/src/lib/filename.ts, which renders the editor's
// live preview. Both are checked against tests/filename-vectors.json.
//
// Deliberately no node: imports, so the two files stay line-for-line comparable.

const IMAGE_MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/tiff": ".tif",
};

const DOCUMENT_MIME_EXTENSIONS = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/x-markdown": ".md",
  "text/csv": ".csv",
  // Google Docs, Sheets and Slides have no file extension in Drive.
  "application/vnd.google-apps.document": "",
  "application/vnd.google-apps.spreadsheet": "",
  "application/vnd.google-apps.presentation": "",
};

const MIME_EXTENSIONS = { ...IMAGE_MIME_EXTENSIONS, ...DOCUMENT_MIME_EXTENSIONS };

/** The files each kind of work process sorts. Anything else in its Raw folder is left alone. */
export const MIME_TYPES_BY_KIND = {
  image: Object.keys(IMAGE_MIME_EXTENSIONS),
  document: Object.keys(DOCUMENT_MIME_EXTENSIONS),
};

/** Image MIME types; kept for callers that predate document processes. */
export const SUPPORTED_MIME_TYPES = MIME_TYPES_BY_KIND.image;

/** Tokens a rename template may use per process kind, besides {tag:<key>} for custom tag fields. */
export const TEMPLATE_TOKENS_BY_KIND = {
  image: ["destination", "subject", "style", "genre", "date", "original", "process"],
  document: ["destination", "type", "topic", "organization", "docdate", "date", "original", "process"],
};

/** Image tokens; kept for callers that predate document processes. */
export const TEMPLATE_TOKENS = TEMPLATE_TOKENS_BY_KIND.image;

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

// The other kind's tokens named in a cross-kind hint, e.g. "document processes use {type}, {topic} or {organization}."
// A short, descriptive subset rather than every token of that kind (skips the ones shared with the other kind, like {date}).
const KIND_HINT_TOKENS = {
  image: ["subject", "style", "genre"],
  document: ["type", "topic", "organization"],
};
const KIND_ARTICLE = { image: "an image", document: "a document" };

/** The token a template falls back to, and what to call the file, when it renders empty. */
const FALLBACK_TOKEN_BY_KIND = { image: "subject", document: "topic" };
const FALLBACK_NAME_BY_KIND = { image: "image", document: "document" };

function otherKind(kind) {
  return kind === "document" ? "image" : "document";
}

function tokenListMessage(tokens) {
  const bracketed = tokens.map((token) => `{${token}}`);
  return bracketed.length <= 1 ? bracketed.join("") : `${bracketed.slice(0, -1).join(", ")} or ${bracketed[bracketed.length - 1]}`;
}

/** Human-readable problems with a template; an empty array means it's valid. */
export function validateTemplate(template, tagKeys = [], kind = "image") {
  const errors = [];
  const text = String(template ?? "");
  if (!text.trim()) return ["The naming template can't be empty."];

  const tokens = TEMPLATE_TOKENS_BY_KIND[kind] ?? TEMPLATE_TOKENS_BY_KIND.image;
  const other = otherKind(kind);

  let tokenCount = 0;
  for (const part of parseTemplate(text)) {
    if (part.type === "error") {
      errors.push(`"${part.value}" has an unmatched brace.`);
    } else if (part.type === "literal") {
      if (!LITERAL_ALLOWED.test(part.value)) {
        errors.push(`"${part.value}" can only use letters, numbers, spaces and - _ . ( ).`);
      }
    } else {
      tokenCount += 1;
      const tagMatch = /^tag:(.+)$/.exec(part.value);
      if (tagMatch) {
        if (!tagKeys.includes(tagMatch[1])) errors.push(`{${part.value}} doesn't match any of this process's tag fields.`);
      } else if (!tokens.includes(part.value)) {
        if (TEMPLATE_TOKENS_BY_KIND[other].includes(part.value)) {
          errors.push(`{${part.value}} is ${KIND_ARTICLE[other]} token; ${kind} processes use ${tokenListMessage(KIND_HINT_TOKENS[kind])}.`);
        } else {
          errors.push(`{${part.value}} isn't a naming token.`);
        }
      }
    }
  }
  if (tokenCount === 0) {
    errors.push(`Add at least one token, like {${FALLBACK_TOKEN_BY_KIND[kind]}}, so files don't all get the same name.`);
  }
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
 * in a folder, so similar files can share a name and stay distinct by ID.
 * Google-native files (Docs/Sheets/Slides) have no extension in Drive and
 * MIME_EXTENSIONS maps them to "", so they keep none here either.
 *
 * values (image): { destination, subject, style, genre, date, original, process, tags: { key: value } }
 * values (document): { destination, type, topic, organization, docdate, date, original, process, tags }
 */
export function renderFileName(template, values, { originalName, mimeType, kind = "image" } = {}) {
  const fallbackToken = FALLBACK_TOKEN_BY_KIND[kind] ?? FALLBACK_TOKEN_BY_KIND.image;
  const fallbackName = FALLBACK_NAME_BY_KIND[kind] ?? FALLBACK_NAME_BY_KIND.image;
  const base = renderBase(template, values) || renderBase(`{${fallbackToken}}`, values) || fallbackName;
  const extension = extensionOf(originalName) || MIME_EXTENSIONS[mimeType] || "";
  return `${base}${extension}`;
}
