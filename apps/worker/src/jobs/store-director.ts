import { findCanonicalShop } from "@etsymagazam/database";
import { runDailyPlanning } from "../agents/store-director.js";

export async function handleDailyPlanning(): Promise<void> {
  const shop = await findCanonicalShop();
  if (!shop?.etsyShopId) return; // not connected yet — nothing to plan
  await runDailyPlanning(shop.id);
}
