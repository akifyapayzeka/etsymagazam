import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="; // 32 bytes, base64, test-only
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";

const findUnique = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const executeRaw = vi.fn();

vi.mock("@etsymagazam/database", () => ({
  prisma: {
    shop: { findUnique },
    etsyConnection: { findFirst, update },
    // The real client's $transaction runs the callback against a `tx`
    // client backed by one Postgres connection so `pg_advisory_xact_lock`
    // actually serializes callers; here it just invokes the callback
    // against the same mocked table methods, since what's under test is
    // the check-refresh-persist logic inside the transaction, not Postgres
    // locking itself (covered by the real DB in the CI integration run).
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $executeRaw: executeRaw, etsyConnection: { findFirst, update } }),
  },
}));

describe("PrismaAccessTokenProvider (integration: token refresh flow)", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findFirst.mockReset();
    update.mockReset();
    executeRaw.mockReset().mockResolvedValue(undefined);
    vi.unstubAllGlobals();
  });

  it("returns the stored access token when it is not close to expiring", async () => {
    const { PrismaAccessTokenProvider } = await import("../apps/api/src/lib/token-provider.js");
    const { encryptSecret } = await import("@etsymagazam/core");

    findUnique.mockResolvedValue({ id: "shop_1", etsyShopId: "999" });
    findFirst.mockResolvedValue({
      id: "conn_1",
      accessTokenEnc: encryptSecret("valid-access-token"),
      refreshTokenEnc: encryptSecret("refresh-token"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h out, well beyond the 5-min refresh buffer
    });

    const provider = new PrismaAccessTokenProvider();
    const token = await provider.getAccessToken("999");

    expect(token).toBe("valid-access-token");
    expect(update).not.toHaveBeenCalled();
  });

  it("refreshes and re-encrypts the token pair when close to expiry", async () => {
    const { PrismaAccessTokenProvider } = await import("../apps/api/src/lib/token-provider.js");
    const { encryptSecret, decryptSecret } = await import("@etsymagazam/core");

    findUnique.mockResolvedValue({ id: "shop_1", etsyShopId: "999" });
    findFirst.mockResolvedValue({
      id: "conn_1",
      accessTokenEnc: encryptSecret("expiring-access-token"),
      refreshTokenEnc: encryptSecret("old-refresh-token"),
      expiresAt: new Date(Date.now() + 60 * 1000), // 1 minute out — inside the 5-min refresh buffer
    });
    update.mockResolvedValue({});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: "brand-new-access-token", refresh_token: "brand-new-refresh-token", expires_in: 3600 }),
          { status: 200 },
        ),
      ),
    );

    const provider = new PrismaAccessTokenProvider();
    const token = await provider.getAccessToken("999");

    expect(token).toBe("brand-new-access-token");
    expect(update).toHaveBeenCalledTimes(1);
    const updateArg = update.mock.calls[0]![0];
    expect(decryptSecret(updateArg.data.accessTokenEnc)).toBe("brand-new-access-token");
    expect(decryptSecret(updateArg.data.refreshTokenEnc)).toBe("brand-new-refresh-token");
  });

  it("throws a clear error when there is no active connection", async () => {
    const { PrismaAccessTokenProvider } = await import("../apps/api/src/lib/token-provider.js");
    findUnique.mockResolvedValue({ id: "shop_1", etsyShopId: "999" });
    findFirst.mockResolvedValue(null);

    const provider = new PrismaAccessTokenProvider();
    await expect(provider.getAccessToken("999")).rejects.toThrow(/No active Etsy connection/);
  });
});
