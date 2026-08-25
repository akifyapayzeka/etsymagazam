import { createAiRouter } from "@etsymagazam/ai";
import { createLogger, loadPrompt, renderPromptTemplate } from "@etsymagazam/core";
import { listPaletteIds } from "@etsymagazam/product-generator";
import productCatalog from "../config/product-catalog.json" with { type: "json" };

const log = createLogger("product-strategy-agent");

interface CatalogEntry {
  templateType: "poster" | "checklist";
  category: string;
  defaultSizeIds: string[];
  basePriceUsd: number;
}

const CATALOG = productCatalog.productTypes as Record<string, CatalogEntry>;

export interface ProductConcept {
  title: string;
  eyebrow: string | null;
  subtitle: string | null;
  bodyLines: string[];
  footer: string | null;
  suggestedSizes: string[];
  suggestedPaletteId: string;
  templateType: "poster" | "checklist";
  items?: string[]; // for checklist templates
}

/** Turns a scored opportunity into a concrete, buildable product concept. Falls back to a safe deterministic concept if the AI call fails or returns unparseable JSON — the pipeline must never stall on a flaky AI response. */
export async function draftProductConcept(input: {
  opportunityTitle: string;
  niche: string;
  productType: string;
}): Promise<ProductConcept> {
  const entry = CATALOG[input.productType] ?? (Object.values(CATALOG)[0] as CatalogEntry);
  const fallback: ProductConcept = {
    title: titleCase(input.opportunityTitle),
    eyebrow: null,
    subtitle: null,
    bodyLines: entry.templateType === "checklist" ? ["Item one", "Item two", "Item three"] : [],
    footer: null,
    suggestedSizes: entry.defaultSizeIds,
    suggestedPaletteId: "wildflower",
    templateType: entry.templateType,
  };

  try {
    const prompt = await loadPrompt("product-ideation", 1);
    const { text } = await createAiRouter().text.generate({
      systemPrompt: prompt.system,
      userPrompt: renderPromptTemplate(prompt.userTemplate, {
        opportunityTitle: input.opportunityTitle,
        niche: input.niche,
        productType: input.productType,
        styleHint: "",
      }),
      tier: "cheap",
      jsonMode: true,
      promptVersion: `${prompt.id}@${prompt.version}`,
    });

    const parsed = JSON.parse(text) as Partial<ProductConcept> & { items?: string[] };
    const paletteId = listPaletteIds().includes(parsed.suggestedPaletteId ?? "") ? (parsed.suggestedPaletteId as string) : "wildflower";

    return {
      title: parsed.title || fallback.title,
      eyebrow: parsed.eyebrow ?? null,
      subtitle: parsed.subtitle ?? null,
      bodyLines: Array.isArray(parsed.bodyLines) ? parsed.bodyLines : fallback.bodyLines,
      footer: parsed.footer ?? null,
      suggestedSizes: Array.isArray(parsed.suggestedSizes) && parsed.suggestedSizes.length ? parsed.suggestedSizes : entry.defaultSizeIds,
      suggestedPaletteId: paletteId,
      templateType: entry.templateType,
      items: Array.isArray(parsed.items) ? parsed.items : undefined,
    };
  } catch (err) {
    log.warn({ err }, "Product ideation AI call failed or returned invalid JSON — using deterministic fallback concept.");
    return fallback;
  }
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase());
}
