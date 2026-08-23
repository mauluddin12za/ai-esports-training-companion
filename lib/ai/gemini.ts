import axios from "axios";
import { safeJSONParse } from "../utils";

export const IS_DEBUG = process.env.NEXT_PUBLIC_IS_DEBUG === "true";

/**
 * MODELS & KEYS
 */
const MODELS = [
  process.env.NEXT_PUBLIC_GEMINI_MODEL,
  process.env.NEXT_PUBLIC_GEMINI_MODEL_FALLBACK_1,
  process.env.NEXT_PUBLIC_GEMINI_MODEL_FALLBACK_2,
].filter(Boolean) as string[];

if (MODELS.length === 0) {
  console.error("[Gemini Config Error] No models specified in environment variables!");
}

const API_KEYS = [
  process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY_2,
].filter(Boolean) as string[];

/**
 * MAIN FUNCTION
 */
export async function callGemini<T>(prompt: unknown): Promise<T> {
  for (let keyIndex = 0; keyIndex < API_KEYS.length; keyIndex++) {
    const apiKey = API_KEYS[keyIndex];

    for (const model of MODELS) {
      // Construct the absolute URL safely to prevent Axios colon-resolution issues
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      try {
        const response = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: JSON.stringify(prompt) }] }],
          },
          {
            headers: {
              "x-goog-api-key": apiKey,
              "Content-Type": "application/json",
            },
          }
        );

        const text =
          response.data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

        return safeJSONParse<T>(text);
      } catch (err: any) {
        const msg = (
          err?.response?.data?.error?.message ||
          err.message ||
          ""
        ).toLowerCase();

        if (IS_DEBUG) {
          console.error("[Gemini Error]", {
            model,
            keyIndex,
            msg,
          });
        }

        /**
         * CASE 1: QUOTA / TOKEN LIMIT → switch API KEY
         */
        if (
          msg.includes("quota") ||
          msg.includes("token") ||
          msg.includes("limit") ||
          msg.includes("resource exhausted")
        ) {
          break; // jump to next API key
        }

        /**
         * CASE 2: HIGH LOAD → switch MODEL
         */
        if (
          msg.includes("high demand") ||
          msg.includes("overloaded") ||
          msg.includes("try again")
        ) {
          await new Promise((r) => setTimeout(r, 500));
          continue; // try next model
        }

        /**
         * CASE 3: UNKNOWN ERROR → fail fast
         */
        throw err;
      }
    }
  }

  throw new Error("All Gemini models and API keys failed");
}
