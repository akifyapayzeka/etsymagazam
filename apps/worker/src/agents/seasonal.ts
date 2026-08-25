import { createLogger } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { recordDecision } from "../lib/decisions.js";

const log = createLogger("seasonal-agent");

const CATEGORY_TO_PRODUCT_TYPE: Record<string, string> = {
  wedding: "wedding_welcome_sign",
  holiday: "seasonal_printable",
  back_to_school: "printable_worksheet",
  graduation: "printable_card",
};

/**
 * Scans the seasonal calendar for events entering their lead-time window
 * and creates a research opportunity ahead of the seasonal demand spike —
 * not after it starts.
 */
export async function scanSeasonalOpportunities(): Promise<number> {
  const events = await prisma.seasonalEvent.findMany({ where: { active: true } });
  const now = Date.now();
  let created = 0;

  for (const event of events) {
    const daysUntil = (event.eventDate.getTime() - now) / (1000 * 60 * 60 * 24);
    const enteringWindow = daysUntil <= event.leadTimeDays && daysUntil >= event.leadTimeDays - 1;
    if (!enteringWindow) continue;

    const productType = CATEGORY_TO_PRODUCT_TYPE[event.category] ?? "seasonal_printable";
    const title = `${event.name} Printable`;

    const existing = await prisma.opportunity.findFirst({ where: { title, productType } });
    if (existing) continue;

    const opportunity = await prisma.opportunity.create({
      data: {
        title,
        niche: event.category,
        productType,
        demandScore: 70, // seasonal events reliably drive above-baseline search demand
        competitionScore: 50,
        marginScore: 65,
        automationSuitability: 95,
        seasonalityScore: 95,
        ipRiskScore: 5,
        opportunityScore: 75,
        reasoning: `${event.name} is ${Math.round(daysUntil)} days out — entering its ${event.leadTimeDays}-day production lead time window.`,
        status: "NEW",
      },
    });

    await recordDecision({
      agentName: "seasonal-agent",
      entityType: "opportunity",
      entityId: opportunity.id,
      action: "seasonal_opportunity_created",
      reason: `${event.name} enters its lead-time window today (event in ${Math.round(daysUntil)} days).`,
      dataUsed: { event: event.name, daysUntil, leadTimeDays: event.leadTimeDays },
      confidenceScore: 0.75,
    });

    created += 1;
  }

  log.info({ created }, "Seasonal scan complete");
  return created;
}
