#!/usr/bin/env tsx
/**
 * Enables conservative live autopilot for the connected shop and seeds
 * enough planner/checklist opportunities for daily publishing.
 *
 * This script deliberately seeds only categories whose taxonomy is configured
 * by scripts/enable-live-autopilot-vps.sh (planner/organization -> Etsy's
 * live Planner Templates category observed from the first published listing).
 */
import { getCanonicalShop, prisma } from "@etsymagazam/database";
import { runDailyPlanning } from "../apps/worker/src/agents/store-director.js";

const STARTER_OPPORTUNITIES: Array<{
  title: string;
  niche: string;
  productType: string;
  demandScore: number;
  competitionScore: number;
  marginScore: number;
  seasonalityScore: number;
  opportunityScore: number;
  reasoning: string;
}> = [
  {
    title: "weekly reset checklist printable",
    niche: "organization",
    productType: "checklist",
    demandScore: 72,
    competitionScore: 42,
    marginScore: 68,
    seasonalityScore: 55,
    opportunityScore: 76,
    reasoning: "Evergreen organization checklist with broad printable demand and low fulfillment complexity.",
  },
  {
    title: "monthly budget planner printable",
    niche: "planner",
    productType: "budget_planner",
    demandScore: 76,
    competitionScore: 50,
    marginScore: 72,
    seasonalityScore: 62,
    opportunityScore: 77,
    reasoning: "Budget planners have recurring monthly demand and fit the configured Planner Templates taxonomy.",
  },
  {
    title: "daily habit tracker printable",
    niche: "planner",
    productType: "checklist",
    demandScore: 73,
    competitionScore: 48,
    marginScore: 65,
    seasonalityScore: 58,
    opportunityScore: 74,
    reasoning: "Habit trackers are evergreen, simple to render, and suitable for instant-download delivery.",
  },
  {
    title: "home cleaning schedule printable",
    niche: "organization",
    productType: "home_organization_printable",
    demandScore: 70,
    competitionScore: 45,
    marginScore: 66,
    seasonalityScore: 54,
    opportunityScore: 73,
    reasoning: "Home organization product with clear buyer intent and low IP risk.",
  },
  {
    title: "meal planning checklist printable",
    niche: "planner",
    productType: "checklist",
    demandScore: 69,
    competitionScore: 44,
    marginScore: 64,
    seasonalityScore: 57,
    opportunityScore: 72,
    reasoning: "Planner-adjacent checklist product suitable for daily automatic generation.",
  },
  {
    title: "moving checklist printable",
    niche: "organization",
    productType: "home_organization_printable",
    demandScore: 71,
    competitionScore: 47,
    marginScore: 66,
    seasonalityScore: 52,
    opportunityScore: 72,
    reasoning: "Practical checklist with concrete use case and straightforward printable design.",
  },
  {
    title: "pet care schedule printable",
    niche: "organization",
    productType: "checklist",
    demandScore: 68,
    competitionScore: 43,
    marginScore: 64,
    seasonalityScore: 53,
    opportunityScore: 71,
    reasoning: "Pet care planners align with the first live product theme while staying generic and low-risk.",
  },
];

async function main() {
  const shop = await getCanonicalShop();
  const runNow = process.argv.includes("--run-now");

  await prisma.autopilotState.upsert({
    where: { shopId: shop.id },
    update: {
      isPaused: false,
      pausedAt: null,
      pausedReason: null,
      autoPublish: true,
      dryRun: false,
      maxProductsPerDay: 2,
      maxProductsPerWeek: 14,
    },
    create: {
      shopId: shop.id,
      isPaused: false,
      autoPublish: true,
      dryRun: false,
      maxProductsPerDay: 2,
      maxProductsPerWeek: 14,
      qaMinScore: 90,
      ipRiskRejectThreshold: 40,
      minPrice: 3.0,
      maxPrice: 45.0,
      maxDailyPriceChange: 1,
    },
  });

  let created = 0;
  for (const opp of STARTER_OPPORTUNITIES) {
    const existing = await prisma.opportunity.findFirst({
      where: { title: opp.title, productType: opp.productType },
    });
    if (existing) continue;

    await prisma.opportunity.create({
      data: {
        ...opp,
        automationSuitability: 95,
        ipRiskScore: 5,
        status: "NEW",
      },
    });
    created += 1;
  }

  const runNowResult = runNow ? await runDailyPlanning(shop.id) : null;

  console.log(
    JSON.stringify(
      {
        ok: true,
        shopId: shop.id,
        etsyShopId: shop.etsyShopId,
        currencyCode: shop.currencyCode,
        autopilot: { isPaused: false, dryRun: false, autoPublish: true, maxProductsPerDay: 2, maxProductsPerWeek: 14 },
        opportunitiesCreated: created,
        runNow: runNowResult,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
