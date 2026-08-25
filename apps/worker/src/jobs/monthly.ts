import { createLogger } from "@etsymagazam/core";
import { findCanonicalShop, prisma } from "@etsymagazam/database";

const log = createLogger("job:monthly");

/** Monthly full-store strategy/profitability snapshot — recorded, not acted on automatically (a human reviews it). */
export async function handleMonthlyReport(): Promise<void> {
  const shop = await findCanonicalShop();
  if (!shop) return;

  const run = await prisma.automationRun.create({ data: { name: "monthly_portfolio_report", cadence: "monthly" } });

  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const metrics = await prisma.dailyMetric.findMany({ where: { shopId: shop.id, date: { gte: monthStart } } });
  const totals = metrics.reduce(
    (acc, m) => ({
      revenue: acc.revenue + Number(m.grossRevenue),
      fees: acc.fees + Number(m.estimatedEtsyFees),
      aiCosts: acc.aiCosts + Number(m.aiCosts),
      net: acc.net + Number(m.estimatedNet),
      orders: acc.orders + m.orders,
    }),
    { revenue: 0, fees: 0, aiCosts: 0, net: 0, orders: 0 },
  );

  const [statusCounts, productCount] = await Promise.all([
    prisma.product.groupBy({ by: ["status"], _count: true }),
    prisma.product.count(),
  ]);

  const summary = {
    monthToDate: totals,
    portfolio: { totalProducts: productCount, byStatus: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])) },
  };

  await prisma.automationRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", summary: summary as unknown as object, finishedAt: new Date() } });
  log.info(summary, "Monthly portfolio report generated");
}
