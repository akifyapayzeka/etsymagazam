import { createLogger, QUEUE_NAMES } from "@etsymagazam/core";
import { getCanonicalShop, prisma } from "@etsymagazam/database";
import { computeInitialPrice, reviewListingPrice } from "../agents/pricing.js";
import { getQueue } from "../lib/queues.js";

const log = createLogger("job:pricing");

export async function handleSetInitialPrice(data: { productId: string; productVersionId: string }): Promise<void> {
  const shop = await getCanonicalShop();
  const state = await prisma.autopilotState.findUniqueOrThrow({ where: { shopId: shop.id } });
  const product = await prisma.product.findUniqueOrThrow({ where: { id: data.productId } });
  const version = await prisma.productVersion.findUniqueOrThrow({ where: { id: data.productVersionId } });
  const sizes = (version.metadataJson as { sizes: string[] }).sizes;

  const { price, reason } = await computeInitialPrice({
    productType: product.productType,
    sizeCount: sizes.length,
    minPrice: Number(state.minPrice),
    maxPrice: Number(state.maxPrice),
  });

  log.info({ productId: data.productId, price }, reason);

  await getQueue(QUEUE_NAMES.PUBLISH).add("publish-listing", {
    productId: data.productId,
    productVersionId: data.productVersionId,
    priceUsd: price,
  });
}

export async function handleWeeklyPriceReview(): Promise<void> {
  const shop = await getCanonicalShop();
  const state = await prisma.autopilotState.findUniqueOrThrow({ where: { shopId: shop.id } });
  const listings = await prisma.listing.findMany({ where: { state: "ACTIVE" } });

  for (const listing of listings) {
    try {
      await reviewListingPrice(listing.id, state.maxDailyPriceChange, Number(state.minPrice), Number(state.maxPrice));
    } catch (err) {
      log.error({ err, listingId: listing.id }, "Price review failed for listing");
    }
  }
}
