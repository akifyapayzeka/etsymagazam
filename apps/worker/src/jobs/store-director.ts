import { prisma } from "@etsymagazam/database";
import { runDailyPlanning } from "../agents/store-director.js";

export async function handleDailyPlanning(): Promise<void> {
  const shops = await prisma.shop.findMany({ where: { etsyShopId: { not: null } } });
  for (const shop of shops) {
    await runDailyPlanning(shop.id);
  }
}
