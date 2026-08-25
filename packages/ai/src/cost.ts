import pricing from "./config/model-pricing.json" with { type: "json" };
import type { AiProviderName } from "./types.js";

export function estimateTextCost(
  provider: Exclude<AiProviderName, "mock">,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const table = (pricing.text as Record<string, Record<string, { inputPer1M: number; outputPer1M: number }>>)[
    provider
  ];
  const rates = table?.[model];
  if (!rates) return 0;
  const cost = (inputTokens / 1_000_000) * rates.inputPer1M + (outputTokens / 1_000_000) * rates.outputPer1M;
  return round5(cost);
}

export function estimateImageCost(provider: Exclude<AiProviderName, "mock">, model: string, count: number): number {
  const table = (pricing.image as Record<string, Record<string, { perImage: number }>>)[provider];
  const rates = table?.[model];
  if (!rates) return 0;
  return round5(rates.perImage * count);
}

function round5(n: number): number {
  return Math.round(n * 100000) / 100000;
}
