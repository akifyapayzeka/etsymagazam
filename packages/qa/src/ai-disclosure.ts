import policy from "./config/ai-disclosure-policy.json" with { type: "json" };

export interface AiUsageFlags {
  usedAiText: boolean;
  usedAiImages: boolean;
}

/**
 * Returns the Etsy Creativity Standards disclosure line to append to a
 * listing description, or an empty string if no AI was used in producing
 * this specific product. Wording lives in config/ai-disclosure-policy.json
 * so it can be updated as Etsy's policy evolves without a code change.
 */
export function buildAiDisclosureText(flags: AiUsageFlags): string {
  const key = flags.usedAiText && flags.usedAiImages ? "ai_text_and_images" : flags.usedAiText ? "ai_text_only" : flags.usedAiImages ? "ai_images_only" : "none";
  return (policy.templates as Record<string, string>)[key] ?? "";
}

export function getAiDisclosurePolicyMeta(): { version: number; lastReviewed: string; policyUrl: string } {
  return { version: policy.version, lastReviewed: policy.lastReviewed, policyUrl: policy.policyUrl };
}
