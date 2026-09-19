// Run from backend/: node --test --experimental-test-module-mocks test/document.test.js
//
// Covers document.service.js's prepareDocument/isStillBeingEdited. drive.service.js
// (getFileBuffer, exportFileText) and config/env.js are mocked, so this never touches
// Drive or reads backend/.env. pdf-lib itself is real except in the encrypted-PDF test, which
// patches PDFDocument.load for that one test only (node:test's per-test t.mock auto-restores
// it afterwards) to throw a real pdf-lib EncryptedPDFError -- pdf-lib can't produce an actually
// encrypted PDF buffer to load, so this is the only way to exercise document.service.js's real
// message-matching branch (EncryptedPDFError fails `instanceof`, see the comment in preparePdf)
// against pdf-lib's real, current error message.
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, EncryptedPDFError } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCX_FIXTURE = path.join(__dirname, "fixtures", "sample.docx");

mock.module("../src/config/env.js", {
  namedExports: { env: { gemini: { maxImageBytes: 18 * 1024 * 1024 } } },
});

let bufferForFile = new Map(); // fileId -> Buffer
let exportForFile = new Map(); // fileId -> string | Error
const exportCalls = [];

const getFileBuffer = mock.fn(async (userId, fileId) => {
  const buffer = bufferForFile.get(fileId);
  if (!buffer) throw new Error(`test setup: no buffer for ${fileId}`);
  return buffer;
});
const exportFileText = mock.fn(async (userId, fileId, exportMimeType) => {
  exportCalls.push({ userId, fileId, exportMimeType });
  const value = exportForFile.get(fileId);
  if (value instanceof Error) throw value;
  return value ?? "";
});

mock.module("../src/services/drive.service.js", { namedExports: { getFileBuffer, exportFileText } });

const { prepareDocument, isStillBeingEdited, declaredUnzippedBytes } = await import("../src/services/document.service.js");
const { FILE_LIMITS } = await import("../src/config/plans.js");
const { readFile } = await import("node:fs/promises");

beforeEach(() => {
  bufferForFile = new Map();
  exportForFile = new Map();
  exportCalls.length = 0;
  getFileBuffer.mock.resetCalls();
  exportFileText.mock.resetCalls();
});

async function makePdf(pageCount, { withText = true } = {}) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const page = doc.addPage([200, 200]);
    if (withText) page.drawText(`page ${i + 1}`, { x: 10, y: 100 });
  }
  return Buffer.from(await doc.save());
}

// ---------------------------------------------------------------- PDFs

test("a PDF with pagesRead pages or fewer passes through with its original bytes unchanged", async () => {
  const buffer = await makePdf(3);
  bufferForFile.set("pdf-3", buffer);
  const file = { id: "pdf-3", mimeType: "application/pdf", size: String(buffer.length) };

  const result = await prepareDocument("user1", file);

  assert.equal(result.mode, "pdf");
  assert.equal(result.pages, 3);
  assert.equal(result.pagesRead, 3);
  assert.equal(Buffer.compare(result.data, buffer), 0, "bytes must be exactly the original, not re-saved");
});

test("an 8-page PDF is trimmed to exactly pagesRead (5) pages", async () => {
  const buffer = await makePdf(8);
  bufferForFile.set("pdf-8", buffer);
  const file = { id: "pdf-8", mimeType: "application/pdf", size: String(buffer.length) };

  const result = await prepareDocument("user1", file);

  assert.equal(result.mode, "pdf");
  assert.equal(result.pages, 8);
  assert.equal(result.pagesRead, FILE_LIMITS.pagesRead);
  const trimmed = await PDFDocument.load(result.data);
  assert.equal(trimmed.getPageCount(), FILE_LIMITS.pagesRead);
});

test("an encrypted PDF fails with a readable, non-technical error", async (t) => {
  t.mock.method(PDFDocument, "load", async () => {
    throw new EncryptedPDFError();
  });
  bufferForFile.set("pdf-enc", Buffer.from("not a real pdf, load is mocked"));
  const file = { id: "pdf-enc", mimeType: "application/pdf", size: "100" };

  await assert.rejects(() => prepareDocument("user1", file), /password protected/i);
});

// ---------------------------------------------------------------- docx

test("a .docx file is read into plain text", async () => {
  const buffer = await readFile(DOCX_FIXTURE);
  bufferForFile.set("docx-1", buffer);
  const file = {
    id: "docx-1",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: String(buffer.length),
  };

  const result = await prepareDocument("user1", file);

  assert.equal(result.mode, "text");
  assert.match(result.text, /DriveTag AI Consulting Agreement/);
  assert.equal(result.truncated, false);
});

// ---------------------------------------------------------------- plain text

test("text is capped at FILE_LIMITS.textChars, cutting near a whitespace boundary, and reports truncated", async () => {
  const words = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(" "); // well over 12,000 chars
  bufferForFile.set("txt-1", Buffer.from(words, "utf8"));
  const file = { id: "txt-1", mimeType: "text/plain", size: String(words.length) };

  const result = await prepareDocument("user1", file);

  assert.equal(result.truncated, true);
  assert.ok(result.text.length <= FILE_LIMITS.textChars, "must not exceed the cap");
  assert.ok(result.text.length > FILE_LIMITS.textChars - 200, "should cut near the limit, not far before it");
  assert.ok(!/\s$/.test(result.text), "should not end on whitespace after trimming");
  assert.ok(!result.text.includes("wordZZZ"), "sanity: text was actually cut, not passed through whole");
});

test("a leading UTF-8 BOM is stripped", async () => {
  const buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Hello from a BOM'd file", "utf8")]);
  bufferForFile.set("txt-bom", buffer);
  const file = { id: "txt-bom", mimeType: "text/plain", size: String(buffer.length) };

  const result = await prepareDocument("user1", file);

  assert.equal(result.text, "Hello from a BOM'd file");
  assert.ok(!result.text.startsWith("﻿"));
});

test("malformed UTF-8 bytes are replaced, not thrown on", async () => {
  const buffer = Buffer.from([0xff, 0xfe, 0x41, 0x42]); // invalid lead bytes followed by "AB"
  bufferForFile.set("txt-bad", buffer);
  const file = { id: "txt-bad", mimeType: "text/plain", size: String(buffer.length) };

  const result = await prepareDocument("user1", file);

  assert.equal(result.mode, "text");
  assert.ok(result.text.includes("AB"));
});

test("text that is empty after extraction fails with the no-readable-text message", async () => {
  bufferForFile.set("txt-empty", Buffer.from("   \n\t  ", "utf8"));
  const file = { id: "txt-empty", mimeType: "text/plain", size: "10" };

  await assert.rejects(() => prepareDocument("user1", file), /no readable text/i);
});

// ---------------------------------------------------------------- Google-native export

test("a Google Doc is read via exportFileText as text/plain", async () => {
  exportForFile.set("gdoc-1", "Exported doc body.");
  const file = { id: "gdoc-1", mimeType: "application/vnd.google-apps.document" };

  const result = await prepareDocument("user1", file);

  assert.equal(result.text, "Exported doc body.");
  assert.equal(getFileBuffer.mock.callCount(), 0, "Google-native files have no bytes to download");
  assert.deepEqual(exportCalls, [{ userId: "user1", fileId: "gdoc-1", exportMimeType: "text/plain" }]);
});

test("a Google Slides deck is read via exportFileText as text/plain", async () => {
  exportForFile.set("gslides-1", "Slide one. Slide two.");
  const file = { id: "gslides-1", mimeType: "application/vnd.google-apps.presentation" };

  const result = await prepareDocument("user1", file);

  assert.equal(result.text, "Slide one. Slide two.");
  assert.deepEqual(exportCalls, [{ userId: "user1", fileId: "gslides-1", exportMimeType: "text/plain" }]);
});

test("a Google Sheet is read via exportFileText as text/csv", async () => {
  exportForFile.set("gsheet-1", "a,b,c\n1,2,3");
  const file = { id: "gsheet-1", mimeType: "application/vnd.google-apps.spreadsheet" };

  const result = await prepareDocument("user1", file);

  assert.equal(result.text, "a,b,c\n1,2,3");
  assert.deepEqual(exportCalls, [{ userId: "user1", fileId: "gsheet-1", exportMimeType: "text/csv" }]);
});

// ---------------------------------------------------------------- size limit

test("a file over the 20MB limit is rejected before any download", async () => {
  const oversizeBytes = (FILE_LIMITS.documentMaxMb + 1) * 1024 * 1024;
  const file = { id: "big-1", mimeType: "application/pdf", size: String(oversizeBytes) };

  await assert.rejects(() => prepareDocument("user1", file), /20 MB/);
  assert.equal(getFileBuffer.mock.callCount(), 0);
});

test("a Google-native file (no size field) is never rejected by the size check", async () => {
  exportForFile.set("gdoc-nosize", "short body");
  const file = { id: "gdoc-nosize", mimeType: "application/vnd.google-apps.document" };

  const result = await prepareDocument("user1", file);
  assert.equal(result.text, "short body");
});

// ---------------------------------------------------------------- isStillBeingEdited

test("isStillBeingEdited: true for a Google file modified inside the grace window", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  const file = { mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-09-19T11:55:00Z" }; // 5 min ago
  assert.equal(isStillBeingEdited(file, now), true);
});

test("isStillBeingEdited: false once outside the grace window", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  const file = { mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-09-19T11:49:00Z" }; // 11 min ago
  assert.equal(isStillBeingEdited(file, now), false);
});

test("isStillBeingEdited: always false for a non-Google-native file", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  const file = { mimeType: "application/pdf", modifiedTime: "2026-09-19T11:59:59Z" };
  assert.equal(isStillBeingEdited(file, now), false);
});

test("isStillBeingEdited: false when modifiedTime is missing or unparsable", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  assert.equal(isStillBeingEdited({ mimeType: "application/vnd.google-apps.document" }, now), false);
  assert.equal(isStillBeingEdited({ mimeType: "application/vnd.google-apps.document", modifiedTime: "not-a-date" }, now), false);
});

// A zip holding only a central directory + end record, declaring one entry of `size` bytes. That's all
// declaredUnzippedBytes reads, so a zip bomb can be simulated without building one.
function zipDeclaring(size) {
  const name = Buffer.from("word/document.xml");
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(0, 16);
  return Buffer.concat([central, end]);
}

test("declaredUnzippedBytes reads a real .docx's size, and treats unreadable or ZIP64 zips as too big", async () => {
  const docx = await readFile(DOCX_FIXTURE);
  const size = declaredUnzippedBytes(docx);
  assert.ok(size > 0 && size < 100_000, `expected a small positive size, got ${size}`);
  assert.equal(declaredUnzippedBytes(Buffer.from("definitely not a zip file at all")), Infinity);
  assert.equal(declaredUnzippedBytes(zipDeclaring(0xffffffff)), Infinity);
  assert.equal(declaredUnzippedBytes(zipDeclaring(1234)), 1234);
});

test("a .docx that would unpack to more than 100 MB is refused before it's unzipped (zip-bomb guard)", async () => {
  bufferForFile.set("bomb", zipDeclaring(200 * 1024 * 1024));
  await assert.rejects(
    prepareDocument("u1", {
      id: "bomb",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: "500",
    }),
    /couldn't open this Word file safely/,
  );
});

test("a corrupted .docx fails with a readable message, not the zip library's internals", async () => {
  // A plausible-looking zip (small declared size) whose contents mammoth can't read as a document.
  bufferForFile.set("corrupt", zipDeclaring(10));
  await assert.rejects(
    prepareDocument("u1", {
      id: "corrupt",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: "100",
    }),
    (err) => {
      assert.match(err.message, /couldn't open this Word file/);
      assert.doesNotMatch(err.message, /central directory|zip|jszip/i);
      return true;
    },
  );
});
