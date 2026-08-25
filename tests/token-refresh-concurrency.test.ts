import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.DATABASE_URL ??= "postgresql://etsy_autopilot:ci_password@localhost:5432/etsy_autopilot";
process.env.REDIS_URL ??= "redis://localhost:6379";

/**
 * Uses the REAL Postgres connection (no prisma mock) so this actually
 * exercises pg_advisory_xact_lock, not just the surrounding TypeScript
 * logic — that's the only way to prove the lock genuinely serializes two
 * concurrent processes racing to refresh the same rotating Etsy token,
 * which is exactly the bug being regression-tested here.
 */
describe("PrismaAccessTokenProvider concurrency (integration: real Postgres advisory lock)", () => {
  let shopId: string;
  let etsyShopId: string;
  let refreshCallCount = 0;

  beforeEach(async () => {
    const { prisma } = await import("@etsymagazam/database");
    etsyShopId = `concurrency-test-${randomUUID()}`;
    const shop = await prisma.shop.create({ data: { etsyShopId, currencyCode: "USD" } });
    shopId = shop.id;

    const { encryptSecret } = await import("@etsymagazam/core");
    await prisma.etsyConnection.create({
      data: {
        shopId,
        isActive: true,
        accessTokenEnc: encryptSecret("stale-access-token"),
        refreshTokenEnc: encryptSecret("stale-refresh-token"),
        // inside the 5-minute refresh buffer, so both concurrent callers see it as needing a refresh
        expiresAt: new Date(Date.now() + 60 * 1000),
      },
    });

    refreshCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        refreshCallCount += 1;
        // simulate real network latency, wide enough that two racing calls
        // would overlap if the lock weren't actually serializing them
        await new Promise((resolve) => setTimeout(resolve, 150));
        return new Response(
          JSON.stringify({ access_token: `fresh-access-token-${refreshCallCount}`, refresh_token: `fresh-refresh-token-${refreshCallCount}`, expires_in: 3600 }),
          { status: 200 },
        );
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { prisma } = await import("@etsymagazam/database");
    await prisma.etsyConnection.deleteMany({ where: { shopId } });
    await prisma.shop.delete({ where: { id: shopId } });
  });

  it("serializes two concurrent getAccessToken calls so Etsy's refresh endpoint is only hit once", async () => {
    const { PrismaAccessTokenProvider } = await import("../apps/api/src/lib/token-provider.js");
    const providerA = new PrismaAccessTokenProvider();
    const providerB = new PrismaAccessTokenProvider();

    const [tokenA, tokenB] = await Promise.all([providerA.getAccessToken(etsyShopId), providerB.getAccessToken(etsyShopId)]);

    expect(refreshCallCount).toBe(1);
    expect(tokenA).toBe(tokenB);
    expect(tokenA).toBe("fresh-access-token-1");

    const { prisma } = await import("@etsymagazam/database");
    const connections = await prisma.etsyConnection.findMany({ where: { shopId } });
    expect(connections).toHaveLength(1);
  }, 20_000);
});
