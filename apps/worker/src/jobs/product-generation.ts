import { createLogger, loadEnv, QUEUE_NAMES } from "@etsymagazam/core";
import { getCanonicalShop, prisma } from "@etsymagazam/database";
import { createProductVersion, slugify } from "../agents/product-creator.js";
import { draftProductConcept } from "../agents/product-strategy.js";
import { generateSeoCopy } from "../agents/seo.js";
import { canGenerateMore } from "../agents/store-director.js";
import { bumpDailyAutopilotCounter } from "../agents/finance.js";
import productCatalog from "../config/product-catalog.json" with { type: "json" };
import { recordDecision } from "../lib/decisions.js";
import { getQueue } from "../lib/queues.js";

const log = createLogger("job:product-generation");

interface CatalogEntry {
  templateType: "poster" | "checklist";
  category: string;
  defaultSizeIds: string[];
  basePriceUsd: number;
}
const CATALOG = productCatalog.productTypes as Record<string, CatalogEntry>;

export type ProductGenerationJobData =
  | { opportunityId: string }
  | { variationOfProductId: string; angle: string };

export async function handleGenerateProduct(data: ProductGenerationJobData): Promise<void> {
  const shop = await getCanonicalShop();

  const gate = await canGenerateMore(shop.id);
  if (!gate.allowed) {
    log.info({ reason: gate.reason }, "Store Director blocked this generation run");
    if ("opportunityId" in data) {
      await prisma.opportunity.update({ where: { id: data.opportunityId }, data: { status: "NEW" } });
    }
    return;
  }

  let opportunityTitle: string;
  let niche: string;
  let productType: string;
  let opportunityId: string | undefined;
  let designFamily: string | undefined;
  let parentProductId: string | undefined;

  if ("opportunityId" in data) {
    const opportunity = await prisma.opportunity.findUniqueOrThrow({ where: { id: data.opportunityId } });
    opportunityTitle = opportunity.title;
    niche = opportunity.niche;
    productType = opportunity.productType;
    opportunityId = opportunity.id;
  } else {
    const parent = await prisma.product.findUniqueOrThrow({ where: { id: data.variationOfProductId } });
    opportunityTitle = `${parent.title} — ${data.angle}`;
    niche = parent.category;
    productType = parent.productType;
    designFamily = parent.designFamily ?? parent.id;
    parentProductId = parent.id;
  }

  const entry = CATALOG[productType] ?? (Object.values(CATALOG)[0] as CatalogEntry);
  const concept = await draftProductConcept({ opportunityTitle, niche, productType });

  const product = await prisma.product.create({
    data: {
      shopId: shop.id,
      slug: slugify(concept.title, Date.now().toString(36)),
      title: concept.title,
      category: entry.category,
      productType,
      status: "IN_PRODUCTION",
      opportunityId,
      designFamily: designFamily ?? undefined,
      parentProductId,
    },
  });
  if (!designFamily) {
    await prisma.product.update({ where: { id: product.id }, data: { designFamily: product.id } });
  }

  await bumpDailyAutopilotCounter(shop.id, "productsGenerated");

  // Customer-facing brand name — deliberately not shop.shopName, which is
  // Etsy's own registered/technical shop name and is never shown to
  // customers (see BRAND_DISPLAY_NAME in packages/core/src/env.ts).
  const brandName = loadEnv().BRAND_DISPLAY_NAME;
  const version = await createProductVersion(product, concept, brandName);

  const usedAiImages = false; // this template system renders design entirely deterministically (see packages/product-generator)
  const seo = await generateSeoCopy({
    productTitle: concept.title,
    conceptSummary: [concept.eyebrow, concept.subtitle, ...(concept.bodyLines ?? [])].filter(Boolean).join(" — "),
    sizesList: concept.suggestedSizes,
    fileFormats: ["PDF", "PNG", "SVG"],
    usedAiImages,
    brandName,
  });

  await prisma.productVersion.update({ where: { id: version.id }, data: { seoJson: seo as unknown as object } });
  await prisma.product.update({ where: { id: product.id }, data: { status: "IN_QA" } });

  await recordDecision({
    agentName: "product-creator-agent",
    entityType: "product",
    entityId: product.id,
    action: "generate_product_version",
    reason: `Built version ${version.versionNumber} for "${concept.title}" (${productType}) from ${
      "opportunityId" in data ? `opportunity ${data.opportunityId}` : `variation of ${data.variationOfProductId} (${data.angle})`
    }.`,
    dataUsed: { productType, sizes: concept.suggestedSizes, usedAi: seo.usedAi },
    confidenceScore: 0.7,
  });

  await getQueue(QUEUE_NAMES.QA).add("run-qa", { productId: product.id, productVersionId: version.id, attempt: 1 });

  log.info({ productId: product.id, versionId: version.id }, "Product generation pipeline stage complete — queued for QA");
}
