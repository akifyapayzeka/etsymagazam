import { createAiRouter } from "@etsymagazam/ai";
import { createLogger, loadPrompt, renderPromptTemplate } from "@etsymagazam/core";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import { buildAiDisclosureText } from "@etsymagazam/qa";

const log = createLogger("seo-agent");

export interface SeoOutput {
  title: string;
  description: string;
  tags: string[];
  materials: string[];
  attributes: { occasion: string | null; style: string | null; recipient: string | null; color: string | null };
  usedAi: boolean;
}

export async function generateSeoCopy(input: {
  productTitle: string;
  conceptSummary: string;
  sizesList: string[];
  fileFormats: string[];
  usedAiImages: boolean;
}): Promise<SeoOutput> {
  const aiDisclosureLine = buildAiDisclosureText({ usedAiText: true, usedAiImages: input.usedAiImages });

  const fallback: SeoOutput = {
    title: truncate(input.productTitle, LISTING_LIMITS.maxTitleLength),
    description: buildFallbackDescription(input, aiDisclosureLine),
    tags: buildFallbackTags(input.productTitle),
    materials: ["Digital File", "PDF", "PNG"],
    attributes: { occasion: null, style: null, recipient: null, color: null },
    usedAi: false,
  };

  try {
    const prompt = await loadPrompt("seo-copywriting", 1);
    const { text } = await createAiRouter().text.generate({
      systemPrompt: prompt.system,
      userPrompt: renderPromptTemplate(prompt.userTemplate, {
        productTitle: input.productTitle,
        conceptSummary: input.conceptSummary,
        sizesList: input.sizesList.join(", "),
        fileFormats: input.fileFormats.join(", "),
        aiDisclosureLine,
      }),
      tier: "cheap",
      jsonMode: true,
      promptVersion: `${prompt.id}@${prompt.version}`,
    });

    const parsed = JSON.parse(text) as Partial<SeoOutput>;
    const tags = sanitizeTags(parsed.tags ?? fallback.tags);
    return {
      title: truncate(parsed.title || fallback.title, LISTING_LIMITS.maxTitleLength),
      description: parsed.description || fallback.description,
      tags,
      materials: parsed.materials && parsed.materials.length ? parsed.materials : fallback.materials,
      attributes: { ...fallback.attributes, ...parsed.attributes },
      usedAi: true,
    };
  } catch (err) {
    log.warn({ err }, "SEO copywriting AI call failed or returned invalid JSON — using deterministic fallback copy.");
    return fallback;
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

function sanitizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of tags) {
    const tag = truncate(raw.trim(), LISTING_LIMITS.maxTagLength);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(tag);
    if (cleaned.length === LISTING_LIMITS.maxTags) break;
  }
  return cleaned;
}

function buildFallbackTags(title: string): string[] {
  const words = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  const base = ["printable", "digital download", "instant download", ...words];
  return sanitizeTags(base);
}

function buildFallbackDescription(
  input: { productTitle: string; sizesList: string[]; fileFormats: string[] },
  aiDisclosureLine: string,
): string {
  return [
    `${input.productTitle} — a printable digital download ready to print at home or through your favorite print shop.`,
    `Includes: ${input.sizesList.join(", ")} in ${input.fileFormats.join(", ")} format.`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy.`,
    `For personal use — see the included license.txt for details.`,
    aiDisclosureLine,
  ]
    .filter(Boolean)
    .join("\n\n");
}
