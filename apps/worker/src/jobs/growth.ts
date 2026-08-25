import { createLogger, QUEUE_NAMES } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { findGrowthCandidates } from "../agents/growth.js";
import { reviewUnderperformingProducts } from "../agents/optimize.js";
import { canGenerateMore } from "../agents/store-director.js";
import { getQueue } from "../lib/queues.js";

const log = createLogger("job:growth");

export async function handleScanWinners(): Promise<void> {
  const shop = await prisma.shop.findFirstOrThrow();

  const candidates = await findGrowthCandidates();
  for (const { winner, angle } of candidates) {
    const gate = await canGenerateMore(shop.id);
    if (!gate.allowed) {
      log.info({ reason: gate.reason }, "Store Director blocked growth expansion — stopping for today");
      break;
    }
    await getQueue(QUEUE_NAMES.PRODUCT_GENERATION).add("generate-variation", {
      variationOfProductId: winner.productId,
      angle,
    });
  }

  const { reviewed, deactivated } = await reviewUnderperformingProducts(shop.id);
  log.info({ growthCandidates: candidates.length, reviewed, deactivated }, "Weekly growth scan complete");
}
