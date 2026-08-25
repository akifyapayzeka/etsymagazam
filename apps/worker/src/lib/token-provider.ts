import { decryptSecret, encryptSecret, loadEnv } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { refreshAccessToken, type AccessTokenProvider } from "@etsymagazam/etsy";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Mirror of apps/api's token provider — kept as small, independent glue code
 * in each process rather than a shared package, since it only wires
 * @etsymagazam/database + @etsymagazam/etsy together.
 *
 * The API and worker are separate processes (and the worker itself runs
 * many concurrent jobs) that can each decide "this token needs refreshing"
 * within the same few milliseconds. Without a lock, more than one would
 * call Etsy's refresh endpoint with the same still-valid refresh token;
 * because Etsy rotates it on use, only one of those calls is safe — the
 * other either gets rejected outright, or races the DB write and can leave
 * the stored token pair as one of the now-invalidated ones. A Postgres
 * transaction-scoped advisory lock, keyed by the shop id, serializes the
 * whole check-refresh-persist sequence across every process sharing this
 * database: a second caller blocks until the first's transaction commits,
 * then re-reads the now-fresh connection instead of refreshing again.
 */
export class PrismaAccessTokenProvider implements AccessTokenProvider {
  async getAccessToken(etsyShopId: string): Promise<string> {
    const shop = await prisma.shop.findUnique({ where: { etsyShopId } });
    if (!shop) throw new Error(`No shop record found for Etsy shop id ${etsyShopId}.`);

    return prisma.$transaction(
      async (tx) => {
        // Transaction-scoped: automatically released on commit/rollback, so
        // a crashed process can never leave this stuck locked.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${shop.id}))`;

        const connection = await tx.etsyConnection.findFirst({
          where: { shopId: shop.id, isActive: true },
          orderBy: { createdAt: "desc" },
        });
        if (!connection) {
          throw new Error(`No active Etsy connection for shop ${etsyShopId}. Complete OAuth in the dashboard first.`);
        }

        // Re-check after acquiring the lock: another process may have
        // already refreshed this exact connection while we were waiting.
        if (Date.now() < connection.expiresAt.getTime() - REFRESH_BUFFER_MS) {
          return decryptSecret(connection.accessTokenEnc);
        }

        const env = loadEnv();
        const refreshToken = decryptSecret(connection.refreshTokenEnc);
        const tokenResponse = await refreshAccessToken({ clientId: env.ETSY_API_KEYSTRING, refreshToken });

        await tx.etsyConnection.update({
          where: { id: connection.id },
          data: {
            accessTokenEnc: encryptSecret(tokenResponse.access_token),
            refreshTokenEnc: encryptSecret(tokenResponse.refresh_token),
            expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
            lastRefreshedAt: new Date(),
          },
        });

        return tokenResponse.access_token;
      },
      // The critical section includes a real network call to Etsy, so give
      // it more room than Prisma's 5s interactive-transaction default.
      { timeout: 15_000, maxWait: 20_000 },
    );
  }
}
