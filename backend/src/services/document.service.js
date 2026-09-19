import { PDFDocument } from "pdf-lib";
import { extractRawText } from "mammoth";
import { env } from "../config/env.js";
import { FILE_LIMITS } from "../config/plans.js";
import { exportFileText, getFileBuffer } from "./drive.service.js";

const GOOGLE_NATIVE_PREFIX = "application/vnd.google-apps.";
const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown", "text/x-markdown", "text/csv"]);
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const GOOGLE_SLIDES_MIME = "application/vnd.google-apps.presentation";
const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";

const documentMaxBytes = FILE_LIMITS.documentMaxMb * 1024 * 1024;
// A .docx is a zip; its parts are inflated in memory, so a small file could expand without bound (a zip bomb).
// Real Word files, images included, stay far below this once unpacked.
const DOCX_MAX_UNPACKED_BYTES = 100 * 1024 * 1024;
const megabytes = (bytes) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

/** True for a Google Doc/Sheet/Slides file edited within the grace window: someone may still be writing it. */
export function isStillBeingEdited(file, now = Date.now()) {
  if (!String(file?.mimeType ?? "").startsWith(GOOGLE_NATIVE_PREFIX)) return false;
  const modified = Date.parse(file?.modifiedTime ?? "");
  if (Number.isNaN(modified)) return false;
  return now - modified < FILE_LIMITS.editingGraceMinutes * 60_000;
}

const WHITESPACE = /\s/;

/** Cuts text to the char cap, preferring a nearby whitespace boundary over a mid-word cut. */
function capText(text) {
  if (text.length <= FILE_LIMITS.textChars) return { text, truncated: false };

  const hardCut = text.slice(0, FILE_LIMITS.textChars);
  let boundary = hardCut.length;
  for (let i = hardCut.length - 1; i >= 0 && i > hardCut.length - 200; i -= 1) {
    if (WHITESPACE.test(hardCut[i])) {
      boundary = i;
      break;
    }
  }
  return { text: hardCut.slice(0, boundary).trimEnd(), truncated: true };
}

function requireReadableText(text) {
  if (!text.trim()) throw new Error("This document has no readable text.");
}

/** UTF-8 decode that never throws on malformed bytes (Buffer#toString replaces them), with a leading BOM stripped. */
function decodeText(buffer) {
  const text = buffer.toString("utf8");
  return text.startsWith("﻿") ? text.slice(1) : text;
}

async function preparePdf(buffer) {
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(buffer);
  } catch (err) {
    // pdf-lib's EncryptedPDFError doesn't survive `instanceof` (its ES5-style Error subclass
    // loses its prototype when the native Error constructor is called via `.call()`), so this
    // matches on the message it always throws instead.
    if (/is encrypted/i.test(err?.message ?? "")) {
      throw new Error("This PDF is password protected. Remove the password and try again.");
    }
    throw new Error("DriveTag couldn't open this PDF. It may be corrupted.");
  }

  const pages = pdfDoc.getPageCount();
  const pagesRead = Math.min(pages, FILE_LIMITS.pagesRead);

  let data = buffer;
  if (pages > FILE_LIMITS.pagesRead) {
    const trimmed = await PDFDocument.create();
    const copied = await trimmed.copyPages(pdfDoc, Array.from({ length: pagesRead }, (_, i) => i));
    for (const page of copied) trimmed.addPage(page);
    data = Buffer.from(await trimmed.save());
  }

  if (data.length > env.gemini.maxImageBytes) {
    throw new Error(`This PDF's first ${pagesRead} pages are ${megabytes(data.length)}, over what DriveTag can send to the AI.`);
  }

  return { mode: "pdf", data, pages, pagesRead };
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;

/**
 * Sum of the uncompressed sizes a zip's central directory declares, read without inflating anything.
 * Returns Infinity for anything unreadable or ZIP64-sized, so callers treat it as too big.
 */
export function declaredUnzippedBytes(buffer) {
  // The end-of-central-directory record is 22 bytes plus a comment of up to 65,535 bytes.
  const searchFrom = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= searchFrom; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return Infinity;

  const entries = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE) return Infinity;
    const size = buffer.readUInt32LE(offset + 24);
    if (size === 0xffffffff) return Infinity; // ZIP64: no legitimate Word file needs it
    total += size;
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  return total;
}

async function prepareDocx(buffer) {
  if (declaredUnzippedBytes(buffer) > DOCX_MAX_UNPACKED_BYTES) {
    throw new Error("DriveTag couldn't open this Word file safely. It may be corrupted, or it unpacks to far more than a normal document.");
  }
  let value;
  try {
    ({ value } = await extractRawText({ buffer }));
  } catch {
    // mammoth's own errors are about zip internals; the activity feed needs something a person can act on.
    throw new Error("DriveTag couldn't open this Word file. It may be corrupted or not really a .docx.");
  }
  const { text, truncated } = capText(value);
  requireReadableText(text);
  return { mode: "text", text, truncated };
}

async function prepareTextFile(buffer) {
  const { text, truncated } = capText(decodeText(buffer));
  requireReadableText(text);
  return { mode: "text", text, truncated };
}

async function prepareGoogleNative(userId, file) {
  const exportMimeType = file.mimeType === GOOGLE_SHEET_MIME ? "text/csv" : "text/plain";
  const exported = await exportFileText(userId, file.id, exportMimeType);
  const { text, truncated } = capText(exported);
  requireReadableText(text);
  return { mode: "text", text, truncated };
}

/**
 * Reads already-downloaded bytes into the same shape prepareDocument returns — PDF and
 * text types only (no Drive, no Google-native export). Shared by prepareDocument (after
 * getFileBuffer) and scripts/test-gemini.js, which has a local file instead of a Drive one.
 */
export async function prepareDocumentBuffer(buffer, mimeType) {
  if (mimeType === PDF_MIME) return preparePdf(buffer);
  if (mimeType === DOCX_MIME) return prepareDocx(buffer);
  if (TEXT_MIME_TYPES.has(mimeType)) return prepareTextFile(buffer);

  throw new Error("DriveTag doesn't support this document type.");
}

/**
 * Reads a document into memory for the AI: { mode: 'pdf', data, pages, pagesRead } for a
 * PDF (sent inline), or { mode: 'text', text, truncated } for everything else. Bytes and
 * extracted text exist only for this call — never written to disk (Zero-Retention).
 */
export async function prepareDocument(userId, file) {
  const isGoogleNative = String(file?.mimeType ?? "").startsWith(GOOGLE_NATIVE_PREFIX);

  // Google-native files have no `size`; Drive's own export limit (~10MB) is the backstop.
  if (!isGoogleNative && file.size !== undefined && Number(file.size) > documentMaxBytes) {
    throw new Error(`This document is ${megabytes(Number(file.size))}, over the ${FILE_LIMITS.documentMaxMb} MB limit DriveTag can process.`);
  }

  if (file.mimeType === GOOGLE_DOC_MIME || file.mimeType === GOOGLE_SLIDES_MIME || file.mimeType === GOOGLE_SHEET_MIME) {
    return prepareGoogleNative(userId, file);
  }

  const buffer = await getFileBuffer(userId, file.id);
  return prepareDocumentBuffer(buffer, file.mimeType);
}
