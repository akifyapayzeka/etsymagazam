export type AiProviderName = "openai" | "gemini" | "mock";

export interface TextGenerationRequest {
  systemPrompt?: string;
  userPrompt: string;
  /** "cheap" for deterministic/structured tasks (tags, short copy); "premium" for higher-quality creative writing. */
  tier: "cheap" | "premium";
  maxOutputTokens?: number;
  temperature?: number;
  /** For prompt-version tracking (see prompts/). */
  promptVersion?: string;
  jsonMode?: boolean;
}

export interface TextGenerationResult {
  text: string;
  provider: AiProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ImageGenerationRequest {
  prompt: string;
  width?: number;
  height?: number;
  count?: number;
  promptVersion?: string;
}

export interface ImageGenerationResult {
  images: Buffer[];
  provider: AiProviderName;
  model: string;
  costUsd: number;
}

export interface TextGenerator {
  readonly provider: AiProviderName;
  generate(req: TextGenerationRequest): Promise<TextGenerationResult>;
}

export interface ImageGenerator {
  readonly provider: AiProviderName;
  generate(req: ImageGenerationRequest): Promise<ImageGenerationResult>;
}
