import { estimateEtsyFees } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

function startOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function startOfMonthUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  /** The "I just want to see the money" screen. */
  app.get("/api/dashboard/money", async () => {
    const shop = await prisma.shop.findFirst();
    if (!shop) return { error: "no_shop" };

    const today = startOfDayUtc();
    const monthStart = startOfMonthUtc();

    const [todayMetric, monthMetrics, automationSummary, alerts] = await Promise.all([
      prisma.dailyMetric.findUnique({ where: { shopId_date: { shopId: shop.id, date: today } } }),
      prisma.dailyMetric.findMany({ where: { shopId: shop.id, date: { gte: monthStart } } }),
      prisma.dailyMetric.aggregate({
        where: { shopId: shop.id, date: { gte: monthStart } },
        _sum: { productsGenerated: true, productsPublished: true, productsOptimized: true },
      }),
      prisma.alert.findMany({ where: { shopId: shop.id, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);

    const monthTotals = monthMetrics.reduce(
      (acc, m) => ({
        revenue: acc.revenue + Number(m.grossRevenue),
        net: acc.net + Number(m.estimatedNet),
        orders: acc.orders + m.orders,
      }),
      { revenue: 0, net: 0, orders: 0 },
    );

    return {
      today: {
        revenue: Number(todayMetric?.grossRevenue ?? 0),
        estimatedNet: Number(todayMetric?.estimatedNet ?? 0),
        orders: todayMetric?.orders ?? 0,
      },
      thisMonth: monthTotals,
      aiWorkedToday: {
        productsPublished: todayMetric?.productsPublished ?? 0,
        productsOptimized: todayMetric?.productsOptimized ?? 0,
        productsGenerated: todayMetric?.productsGenerated ?? 0,
      },
      monthToDateAutopilot: {
        productsGenerated: automationSummary._sum.productsGenerated ?? 0,
        productsPublished: automationSummary._sum.productsPublished ?? 0,
        productsOptimized: automationSummary._sum.productsOptimized ?? 0,
      },
      attentionRequired: alerts.map((a) => ({ id: a.id, priority: a.priority, title: a.title })),
    };
  });

  /** The full operator dashboard. */
  app.get("/api/dashboard/summary", async () => {
    const shop = await prisma.shop.findFirst();
    if (!shop) return { error: "no_shop" };

    const today = startOfDayUtc();
    const [todayMetric, autopilot, alerts, topProducts] = await Promise.all([
      prisma.dailyMetric.findUnique({ where: { shopId_date: { shopId: shop.id, date: today } } }),
      prisma.autopilotState.findUnique({ where: { shopId: shop.id } }),
      prisma.alert.findMany({ where: { shopId: shop.id, status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.productMetric.groupBy({
        by: ["productId"],
        _sum: { revenue: true, sales: true },
        orderBy: { _sum: { revenue: "desc" } },
        take: 3,
      }),
    ]);

    return {
      today: {
        orders: todayMetric?.orders ?? 0,
        revenue: Number(todayMetric?.grossRevenue ?? 0),
        estimatedNet: Number(todayMetric?.estimatedNet ?? 0),
        visitors: todayMetric?.visitors ?? null,
        conversion:
          todayMetric?.visitors && todayMetric.orders ? Number((todayMetric.orders / todayMetric.visitors).toFixed(4)) : null,
      },
      autopilot: {
        productsGenerated: todayMetric?.productsGenerated ?? 0,
        productsPublished: todayMetric?.productsPublished ?? 0,
        productsRejected: todayMetric?.productsRejected ?? 0,
        productsOptimized: todayMetric?.productsOptimized ?? 0,
        productsDeactivated: todayMetric?.productsDeactivated ?? 0,
        isPaused: autopilot?.isPaused ?? true,
        autoPublish: autopilot?.autoPublish ?? false,
        dryRun: autopilot?.dryRun ?? true,
      },
      winners: topProducts,
      alerts: alerts.map((a) => ({
        id: a.id,
        priority: a.priority,
        category: a.category,
        title: a.title,
        message: a.message,
        createdAt: a.createdAt,
      })),
    };
  });

  app.get("/api/dashboard/autopilot", async () => {
    const shop = await prisma.shop.findFirst();
    if (!shop) return { error: "no_shop" };
    return prisma.autopilotState.findUnique({ where: { shopId: shop.id } });
  });

  app.post("/api/dashboard/autopilot/pause", { preHandler: app.requireCsrf }, async (req) => {
    const shop = await prisma.shop.findFirst();
    if (!shop) return { error: "no_shop" };
    const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const state = await prisma.autopilotState.update({
      where: { shopId: shop.id },
      data: { isPaused: true, pausedAt: new Date(), pausedReason: body.reason ?? "Paused from dashboard" },
    });
    await prisma.auditLog.create({
      data: { shopId: shop.id, actor: "human", action: "autopilot_paused", entityType: "shop", entityId: shop.id, reason: body.reason },
    });
    return state;
  });

  app.post("/api/dashboard/autopilot/resume", { preHandler: app.requireCsrf }, async () => {
    const shop = await prisma.shop.findFirst();
    if (!shop) return { error: "no_shop" };
    const state = await prisma.autopilotState.update({
      where: { shopId: shop.id },
      data: { isPaused: false, pausedAt: null, pausedReason: null },
    });
    await prisma.auditLog.create({
      data: { shopId: shop.id, actor: "human", action: "autopilot_resumed", entityType: "shop", entityId: shop.id },
    });
    return state;
  });

  const settingsSchema = z.object({
    autoPublish: z.boolean().optional(),
    dryRun: z.boolean().optional(),
    maxProductsPerDay: z.number().int().positive().optional(),
    maxProductsPerWeek: z.number().int().positive().optional(),
    qaMinScore: z.number().int().min(0).max(100).optional(),
    ipRiskRejectThreshold: z.number().int().min(0).max(100).optional(),
    minPrice: z.number().positive().optional(),
    maxPrice: z.number().positive().optional(),
    maxDailyPriceChange: z.number().int().min(0).optional(),
  });

  app.patch("/api/dashboard/autopilot/settings", { preHandler: app.requireCsrf }, async (req, reply) => {
    const shop = await prisma.shop.findFirst();
    if (!shop) return { error: "no_shop" };
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", issues: parsed.error.issues };
    }
    const before = await prisma.autopilotState.findUnique({ where: { shopId: shop.id } });
    const state = await prisma.autopilotState.update({ where: { shopId: shop.id }, data: parsed.data });
    await prisma.auditLog.create({
      data: {
        shopId: shop.id,
        actor: "human",
        action: "autopilot_settings_changed",
        entityType: "shop",
        entityId: shop.id,
        before: before as unknown as object,
        after: state as unknown as object,
      },
    });
    return state;
  });

  app.get("/api/dashboard/alerts", async (req) => {
    const query = z.object({ status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED"]).optional() }).parse(req.query ?? {});
    return prisma.alert.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  app.post<{ Params: { id: string } }>("/api/dashboard/alerts/:id/resolve", { preHandler: app.requireCsrf }, async (req) => {
    return prisma.alert.update({ where: { id: req.params.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  });

  app.get("/api/dashboard/products", async (req) => {
    const query = z
      .object({ status: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query ?? {});
    return prisma.product.findMany({
      where: query.status ? { status: query.status as never } : undefined,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: { listings: true },
    });
  });

  app.get("/api/dashboard/audit-log", async (req) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query ?? {});
    return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: query.limit });
  });

  app.get("/api/dashboard/agent-decisions", async (req) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query ?? {});
    return prisma.agentDecision.findMany({ orderBy: { createdAt: "desc" }, take: query.limit });
  });

  app.get("/api/dashboard/fee-schedule", async () => {
    return estimateEtsyFees({ priceAmount: 10, sellerCountry: "TR" });
  });
}
