import path from "node:path";

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

function slugify(value, fallback) {
  const slug = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop combining accents so "über" → "uber", not "u-ber"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

/**
 * Builds the `genre_subject.ext` name the file is renamed to. Drive allows
 * duplicate names in a folder, so two similar images can land on the same
 * name — they stay distinct files by ID.
 */
export function buildFileName(tags, originalName, mimeType) {
  const genre = slugify(tags.genre, "untagged");
  const subject = slugify(tags.subject, "asset");
  const extension =
    path.extname(originalName || "").toLowerCase() || MIME_EXTENSIONS[mimeType] || "";
  return `${genre}_${subject}${extension}`;
}
