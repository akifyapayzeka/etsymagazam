import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.SESSION_SECRET ??= "test-session-secret";
process.env.ETSY_API_KEYSTRING ??= "test-key";
process.env.ETSY_SHARED_SECRET ??= "test-shared-secret";

const CANONICAL_SHOP_ID = "00000000-0000-0000-0000-000000000001";

const findUniqueShop = vi.fn();
const upsertShop = vi.fn();
const updateManyEtsyConnection = vi.fn();
const createEtsyConnection = vi.fn();
const upsertAutopilotState = vi.fn();
const getShopByOwnerUserId = vi.fn();

vi.mock("@etsymagazam/database", () => ({
  CANONICAL_SHOP_ID,
  getCanonicalShop: vi.fn(),
  findCanonicalShop: vi.fn(),
  prisma: {
    shop: { findUnique: findUniqueShop, upsert: upsertShop },
    etsyConnection: { updateMany: updateManyEtsyConnection, create: createEtsyConnection },
    autopilotState: { upsert: upsertAutopilotState },
  },
}));

vi.mock("@etsymagazam/etsy", () => ({
  buildAuthorizeUrl: vi.fn(),
  DEFAULT_OAUTH_SCOPES: ["listings_r"],
  EtsyApiClient: vi.fn().mockImplementation(() => ({
    getShopByOwnerUserId,
  })),
  exchangeCodeForToken: vi.fn().mockResolvedValue({
    access_token: "user_1.access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
  }),
  extractUserIdFromAccessToken: vi.fn(() => "user_1"),
  generatePkcePair: vi.fn(),
  generateState: vi.fn(),
}));

describe("Etsy OAuth callback (integration: single canonical Shop row)", () => {
  beforeEach(() => {
    vi.resetModules();
    findUniqueShop.mockReset();
    upsertShop.mockReset().mockResolvedValue({ id: CANONICAL_SHOP_ID });
    updateManyEtsyConnection.mockReset();
    createEtsyConnection.mockReset();
    upsertAutopilotState.mockReset();
    getShopByOwnerUserId.mockReset();
  });

  async function callback(cookiePayload: { state: string; codeVerifier: string }) {
    const { buildServer } = await import("../apps/api/src/server.js");
    const app = await buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/api/etsy/oauth/callback?code=abc&state=xyz",
      cookies: { etsy_oauth_pkce: JSON.stringify(cookiePayload) },
    });
    await app.close();
    return res;
  }

  it("upserts by the fixed canonical shop id, never by etsyShopId — so first connect can't create a second Shop row", async () => {
    findUniqueShop.mockResolvedValue(null); // no existing row with this etsyShopId
    getShopByOwnerUserId.mockResolvedValue({ shop_id: 999, shop_name: "My Shop", currency_code: "USD" });

    const res = await callback({ state: "xyz", codeVerifier: "verifier" });

    expect(res.statusCode).toBe(302);
    expect(upsertShop).toHaveBeenCalledTimes(1);
    const call = upsertShop.mock.calls[0]![0];
    expect(call.where).toEqual({ id: CANONICAL_SHOP_ID });
    expect(call.create.id).toBe(CANONICAL_SHOP_ID);
    expect(call.create.etsyShopId).toBe("999");
  });

  it("refuses to proceed if this Etsy shop is already linked to a different internal shop row, rather than silently duplicating", async () => {
    findUniqueShop.mockResolvedValue({ id: "some-other-row-id", etsyShopId: "999" });
    getShopByOwnerUserId.mockResolvedValue({ shop_id: 999, shop_name: "My Shop", currency_code: "USD" });

    const res = await callback({ state: "xyz", codeVerifier: "verifier" });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: "shop_id_conflict" });
    expect(upsertShop).not.toHaveBeenCalled();
  });
});
