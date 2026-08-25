import { loadEnv } from "@etsymagazam/core";
import { GeminiImageGenerator, GeminiTextGenerator } from "./providers/gemini.js";
import { MockImageGenerator, MockTextGenerator } from "./providers/mock.js";
import { OpenAiImageGenerator, OpenAiTextGenerator } from "./providers/openai.js";
import type { ImageGenerator, TextGenerator } from "./types.js";

/**
 * Builds the text/image generators to use, based on env config
 * (AI_TEXT_PROVIDER/AI_IMAGE_PROVIDER). Falls back to the mock provider
 * automatically if the selected provider has no API key configured, so
 * DRY_RUN and local dev never require real credentials.
 */
export function createAiRouter(): { text: TextGenerator; image: ImageGenerator } {
  const env = loadEnv();

  const text: TextGenerator =
    env.AI_TEXT_PROVIDER === "openai" && env.OPENAI_API_KEY
      ? new OpenAiTextGenerator({
          apiKey: env.OPENAI_API_KEY,
          cheapModel: env.AI_TEXT_MODEL_CHEAP,
          premiumModel: env.AI_TEXT_MODEL_PREMIUM,
          imageModel: env.AI_IMAGE_MODEL,
        })
      : env.AI_TEXT_PROVIDER === "gemini" && env.GEMINI_API_KEY
        ? new GeminiTextGenerator({
            apiKey: env.GEMINI_API_KEY,
            textModel: env.GEMINI_TEXT_MODEL,
            imageModel: env.GEMINI_IMAGE_MODEL,
          })
        : new MockTextGenerator();

  const image: ImageGenerator =
    env.AI_IMAGE_PROVIDER === "openai" && env.OPENAI_API_KEY
      ? new OpenAiImageGenerator({
          apiKey: env.OPENAI_API_KEY,
          cheapModel: env.AI_TEXT_MODEL_CHEAP,
          premiumModel: env.AI_TEXT_MODEL_PREMIUM,
          imageModel: env.AI_IMAGE_MODEL,
        })
      : env.AI_IMAGE_PROVIDER === "gemini" && env.GEMINI_API_KEY
        ? new GeminiImageGenerator({
            apiKey: env.GEMINI_API_KEY,
            textModel: env.GEMINI_TEXT_MODEL,
            imageModel: env.GEMINI_IMAGE_MODEL,
          })
        : new MockImageGenerator();

  return { text, image };
}
