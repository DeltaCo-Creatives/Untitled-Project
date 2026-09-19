import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config/env.js";
import { classifyImage, classifyDocument } from "../src/services/gemini.service.js";
import { prepareDocumentBuffer } from "../src/services/document.service.js";
import { renderFileName } from "../src/utils/filename.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IMAGE = path.join(__dirname, "..", "test-assets", "sample.jpg");

// A 1x1 pixel PNG, used only as a fallback so this script runs out of the
// box. Drop a real photo at backend/test-assets/sample.jpg for a
// meaningful classification result.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const MIME_BY_EXTENSION = { ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic" };

const DOCUMENT_MIME_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
};

// Without --process: a migrated single-folder process (only Unsorted, legacy naming), one
// default template per kind (documents default to the same template the process editor does).
const LEGACY_PROCESS_BY_KIND = {
  image: {
    name: "My first process",
    rename_template: "{genre}_{subject}",
    instructions: "",
    tag_fields: [],
    timezone: "UTC",
    destinations: [{ id: "unsorted", name: "Unsorted", description: "", is_fallback: true }],
  },
  document: {
    name: "My first process",
    rename_template: "{type}_{organization}_{topic}",
    instructions: "",
    tag_fields: [],
    timezone: "UTC",
    destinations: [{ id: "unsorted", name: "Unsorted", description: "", is_fallback: true }],
  },
};

async function loadImage(imagePath) {
  try {
    const buffer = await readFile(imagePath);
    const mimeType = MIME_BY_EXTENSION[path.extname(imagePath).toLowerCase()] ?? "image/jpeg";
    return { buffer, mimeType, name: path.basename(imagePath) };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    console.warn(`No image found at ${imagePath}.`);
    console.warn(
      "Using a 1x1 placeholder pixel instead — drop a real photo at backend/test-assets/sample.jpg for a meaningful result.",
    );
    return {
      buffer: Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"),
      mimeType: "image/png",
      name: "placeholder.png",
    };
  }
}

/**
 * --process <file.json> uses the API's camelCase process shape:
 * { name, renameTemplate, instructions, timezone, tagFields: [{ key, label, description }],
 *   destinations: [{ name, description, isFallback }] }
 */
async function loadProcess(args, kind) {
  const flag = args.indexOf("--process");
  if (flag === -1) return LEGACY_PROCESS_BY_KIND[kind];

  const spec = JSON.parse(await readFile(args[flag + 1], "utf8"));
  return {
    name: spec.name ?? "Test process",
    rename_template: spec.renameTemplate ?? LEGACY_PROCESS_BY_KIND[kind].rename_template,
    instructions: spec.instructions ?? "",
    tag_fields: spec.tagFields ?? [],
    timezone: spec.timezone ?? "UTC",
    destinations: (spec.destinations ?? []).map((destination, index) => ({
      id: `destination-${index}`,
      name: destination.name,
      description: destination.description ?? "",
      is_fallback: destination.isFallback === true,
    })),
  };
}

async function runImage(imagePath, workProcess) {
  const { buffer, mimeType, name } = await loadImage(imagePath);

  console.log(`Sending ${buffer.length} bytes to ${env.gemini.model} (${mimeType})...`);
  const result = await classifyImage(buffer, mimeType, workProcess);

  console.log("Tags:", { subject: result.subject, style: result.style, genre: result.genre });
  if (result.fields.length > 0) console.log("Custom fields:", result.fields);
  console.log(`Destination: ${result.destination?.name ?? "(none)"}${result.matched ? "" : " (fallback)"}`);
  console.log(
    "Would rename to:",
    renderFileName(
      workProcess.rename_template,
      {
        destination: result.destination?.name,
        subject: result.subject,
        style: result.style,
        genre: result.genre,
        date: new Date().toISOString().slice(0, 10),
        original: name,
        process: workProcess.name,
        tags: Object.fromEntries(result.fields.map((field) => [field.key, field.value])),
      },
      { originalName: name, mimeType },
    ),
  );
}

/** Same shape as runImage, but for a local document file — no Drive, so document.service.js's
 * prepareDocumentBuffer (PDF/docx/text only, no Google-native export) does the preparation. */
async function runDocument(documentPath, workProcess) {
  const mimeType = DOCUMENT_MIME_BY_EXTENSION[path.extname(documentPath).toLowerCase()];
  const name = path.basename(documentPath);
  const buffer = await readFile(documentPath);

  console.log(`Reading ${buffer.length} bytes from ${name} (${mimeType})...`);
  const content = await prepareDocumentBuffer(buffer, mimeType);
  console.log(
    content.mode === "pdf"
      ? `PDF has ${content.pages} page(s); sending the first ${content.pagesRead}.`
      : `Extracted ${content.text.length} chars of text${content.truncated ? " (truncated)" : ""}.`,
  );

  console.log(`Sending to ${env.gemini.model}...`);
  const result = await classifyDocument(content, workProcess);

  console.log("Fields:", {
    type: result.type,
    topic: result.topic,
    organization: result.organization,
    documentDate: result.documentDate,
  });
  if (result.fields.length > 0) console.log("Custom fields:", result.fields);
  console.log(`Destination: ${result.destination?.name ?? "(none)"}${result.matched ? "" : " (fallback)"}`);
  console.log(
    "Would rename to:",
    renderFileName(
      workProcess.rename_template,
      {
        destination: result.destination?.name,
        type: result.type,
        topic: result.topic,
        organization: result.organization,
        docdate: result.documentDate,
        date: new Date().toISOString().slice(0, 10),
        original: name,
        process: workProcess.name,
        tags: Object.fromEntries(result.fields.map((field) => [field.key, field.value])),
      },
      // `kind` isn't consumed yet if BE-PROC's filename.js change hasn't landed — renderFileName
      // ignores unknown options, so this is forward-compatible either way (see the report).
      { originalName: name, mimeType, kind: "document" },
    ),
  );
}

async function main() {
  if (!env.gemini.apiKey) {
    throw new Error("GEMINI_API_KEY is not set in backend/.env (see backend/README.md).");
  }

  const args = process.argv.slice(2);
  const flag = args.indexOf("--process");
  const positional = args.filter((_, index) => flag === -1 || (index !== flag && index !== flag + 1));
  const targetPath = positional[0] || DEFAULT_IMAGE;
  const kind = DOCUMENT_MIME_BY_EXTENSION[path.extname(targetPath).toLowerCase()] ? "document" : "image";

  const workProcess = await loadProcess(args, kind);
  if (kind === "document") await runDocument(targetPath, workProcess);
  else await runImage(targetPath, workProcess);
}

main().catch((err) => {
  console.error("Gemini test failed:", err.message || err);
  process.exit(1);
});
