import { decryptSecret, encryptSecret, loadEnv } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { refreshAccessToken, type AccessTokenProvider } from "@etsymagazam/etsy";

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before actual expiry

/**
 * Resolves a valid Etsy access token for a given Etsy shop id, transparently
 * refreshing (and re-persisting, encrypted) when close to expiry. Etsy
 * rotates the refresh token on every use, so both tokens are re-encrypted
 * and saved together.
 */
export class PrismaAccessTokenProvider implements AccessTokenProvider {
  async getAccessToken(etsyShopId: string): Promise<string> {
    const shop = await prisma.shop.findUnique({ where: { etsyShopId } });
    if (!shop) throw new Error(`No shop record found for Etsy shop id ${etsyShopId}.`);

    const connection = await prisma.etsyConnection.findFirst({
      where: { shopId: shop.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (!connection) {
      throw new Error(
        `No active Etsy connection for shop ${etsyShopId}. The OAuth authorization needs to be (re)completed — see docs/ETSY_SETUP.md.`,
      );
    }

    const expiresAt = connection.expiresAt.getTime();
    if (Date.now() < expiresAt - REFRESH_BUFFER_MS) {
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
