import { estimateImageCost, estimateTextCost } from "../cost.js";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerator,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerator,
} from "../types.js";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiProviderOptions {
  apiKey: string;
  textModel: string;
  imageModel: string;
  fetchImpl?: typeof fetch;
}

export class GeminiTextGenerator implements TextGenerator {
  readonly provider = "gemini" as const;
  constructor(private readonly opts: GeminiProviderOptions) {}

  async generate(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const model = this.opts.textModel;

    const res = await fetchImpl(`${BASE_URL}/${model}:generateContent?key=${this.opts.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: req.userPrompt }] }],
        ...(req.systemPrompt ? { systemInstruction: { parts: [{ text: req.systemPrompt }] } } : {}),
        generationConfig: {
          temperature: req.temperature ?? 0.7,
          maxOutputTokens: req.maxOutputTokens ?? 1024,
          ...(req.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini generateContent failed: ${res.status} ${body}`);
    }

    const json = (await res.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = json.candidates[0]?.content.parts.map((p) => p.text).join("") ?? "";
    const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = json.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      text,
      provider: "gemini",
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateTextCost("gemini", model, inputTokens, outputTokens),
    };
  }
}

export class GeminiImageGenerator implements ImageGenerator {
  readonly provider = "gemini" as const;
  constructor(private readonly opts: GeminiProviderOptions) {}

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const model = this.opts.imageModel;
    const count = req.count ?? 1;

    const res = await fetchImpl(`${BASE_URL}/${model}:predict?key=${this.opts.apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: req.prompt }],
        parameters: { sampleCount: count },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini image predict failed: ${res.status} ${body}`);
    }

    const json = (await res.json()) as { predictions: Array<{ bytesBase64Encoded: string }> };
    const images = json.predictions.map((p) => Buffer.from(p.bytesBase64Encoded, "base64"));

    return {
      images,
      provider: "gemini",
      model,
      costUsd: estimateImageCost("gemini", model, images.length),
    };
  }
}
