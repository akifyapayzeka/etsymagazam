import { prisma } from "./client.js";

/**
 * Idempotent seed: creates the single Shop row this system manages, its
 * default AutopilotState (paused, DRY_RUN, conservative limits), and a
 * starter seasonal calendar. Safe to re-run.
 */
async function main() {
  const shop = await prisma.shop.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      shopName: null,
      currencyCode: "USD",
      timezone: "Europe/Istanbul",
    },
  });

  await prisma.autopilotState.upsert({
    where: { shopId: shop.id },
    update: {},
    create: {
      shopId: shop.id,
      isPaused: true,
      pausedReason: "Initial setup — connect Etsy and review settings before resuming.",
      autoPublish: false,
      dryRun: true,
      maxProductsPerDay: 3,
      maxProductsPerWeek: 10,
      qaMinScore: 90,
      ipRiskRejectThreshold: 40,
      minPrice: 3.0,
      maxPrice: 45.0,
      maxDailyPriceChange: 1,
    },
  });

  const seasonalEvents: Array<{ name: string; month: number; day: number; leadTimeDays: number; category: string }> = [
    { name: "Valentine's Day", month: 2, day: 14, leadTimeDays: 45, category: "holiday" },
    { name: "Mother's Day (US)", month: 5, day: 11, leadTimeDays: 45, category: "holiday" },
    { name: "Father's Day (US)", month: 6, day: 15, leadTimeDays: 30, category: "holiday" },
    { name: "Wedding Season Peak", month: 6, day: 1, leadTimeDays: 120, category: "wedding" },
    { name: "Back to School", month: 8, day: 15, leadTimeDays: 45, category: "back_to_school" },
    { name: "Halloween", month: 10, day: 31, leadTimeDays: 60, category: "holiday" },
    { name: "Thanksgiving (US)", month: 11, day: 27, leadTimeDays: 45, category: "holiday" },
    { name: "Christmas", month: 12, day: 25, leadTimeDays: 75, category: "holiday" },
    { name: "New Year", month: 1, day: 1, leadTimeDays: 30, category: "holiday" },
    { name: "Graduation Season", month: 5, day: 20, leadTimeDays: 45, category: "graduation" },
  ];

  const year = new Date().getUTCFullYear();
  for (const evt of seasonalEvents) {
    const existing = await prisma.seasonalEvent.findFirst({
      where: { shopId: shop.id, name: evt.name },
    });
    const eventDate = new Date(Date.UTC(year, evt.month - 1, evt.day));
    if (existing) {
      await prisma.seasonalEvent.update({
        where: { id: existing.id },
        data: { eventDate, leadTimeDays: evt.leadTimeDays, category: evt.category },
      });
    } else {
      await prisma.seasonalEvent.create({
        data: {
          shopId: shop.id,
          name: evt.name,
          eventDate,
          leadTimeDays: evt.leadTimeDays,
          category: evt.category,
        },
      });
    }
  }

  console.log(`Seeded shop ${shop.id} with default autopilot state and seasonal calendar.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
