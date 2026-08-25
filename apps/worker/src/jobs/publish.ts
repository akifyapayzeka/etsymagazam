import { createLogger, loadEnv } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { publishListing } from "../agents/publisher.js";
import { bumpDailyAutopilotCounter } from "../agents/finance.js";
import { raiseAlert } from "../lib/decisions.js";
import type { SeoOutput } from "../agents/seo.js";

const log = createLogger("job:publish");

export async function handlePublishListing(data: { productId: string; productVersionId: string; priceUsd: number }): Promise<void> {
  const shop = await prisma.shop.findFirstOrThrow();
  const state = await prisma.autopilotState.findUniqueOrThrow({ where: { shopId: shop.id } });
  const product = await prisma.product.findUniqueOrThrow({ where: { id: data.productId } });
  const version = await prisma.productVersion.findUniqueOrThrow({ where: { id: data.productVersionId } });
  const seo = version.seoJson as unknown as SeoOutput;
  const env = loadEnv();

  const result = await publishListing({
    shopId: shop.id,
    productId: data.productId,
    productVersionId: data.productVersionId,
    priceUsd: data.priceUsd,
    category: product.category,
    seo,
    dryRun: state.dryRun,
    autoPublish: state.autoPublish,
  });

  log.info({ productId: data.productId, status: result.status }, result.reason);

  if (result.status === "published_active" || result.status === "published_draft") {
    await bumpDailyAutopilotCounter(shop.id, "productsPublished");
    return;
  }

  if (result.status === "blocked") {
    await prisma.product.update({ where: { id: data.productId }, data: { status: "READY_TO_PUBLISH" } });
    await raiseAlert({
      shopId: shop.id,
      priority: "P1",
      category: "publish_failure",
      title: "A ready product could not be published",
      message: result.reason,
      context: { productId: data.productId, autoPublish: env.AUTO_PUBLISH },
    });
  }
}
