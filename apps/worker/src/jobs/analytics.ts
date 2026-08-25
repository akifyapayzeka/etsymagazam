import { createLogger } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { refreshAnalytics } from "../agents/analytics.js";

const log = createLogger("job:analytics");

export async function handleRefreshAnalytics(): Promise<void> {
  const shops = await prisma.shop.findMany({ where: { etsyShopId: { not: null } } });
  for (const shop of shops) {
    try {
      await refreshAnalytics(shop.id);
    } catch (err) {
      log.error({ err, shopId: shop.id }, "Analytics refresh failed");
    }
  }
}
