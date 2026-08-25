import { createLogger } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { recordDecision } from "../lib/decisions.js";

const log = createLogger("growth-agent");

const VARIATION_ANGLES: Record<string, string[]> = {
  wedding: ["Invitation", "Menu Card", "Table Numbers", "Seating Chart", "Thank You Card", "Save The Date"],
  baby: ["Thank You Card", "Diaper Raffle Card", "Book Request Card"],
  planner: ["Weekly Version", "Monthly Version", "Digital-Only Version"],
  organization: ["Fridge-Size Version", "Binder-Size Version"],
  default: ["Alternate Color Variant", "Matching Companion Piece"],
};

export interface WinningProduct {
  productId: string;
  designFamily: string;
  category: string;
  revenue30d: number;
  sales30d: number;
}

const MIN_SALES_TO_BE_A_WINNER = 3;
const MAX_VARIATIONS_PER_FAMILY = 6;

/** Finds published products with strong recent sales that haven't been expanded into a full family yet. */
export async function findGrowthCandidates(): Promise<Array<{ winner: WinningProduct; angle: string }>> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.productMetric.groupBy({
    by: ["productId"],
    where: { date: { gte: since } },
    _sum: { revenue: true, sales: true },
    orderBy: { _sum: { revenue: "desc" } },
    take: 20,
  });

  const candidates: Array<{ winner: WinningProduct; angle: string }> = [];

  for (const g of grouped) {
    const sales = g._sum.sales ?? 0;
    if (sales < MIN_SALES_TO_BE_A_WINNER) continue;

    const product = await prisma.product.findUnique({ where: { id: g.productId } });
    if (!product || product.status !== "PUBLISHED") continue;

    const designFamily = product.designFamily ?? product.id;
    const existingVariations = await prisma.product.count({ where: { designFamily } });
    if (existingVariations >= MAX_VARIATIONS_PER_FAMILY) continue;

    const angles = VARIATION_ANGLES[product.category] ?? VARIATION_ANGLES.default!;
    const alreadyBuiltTitles = new Set(
      (await prisma.product.findMany({ where: { designFamily }, select: { title: true } })).map((p) => p.title),
    );
    const nextAngle = angles.find((a) => !alreadyBuiltTitles.has(`${product.title} — ${a}`));
    if (!nextAngle) continue;

    candidates.push({
      winner: {
        productId: product.id,
        designFamily,
        category: product.category,
        revenue30d: Number(g._sum.revenue ?? 0),
        sales30d: sales,
      },
      angle: nextAngle,
    });

    await recordDecision({
      agentName: "growth-agent",
      entityType: "product",
      entityId: product.id,
      action: "queue_variation",
      reason: `${sales} sales / $${Number(g._sum.revenue ?? 0).toFixed(2)} revenue in the last 30 days — expanding the "${product.title}" family with a "${nextAngle}".`,
      dataUsed: { sales30d: sales, revenue30d: Number(g._sum.revenue ?? 0), existingVariations },
      confidenceScore: Math.min(1, sales / 20),
    });
  }

  log.info({ count: candidates.length }, "Growth candidates identified");
  return candidates;
}
