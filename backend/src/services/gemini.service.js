import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

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
 */
export async function classifyImage(buffer, mimeType = "image/jpeg") {
  const response = await ai.models.generateContent({
    model: MODEL,
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
