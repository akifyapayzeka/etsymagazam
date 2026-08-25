import { createLogger, QUEUE_NAMES } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { getQueue } from "../lib/queues.js";
import { recordDecision } from "../lib/decisions.js";

const log = createLogger("store-director");

function startOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface GateCheck {
  allowed: boolean;
  reason: string;
}

/** The one gate every generation request passes through — kill switch + daily/weekly production limits. */
export async function canGenerateMore(shopId: string): Promise<GateCheck> {
  const state = await prisma.autopilotState.findUnique({ where: { shopId } });
  if (!state) return { allowed: false, reason: "No autopilot_state row for this shop — run the seed script." };
  if (state.isPaused) return { allowed: false, reason: `Autopilot is paused: ${state.pausedReason ?? "no reason given"}.` };

  const todayStart = startOfDayUtc();
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const [todayCount, weekCount] = await Promise.all([
    prisma.product.count({ where: { shopId, createdAt: { gte: todayStart } } }),
    prisma.product.count({ where: { shopId, createdAt: { gte: weekStart } } }),
  ]);

  if (todayCount >= state.maxProductsPerDay) {
    return { allowed: false, reason: `Daily production limit reached (${todayCount}/${state.maxProductsPerDay}).` };
  }
  if (weekCount >= state.maxProductsPerWeek) {
    return { allowed: false, reason: `Weekly production limit reached (${weekCount}/${state.maxProductsPerWeek}).` };
  }
  return { allowed: true, reason: `Within limits (${todayCount}/${state.maxProductsPerDay} today, ${weekCount}/${state.maxProductsPerWeek} this week).` };
}

/**
 * Daily planning run: picks the highest-scored NEW opportunities, up to
 * whatever's left of today's/this week's budget, and kicks off production
 * for each. This is what makes the loop actually self-driving — a human
 * can also hand-pick via the dashboard, but doesn't have to.
 */
export async function runDailyPlanning(shopId: string): Promise<{ selected: number; reason: string }> {
  const gate = await canGenerateMore(shopId);
  if (!gate.allowed) {
    log.info({ shopId, reason: gate.reason }, "Store Director: skipping daily planning");
    return { selected: 0, reason: gate.reason };
  }

  const state = await prisma.autopilotState.findUniqueOrThrow({ where: { shopId } });
  const todayStart = startOfDayUtc();
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const [todayCount, weekCount] = await Promise.all([
    prisma.product.count({ where: { shopId, createdAt: { gte: todayStart } } }),
    prisma.product.count({ where: { shopId, createdAt: { gte: weekStart } } }),
  ]);
  const remaining = Math.max(0, Math.min(state.maxProductsPerDay - todayCount, state.maxProductsPerWeek - weekCount));
  if (remaining === 0) return { selected: 0, reason: "No budget remaining." };

  const candidates = await prisma.opportunity.findMany({
    where: { status: "NEW" },
    orderBy: { opportunityScore: "desc" },
    take: remaining,
  });

  let selected = 0;
  for (const opp of candidates) {
    await prisma.opportunity.update({ where: { id: opp.id }, data: { status: "SELECTED" } });
    await getQueue(QUEUE_NAMES.PRODUCT_GENERATION).add("generate-product-from-opportunity", { opportunityId: opp.id });
    await recordDecision({
      agentName: "store-director",
      entityType: "opportunity",
      entityId: opp.id,
      action: "select_for_production",
      reason: `Opportunity score ${opp.opportunityScore} — top pick within today's remaining budget of ${remaining}.`,
      dataUsed: { opportunityScore: opp.opportunityScore, remaining },
      confidenceScore: opp.opportunityScore / 100,
    });
    selected += 1;
  }

  log.info({ shopId, selected }, "Store Director daily planning complete");
  return { selected, reason: `Selected ${selected} of ${candidates.length} eligible opportunities.` };
}
