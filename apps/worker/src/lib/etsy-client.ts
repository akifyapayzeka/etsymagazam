import { loadEnv } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { EtsyApiClient } from "@etsymagazam/etsy";
import { PrismaAccessTokenProvider } from "./token-provider.js";

/** Returns a ready-to-use EtsyApiClient for the connected shop, or null if not connected yet. */
export async function getEtsyClientForShop(shopId: string): Promise<EtsyApiClient | null> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop?.etsyShopId) return null;

  const env = loadEnv();
  if (!env.ETSY_API_KEYSTRING || !env.ETSY_SHARED_SECRET) return null;

  return new EtsyApiClient({
    apiKeystring: env.ETSY_API_KEYSTRING,
    sharedSecret: env.ETSY_SHARED_SECRET,
    shopId: shop.etsyShopId,
    tokenProvider: new PrismaAccessTokenProvider(),
  });
}
