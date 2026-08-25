import { decryptSecret, encryptSecret, loadEnv } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { refreshAccessToken, type AccessTokenProvider } from "@etsymagazam/etsy";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** Mirror of apps/api's token provider — kept as small, independent glue code in each process rather than a shared package, since it only wires @etsymagazam/database + @etsymagazam/etsy together. */
export class PrismaAccessTokenProvider implements AccessTokenProvider {
  async getAccessToken(etsyShopId: string): Promise<string> {
    const shop = await prisma.shop.findUnique({ where: { etsyShopId } });
    if (!shop) throw new Error(`No shop record found for Etsy shop id ${etsyShopId}.`);

    const connection = await prisma.etsyConnection.findFirst({
      where: { shopId: shop.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (!connection) {
      throw new Error(`No active Etsy connection for shop ${etsyShopId}. Complete OAuth in the dashboard first.`);
    }

    if (Date.now() < connection.expiresAt.getTime() - REFRESH_BUFFER_MS) {
      return decryptSecret(connection.accessTokenEnc);
    }

    const env = loadEnv();
    const refreshToken = decryptSecret(connection.refreshTokenEnc);
    const tokenResponse = await refreshAccessToken({ clientId: env.ETSY_API_KEYSTRING, refreshToken });

    await prisma.etsyConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEnc: encryptSecret(tokenResponse.access_token),
        refreshTokenEnc: encryptSecret(tokenResponse.refresh_token),
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
        lastRefreshedAt: new Date(),
      },
    });

    return tokenResponse.access_token;
  }
}
