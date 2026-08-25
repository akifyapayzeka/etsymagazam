import { createLogger, loadEnv, QUEUE_NAMES } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { runQa } from "../agents/qa.js";
import { bumpDailyAutopilotCounter } from "../agents/finance.js";
import { recordAudit } from "../lib/decisions.js";
import { getQueue } from "../lib/queues.js";
import type { SeoOutput } from "../agents/seo.js";

const log = createLogger("job:qa");

export interface QaJobData {
  productId: string;
  productVersionId: string;
  attempt: number;
}

export async function handleRunQa(data: QaJobData): Promise<void> {
  const shop = await prisma.shop.findFirstOrThrow();
  const state = await prisma.autopilotState.findUniqueOrThrow({ where: { shopId: shop.id } });
  const version = await prisma.productVersion.findUniqueOrThrow({ where: { id: data.productVersionId } });
  const seo = version.seoJson as unknown as SeoOutput;

  const { report } = await runQa({
    productId: data.productId,
    productVersionId: data.productVersionId,
    attempt: data.attempt,
    seoTitle: seo.title,
    seoDescription: seo.description,
    seoTags: seo.tags,
    qaMinScore: state.qaMinScore,
    ipRiskRejectThreshold: state.ipRiskRejectThreshold,
  });

  if (report.passed) {
    await prisma.product.update({ where: { id: data.productId }, data: { status: "READY_TO_PUBLISH" } });
    await getQueue(QUEUE_NAMES.PRICING).add("set-initial-price", { productId: data.productId, productVersionId: data.productVersionId });
    return;
  }

  const env = loadEnv();
  if (data.attempt < env.QA_MAX_RETRIES) {
    await prisma.product.update({ where: { id: data.productId }, data: { status: "IN_PRODUCTION" } });
    const product = await prisma.product.findUniqueOrThrow({ where: { id: data.productId } });
    await getQueue(QUEUE_NAMES.PRODUCT_GENERATION).add("generate-product-from-opportunity", {
      variationOfProductId: product.parentProductId ?? product.id,
      angle: `Regenerated attempt ${data.attempt + 1}`,
    });
    log.info({ productId: data.productId, attempt: data.attempt }, "QA failed — requeued for regeneration");
    return;
  }

  await prisma.product.update({ where: { id: data.productId }, data: { status: "CANCELLED" } });
  await bumpDailyAutopilotCounter(shop.id, "productsRejected");
  await recordAudit({
    shopId: shop.id,
    actor: "qa-agent",
    action: "product_cancelled_after_max_qa_retries",
    entityType: "product",
    entityId: data.productId,
    reason: `Failed QA ${data.attempt} times (overall score ${report.overallScore}); giving up per QA_MAX_RETRIES=${env.QA_MAX_RETRIES}.`,
  });
  log.info({ productId: data.productId }, "Product cancelled after exhausting QA retries");
}
