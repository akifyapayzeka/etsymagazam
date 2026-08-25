import { createLogger } from "@etsymagazam/core";
import { prisma, type PriceChange } from "@etsymagazam/database";
import productCatalog from "../config/product-catalog.json" with { type: "json" };
import { recordDecision } from "../lib/decisions.js";

const log = createLogger("pricing-agent");

interface CatalogEntry {
  templateType: "poster" | "checklist";
  category: string;
  defaultSizeIds: string[];
  basePriceUsd: number;
}

const CATALOG = productCatalog.productTypes as Record<string, CatalogEntry>;

export function clampPrice(price: number, minPrice: number, maxPrice: number): number {
  return Math.min(maxPrice, Math.max(minPrice, Math.round(price * 100) / 100));
}

/** Sets the initial price for a brand-new product: category base price, adjusted for bundle size (more sizes/files = higher perceived value). */
export async function computeInitialPrice(input: {
  productType: string;
  sizeCount: number;
  minPrice: number;
  maxPrice: number;
}): Promise<{ price: number; reason: string }> {
  const entry = CATALOG[input.productType] ?? (Object.values(CATALOG)[0] as CatalogEntry);
  const bundleMultiplier = 1 + Math.max(0, input.sizeCount - 1) * 0.08;
  const raw = entry.basePriceUsd * bundleMultiplier;
  const price = clampPrice(raw, input.minPrice, input.maxPrice);
  return {
    price,
    reason: `Category base $${entry.basePriceUsd} x bundle multiplier ${bundleMultiplier.toFixed(2)} (${input.sizeCount} sizes), clamped to [$${input.minPrice}, $${input.maxPrice}].`,
  };
}

/**
 * Weekly pricing review for an existing listing: a controlled, sequential
 * price test (not a fake A/B split — Etsy doesn't support serving two
 * prices at once) based on recent conversion signal.
 */
export async function reviewListingPrice(
  listingId: string,
  maxDailyPriceChange: number,
  minPrice: number,
  maxPrice: number,
): Promise<PriceChange | null> {
  const listing = await prisma.listing.findUniqueOrThrow({ where: { id: listingId } });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const metrics = await prisma.productMetric.findMany({ where: { productId: listing.productId, date: { gte: since } } });

  const totalSales = metrics.reduce((sum, m) => sum + m.sales, 0);
  const totalVisits = metrics.reduce((sum, m) => sum + (m.visits ?? 0), 0);
  const conversionRate = totalVisits > 0 ? totalSales / totalVisits : null;

  const changesToday = await prisma.priceChange.count({
    where: { listingId, createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } },
  });
  if (changesToday >= maxDailyPriceChange) {
    log.info({ listingId }, "Max daily price change reached — skipping.");
    return null;
  }

  let direction: "up" | "down" | "hold" = "hold";
  let reason = "Not enough signal to change price.";
  if (conversionRate !== null) {
    if (conversionRate > 0.05 && totalSales >= 3) {
      direction = "up";
      reason = `Conversion rate ${(conversionRate * 100).toFixed(1)}% over last 30 days is strong — testing a modest price increase.`;
    } else if (conversionRate < 0.005 && totalVisits >= 50) {
      direction = "down";
      reason = `Conversion rate ${(conversionRate * 100).toFixed(1)}% over last 30 days is weak with real traffic (${totalVisits} visits) — testing a modest price decrease.`;
    }
  }

  if (direction === "hold") return null;

  const oldPrice = Number(listing.priceAmount);
  const delta = direction === "up" ? 1.05 : 0.92;
  const newPrice = clampPrice(oldPrice * delta, minPrice, maxPrice);
  if (newPrice === oldPrice) return null;

  await prisma.listing.update({ where: { id: listing.id }, data: { priceAmount: newPrice } });
  const priceChange = await prisma.priceChange.create({
    data: { productId: listing.productId, listingId: listing.id, oldPrice, newPrice, reason, triggeredBy: "pricing-agent" },
  });

  await recordDecision({
    agentName: "pricing-agent",
    entityType: "listing",
    entityId: listing.id,
    action: "price_change",
    reason,
    dataUsed: { conversionRate, totalSales, totalVisits, oldPrice, newPrice },
    confidenceScore: Math.min(1, (totalVisits + totalSales) / 100),
    result: `${oldPrice} -> ${newPrice}`,
  });

  return priceChange;
}
