import { createAiRouter } from "@etsymagazam/ai";
import { createLogger, loadEnv, loadPrompt, renderPromptTemplate } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { checkIpRisk } from "@etsymagazam/qa";
import productCatalog from "../config/product-catalog.json" with { type: "json" };
import { recordDecision } from "../lib/decisions.js";

const log = createLogger("trend-scout-agent");

interface CatalogEntry {
  templateType: "poster" | "checklist";
  category: string;
  defaultSizeIds: string[];
  basePriceUsd: number;
}

const CATALOG = productCatalog.productTypes as Record<string, CatalogEntry>;

/** Picks the catalog product type whose category best matches the keyword text (simple substring scoring — deterministic, no AI). */
function matchProductType(keyword: string): { productType: string; entry: CatalogEntry } {
  const lower = keyword.toLowerCase();
  const categoryHints: Array<[string, string[]]> = [
    ["wedding_welcome_sign", ["welcome sign", "wedding sign"]],
    ["wedding_invitation_set", ["invitation", "invite"]],
    ["bridal_shower_game", ["bridal shower"]],
    ["baby_shower_game", ["baby shower"]],
    ["budget_planner", ["budget planner", "finance planner"]],
    ["nursery_printable", ["nursery"]],
    ["business_template", ["business template", "social media template"]],
    ["printable_worksheet", ["worksheet", "educational"]],
    ["seasonal_printable", ["christmas", "halloween", "valentine", "holiday"]],
    ["printable_card", ["card", "invitation card"]],
    ["home_organization_printable", ["organization", "cleaning schedule", "chore chart"]],
    ["checklist", ["checklist", "planner"]],
    ["wall_art_quote", ["wall art", "quote print", "poster"]],
  ];
  for (const [productType, hints] of categoryHints) {
    if (hints.some((h) => lower.includes(h))) {
      return { productType, entry: CATALOG[productType] as CatalogEntry };
    }
  }
  return { productType: "wall_art_quote", entry: CATALOG.wall_art_quote as CatalogEntry };
}

async function seasonalityScoreFor(keyword: string): Promise<number> {
  const events = await prisma.seasonalEvent.findMany({ where: { active: true } });
  const lower = keyword.toLowerCase();
  const now = Date.now();
  let best = 50;
  for (const event of events) {
    const nameLower = event.name.toLowerCase();
    const mentioned = nameLower.split(/\s+/).some((word) => word.length > 3 && lower.includes(word));
    if (!mentioned) continue;
    const daysUntil = (event.eventDate.getTime() - now) / (1000 * 60 * 60 * 24);
    const withinLeadTime = daysUntil >= 0 && daysUntil <= event.leadTimeDays;
    const score = withinLeadTime ? 90 : daysUntil < 0 ? 30 : 60;
    best = Math.max(best, score);
  }
  return best;
}

/**
 * Scores a keyword into an Opportunity row. Demand/competition come from the
 * (optional) manual hints supplied via the dashboard — Etsy has no public
 * Marketplace Insights API, so this is the supported legal input path (see
 * apps/api's /api/opportunities/keywords). Everything else is computed.
 */
export async function scoreKeywordOpportunity(keywordId: string): Promise<void> {
  const keyword = await prisma.keyword.findUnique({ where: { id: keywordId } });
  if (!keyword) return;

  const { productType, entry } = matchProductType(keyword.keyword);
  const demandScore = keyword.demandScore ?? 50;
  const competitionScore = keyword.competitionScore ?? 50;
  const seasonalityScore = await seasonalityScoreFor(keyword.keyword);

  const ipCheck = checkIpRisk(keyword.keyword, loadEnv().IP_RISK_REJECT_THRESHOLD);
  const marginScore = Math.min(100, Math.round(40 + entry.basePriceUsd * 6)); // higher base price -> higher margin headroom
  const automationSuitability = 95; // catalog is instant-download only, no personalization loop

  const opportunityScore = Math.round(
    demandScore * 0.25 +
      (100 - competitionScore) * 0.15 +
      marginScore * 0.2 +
      automationSuitability * 0.15 +
      seasonalityScore * 0.1 +
      (100 - ipCheck.riskScore) * 0.15,
  );

  let reasoning = `Demand ${demandScore}, competition ${competitionScore}, margin ${marginScore}, IP risk ${ipCheck.riskScore}.`;
  try {
    const prompt = await loadPrompt("trend-research", 1);
    const { text } = await createAiRouter().text.generate({
      systemPrompt: prompt.system,
      userPrompt: renderPromptTemplate(prompt.userTemplate, {
        keyword: keyword.keyword,
        category: entry.category,
        signalsJson: JSON.stringify({ demandScore, competitionScore, marginScore, automationSuitability }),
        seasonalContext: seasonalityScore > 60 ? "Upcoming relevant seasonal window" : "None imminent",
      }),
      tier: "cheap",
      promptVersion: `${prompt.id}@${prompt.version}`,
    });
    reasoning = text;
  } catch (err) {
    log.warn({ err }, "AI rationale generation failed for opportunity — falling back to numeric summary only.");
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      keywordId: keyword.id,
      title: keyword.keyword,
      niche: entry.category,
      productType,
      demandScore,
      competitionScore,
      marginScore,
      automationSuitability,
      seasonalityScore,
      ipRiskScore: ipCheck.riskScore,
      opportunityScore,
      reasoning,
      status: ipCheck.decision === "REJECTED" ? "REJECTED" : "NEW",
    },
  });

  await recordDecision({
    agentName: "trend-scout-agent",
    entityType: "opportunity",
    entityId: opportunity.id,
    action: ipCheck.decision === "REJECTED" ? "reject_opportunity" : "score_opportunity",
    reason: reasoning,
    dataUsed: { demandScore, competitionScore, marginScore, automationSuitability, seasonalityScore, ipRiskScore: ipCheck.riskScore },
    confidenceScore: opportunityScore / 100,
    result: opportunity.status,
  });

  log.info({ keyword: keyword.keyword, opportunityScore, status: opportunity.status }, "Scored opportunity");
}

export { matchProductType };
