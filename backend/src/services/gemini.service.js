import { GoogleGenAI, Type } from "@google/genai";
import { env } from "../config/env.js";

const ai = new GoogleGenAI({ apiKey: env.gemini.apiKey });

const SYSTEM_PROMPT = `You are an image-tagging engine for a digital asset management tool.
Classify the given image and respond with STRICT JSON only, matching this shape:
{"genre": "...", "subject": "...", "style": "..."}

- genre: the broad category (e.g. "portrait", "landscape", "product", "event", "abstract")
- subject: the primary subject in a few words (e.g. "woman-smiling", "mountain-sunset")
- style: the visual/photographic style (e.g. "candid", "studio", "cinematic", "minimalist")

Use lowercase, hyphen-separated values with no spaces. Do not include any text outside the JSON object.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    genre: { type: Type.STRING },
    subject: { type: Type.STRING },
    style: { type: Type.STRING },
  },
  required: ["genre", "subject", "style"],
};

/**
 * Sends an image buffer to Gemini Flash and returns the parsed
 * {genre, subject, style} classification used to rename/move the file.
 *
 * Uses inline image data rather than the Files API so the bytes exist only
 * for the duration of the request (Zero-Retention).
 */
export async function classifyImage(buffer, mimeType = "image/jpeg") {
  if (buffer.length > env.gemini.maxImageBytes) {
    throw new Error(
      `Image is ${buffer.length} bytes, over the ${env.gemini.maxImageBytes} byte inline limit`,
    );
  }

  const response = await ai.models.generateContent({
    model: env.gemini.model,
    contents: [
      {
        role: "user",
        parts: [
          { text: SYSTEM_PROMPT },
          { inlineData: { mimeType, data: buffer.toString("base64") } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  return JSON.parse(response.text);
}
