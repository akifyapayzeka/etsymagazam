import { estimateImageCost, estimateTextCost } from "../cost.js";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageGenerator,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerator,
} from "../types.js";

const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const IMAGES_URL = "https://api.openai.com/v1/images/generations";

export interface OpenAiProviderOptions {
  apiKey: string;
  cheapModel: string;
  premiumModel: string;
  imageModel: string;
  fetchImpl?: typeof fetch;
}

export class OpenAiTextGenerator implements TextGenerator {
  readonly provider = "openai" as const;
  constructor(private readonly opts: OpenAiProviderOptions) {}

  async generate(req: TextGenerationRequest): Promise<TextGenerationResult> {
    const model = req.tier === "premium" ? this.opts.premiumModel : this.opts.cheapModel;
    const fetchImpl = this.opts.fetchImpl ?? fetch;

    const messages = [
      ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
      { role: "user", content: req.userPrompt },
    ];

    const res = await fetchImpl(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxOutputTokens ?? 1024,
        ...(req.jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI chat completion failed: ${res.status} ${body}`);
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    const text = json.choices[0]?.message.content ?? "";
    const inputTokens = json.usage?.prompt_tokens ?? 0;
    const outputTokens = json.usage?.completion_tokens ?? 0;

    return {
      text,
      provider: "openai",
      model,
      inputTokens,
      outputTokens,
      costUsd: estimateTextCost("openai", model, inputTokens, outputTokens),
    };
  }
}

export class OpenAiImageGenerator implements ImageGenerator {
  readonly provider = "openai" as const;
  constructor(private readonly opts: OpenAiProviderOptions) {}

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const size = pickSize(req.width, req.height);
    const count = req.count ?? 1;

    const res = await fetchImpl(IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.opts.imageModel,
        prompt: req.prompt,
        size,
        n: count,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI image generation failed: ${res.status} ${body}`);
    }

    const json = (await res.json()) as { data: Array<{ b64_json: string }> };
    const images = json.data.map((d) => Buffer.from(d.b64_json, "base64"));

    return {
      images,
      provider: "openai",
      model: this.opts.imageModel,
      costUsd: estimateImageCost("openai", this.opts.imageModel, images.length),
    };
  }
}

function pickSize(width?: number, height?: number): string {
  if (!width || !height || width === height) return "1024x1024";
  return width > height ? "1536x1024" : "1024x1536";
}
