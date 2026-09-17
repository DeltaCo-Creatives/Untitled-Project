import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config/env.js";
import { classifyImage } from "../src/services/gemini.service.js";
import { renderFileName } from "../src/utils/filename.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IMAGE = path.join(__dirname, "..", "test-assets", "sample.jpg");

// A 1x1 pixel PNG, used only as a fallback so this script runs out of the
// box. Drop a real photo at backend/test-assets/sample.jpg for a
// meaningful classification result.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const MIME_BY_EXTENSION = { ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".heic": "image/heic" };

// Without --process: a migrated single-folder process (only Unsorted, legacy naming).
const LEGACY_PROCESS = {
  name: "My first process",
  rename_template: "{genre}_{subject}",
  instructions: "",
  tag_fields: [],
  timezone: "UTC",
  destinations: [{ id: "unsorted", name: "Unsorted", description: "", is_fallback: true }],
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
async function loadProcess(args) {
  const flag = args.indexOf("--process");
  if (flag === -1) return LEGACY_PROCESS;

  const spec = JSON.parse(await readFile(args[flag + 1], "utf8"));
  return {
    name: spec.name ?? "Test process",
    rename_template: spec.renameTemplate ?? "{destination}_{subject}",
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

async function main() {
  if (!env.gemini.apiKey) {
    throw new Error("GEMINI_API_KEY is not set in backend/.env (see tutorial.md).");
  }

  const args = process.argv.slice(2);
  const flag = args.indexOf("--process");
  const positional = args.filter((_, index) => flag === -1 || (index !== flag && index !== flag + 1));
  const imagePath = positional[0] || DEFAULT_IMAGE;

  const [{ buffer, mimeType, name }, workProcess] = await Promise.all([loadImage(imagePath), loadProcess(args)]);

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

main().catch((err) => {
  console.error("Gemini test failed:", err.message || err);
  process.exit(1);
});
