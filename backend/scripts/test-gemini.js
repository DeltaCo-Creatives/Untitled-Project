import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { classifyImage } from "../src/services/gemini.service.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IMAGE = path.join(__dirname, "..", "test-assets", "sample.jpg");

// A 1x1 pixel PNG, used only as a fallback so this script runs out of the
// box. Drop a real photo at backend/test-assets/sample.jpg for a
// meaningful classification result.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function loadImage(imagePath) {
  try {
    const buffer = await readFile(imagePath);
    const mimeType = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return { buffer, mimeType };
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    console.warn(`No image found at ${imagePath}.`);
    console.warn("Using a 1x1 placeholder pixel instead — drop a real photo at backend/test-assets/sample.jpg for a meaningful result.");
    return { buffer: Buffer.from(PLACEHOLDER_PNG_BASE64, "base64"), mimeType: "image/png" };
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Copy backend/.env.example to backend/.env and fill it in.");
  }

  const imagePath = process.argv[2] || DEFAULT_IMAGE;
  const { buffer, mimeType } = await loadImage(imagePath);

  console.log(`Sending ${buffer.length} bytes to Gemini (${mimeType})...`);
  const result = await classifyImage(buffer, mimeType);
  console.log("Gemini response:", result);
}

main().catch((err) => {
  console.error("Gemini test failed:", err.message || err);
  process.exit(1);
});
