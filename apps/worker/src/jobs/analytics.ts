import { createLogger } from "@etsymagazam/core";
import { findCanonicalShop } from "@etsymagazam/database";
import { refreshAnalytics } from "../agents/analytics.js";

const log = createLogger("job:analytics");

export async function handleRefreshAnalytics(): Promise<void> {
  const shop = await findCanonicalShop();
  if (!shop?.etsyShopId) return; // not connected yet — nothing to sync
  try {
    await refreshAnalytics(shop.id);
  } catch (err) {
    log.error({ err, shopId: shop.id }, "Analytics refresh failed");
  }
}
