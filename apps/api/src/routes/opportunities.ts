import { prisma } from "@etsymagazam/database";
import { getQueue, QUEUE_NAMES } from "../lib/queues.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Manual research input. Etsy does not expose a public programmatic API for
 * Marketplace Insights, so this is the supported legal path for feeding the
 * Trend Scout Agent real signal beyond what Etsy's own receipts/listings
 * API already gives it — you paste keywords (optionally with a CSV of
 * search-volume/competition hints from a tool you already use) and the
 * agent scores them the same way it scores anything else.
 */
export default async function opportunityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  const keywordInputSchema = z.object({
    keywords: z
      .array(
        z.object({
          keyword: z.string().min(2),
          demandScoreHint: z.number().min(0).max(100).optional(),
          competitionScoreHint: z.number().min(0).max(100).optional(),
          notes: z.string().optional(),
        }),
      )
      .min(1),
    source: z.enum(["manual_admin", "manual_csv"]).default("manual_admin"),
  });

  app.post("/api/opportunities/keywords", { preHandler: app.requireCsrf }, async (req, reply) => {
    const parsed = keywordInputSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_request", issues: parsed.error.issues };
    }

    const created = [];
    for (const item of parsed.data.keywords) {
      const research = await prisma.productResearch.create({
        data: {
          source: parsed.data.source,
          keyword: item.keyword,
          rawData: { demandScoreHint: item.demandScoreHint, competitionScoreHint: item.competitionScoreHint, notes: item.notes },
        },
      });
      const keyword = await prisma.keyword.upsert({
        where: { keyword: item.keyword },
        update: { researchId: research.id, demandScore: item.demandScoreHint, competitionScore: item.competitionScoreHint },
        create: {
          keyword: item.keyword,
          researchId: research.id,
          demandScore: item.demandScoreHint,
          competitionScore: item.competitionScoreHint,
        },
      });
      created.push(keyword);
    }

    await getQueue(QUEUE_NAMES.RESEARCH).add("score-manual-keywords", {
      keywordIds: created.map((k) => k.id),
    });

    return { created: created.length };
  });

  app.get("/api/opportunities", async (req) => {
    const query = z
      .object({ status: z.string().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(req.query ?? {});
    return prisma.opportunity.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { opportunityScore: "desc" },
      take: query.limit,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/api/opportunities/:id/select",
    { preHandler: app.requireCsrf },
    async (req) => {
      const opportunity = await prisma.opportunity.update({
        where: { id: req.params.id },
        data: { status: "SELECTED" },
      });
      await getQueue(QUEUE_NAMES.PRODUCT_GENERATION).add("generate-product-from-opportunity", {
        opportunityId: opportunity.id,
      });
      return opportunity;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/opportunities/:id/reject",
    { preHandler: app.requireCsrf },
    async (req) => prisma.opportunity.update({ where: { id: req.params.id }, data: { status: "REJECTED" } }),
  );
}
