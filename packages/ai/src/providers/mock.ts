import { createHash } from "node:crypto";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerator,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerator,
} from "../types.js";

/**
 * Zero-cost, zero-network provider used when no API key is configured, or
 * when running under DRY_RUN. Output is deterministic (hash of the prompt)
 * so pipeline tests are reproducible, not random noise.
 */
export class MockTextGenerator implements TextGenerator {
  readonly provider = "mock" as const;

  async generate(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const hash = createHash("sha256").update(req.userPrompt).digest("hex").slice(0, 8);
    const text = req.jsonMode
      ? JSON.stringify({ mock: true, seed: hash, prompt_excerpt: req.userPrompt.slice(0, 80) })
      : `[MOCK OUTPUT ${hash}] ${req.userPrompt.slice(0, 200)}`;
    return {
      text,
      provider: "mock",
      model: "mock-text",
      inputTokens: Math.ceil(req.userPrompt.length / 4),
      outputTokens: Math.ceil(text.length / 4),
      costUsd: 0,
    };
  }
}

export class MockImageGenerator implements ImageGenerator {
  readonly provider = "mock" as const;

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const count = req.count ?? 1;
    const width = req.width ?? 1024;
    const height = req.height ?? 1024;
    const images = Array.from({ length: count }, (_, i) => buildPlaceholderPng(width, height, `${req.prompt}#${i}`));
    return { images, provider: "mock", model: "mock-image", costUsd: 0 };
  }
}

/** Minimal valid 1x1 PNG repeated as a stand-in — real rendering happens via packages/product-generator (satori/resvg), not the AI image provider, for anything text-critical. */
function buildPlaceholderPng(_width: number, _height: number, seed: string): Buffer {
  const hash = createHash("sha256").update(seed).digest();
  // A valid, minimal 1x1 transparent PNG. The hash is embedded as a tEXt-like
  // comment via filename metadata upstream, not inside these fixed bytes.
  const PNG_1X1_TRANSPARENT = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  return Buffer.concat([PNG_1X1_TRANSPARENT, hash.subarray(0, 0)]); // hash kept for future debugging hooks
}
