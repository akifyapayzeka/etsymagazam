import { createLogger } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import rules from "../config/optimization-rules.json" with { type: "json" };
import { getEtsyClientForShop } from "../lib/etsy-client.js";
import { bumpDailyAutopilotCounter } from "./finance.js";
import { recordAudit, recordDecision } from "../lib/decisions.js";

const log = createLogger("optimize-agent");

/**
 * Loser-product management. Etsy's v3 API does not publicly expose
 * per-listing views/favorites, so the funnel-stage rules (no views -> SEO
 * refresh, views-no-favorites -> reposition, favorites-no-sale -> pricing
 * review) only run once that signal exists via a source you wire in
 * (dashboard manual entry, a future analytics integration, etc — see
 * product_metrics.visits/favorites, which stay null otherwise). Until then,
 * the one rule that runs on real data: deactivate listings with zero sales
 * after a long window, rather than leaving dead inventory cluttering the
 * shop.
 */
export async function reviewUnderperformingProducts(shopId: string): Promise<{ reviewed: number; deactivated: number }> {
  const listings = await prisma.listing.findMany({ where: { state: "ACTIVE" }, include: { product: true } });
  let reviewed = 0;
  let deactivated = 0;

  for (const listing of listings) {
    if (!listing.publishedAt) continue;
    const ageDays = (Date.now() - listing.publishedAt.getTime()) / (1000 * 60 * 60 * 24);

    const metrics = await prisma.productMetric.aggregate({
      where: { productId: listing.productId },
      _sum: { sales: true, visits: true, favorites: true },
    });
    const sales = metrics._sum.sales ?? 0;
    const visits = metrics._sum.visits;
    const favorites = metrics._sum.favorites;
    reviewed += 1;

    let action: string | null = null;
    let reason = "";

    if (visits != null && favorites != null) {
      if (visits === 0 && ageDays >= rules.zeroVisitsRefreshAfterDays) {
        action = "refresh_seo";
        reason = `${Math.round(ageDays)} days live with 0 recorded visits — SEO likely needs work.`;
      } else if (visits > 0 && favorites === 0 && sales === 0 && ageDays >= rules.zeroVisitsRefreshAfterDays) {
        action = "reposition_cover";
        reason = `${visits} visits but 0 favorites — the cover image likely isn't converting browsers into savers.`;
      } else if (favorites > 0 && sales === 0 && ageDays >= rules.longNoSaleDays) {
        action = "review_price";
        reason = `${favorites} favorites but 0 sales after ${Math.round(ageDays)} days — price or offer may be the blocker.`;
      } else if (visits >= rules.highVisitNoSaleThreshold && sales === 0) {
        action = "deactivate";
        reason = `${visits} visits, 0 sales — high traffic without conversion after a long window.`;
      }
    } else if (sales === 0 && ageDays >= rules.longNoSaleDays) {
      action = "deactivate";
      reason = `No sales in ${Math.round(ageDays)} days (view/favorite data unavailable via Etsy's public API — decision based on sales + listing age only).`;
    }

    if (!action) continue;

    if (action === "deactivate") {
      const client = await getEtsyClientForShop(shopId);
      if (client && listing.etsyListingId) {
        await client.deactivateListing(listing.etsyListingId);
      }
      await prisma.listing.update({ where: { id: listing.id }, data: { state: "INACTIVE", deactivatedAt: new Date() } });
      await prisma.product.update({ where: { id: listing.productId }, data: { status: "DEACTIVATED" } });
      await bumpDailyAutopilotCounter(shopId, "productsDeactivated");
      await recordAudit({
        shopId,
        actor: "optimize-agent",
        action: "listing_deactivated",
        entityType: "listing",
        entityId: listing.id,
        reason,
      });
      deactivated += 1;
    } else {
      await bumpDailyAutopilotCounter(shopId, "productsOptimized");
    }

    await recordDecision({
      agentName: "optimize-agent",
      entityType: "listing",
      entityId: listing.id,
      action,
      reason,
      dataUsed: { sales, visits, favorites, ageDays: Math.round(ageDays) },
      confidenceScore: 0.6,
    });
  }

  log.info({ reviewed, deactivated }, "Underperforming product review complete");
  return { reviewed, deactivated };
}
