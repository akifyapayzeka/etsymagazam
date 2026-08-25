import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.SESSION_SECRET ??= "test-session-secret";

const findUniqueShop = vi.fn();
const findUniqueOrThrowShop = vi.fn();
const findUniqueOrThrowProductVersion = vi.fn();
const createAgentDecision = vi.fn();
const createAuditLog = vi.fn();

vi.mock("@etsymagazam/database", () => ({
  prisma: {
    shop: { findUnique: findUniqueShop, findUniqueOrThrow: findUniqueOrThrowShop },
    productVersion: { findUniqueOrThrow: findUniqueOrThrowProductVersion },
    agentDecision: { create: createAgentDecision },
    auditLog: { create: createAuditLog },
  },
}));

// This test's category needs a real (non-null) taxonomy id so the currency
// check — not the unrelated taxonomy gate — is what's under test here.
vi.mock("../apps/worker/src/config/etsy-taxonomy.json", () => ({
  default: { categoryToTaxonomyId: { wedding_welcome_sign: 1234 } },
}));

describe("publishListing currency safety (integration: FX hard-block)", () => {
  beforeEach(() => {
    vi.resetModules();
    findUniqueShop.mockReset();
    findUniqueOrThrowShop.mockReset();
    findUniqueOrThrowProductVersion.mockReset();
    createAgentDecision.mockReset();
    createAuditLog.mockReset();
    delete process.env.FX_STATIC_RATES;
  });

  afterEach(() => {
    delete process.env.FX_STATIC_RATES;
  });

  it("blocks publishing to a non-USD shop with no configured FX rate, before touching the product version or Etsy", async () => {
    findUniqueOrThrowShop.mockResolvedValue({ id: "shop_1", currencyCode: "TRY" });

    const { publishListing } = await import("../apps/worker/src/agents/publisher.js");
    const result = await publishListing({
      shopId: "shop_1",
      productId: "product_1",
      productVersionId: "version_1",
      priceUsd: 6.5,
      category: "wedding_welcome_sign",
      seo: { title: "t", description: "d", tags: [], materials: [], attributes: {} } as never,
      dryRun: true,
      autoPublish: false,
    });

    expect(result.status).toBe("blocked");
    expect(result.reason).toMatch(/TRY/);
    expect(findUniqueOrThrowProductVersion).not.toHaveBeenCalled();
    expect(createAgentDecision).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "publish_blocked_currency_mismatch" }),
    });
  });

  it("allows publishing to a non-USD shop once a static FX rate is configured", async () => {
    process.env.FX_STATIC_RATES = '{"EUR":0.92}';
    findUniqueOrThrowShop.mockResolvedValue({ id: "shop_1", currencyCode: "EUR" });
    findUniqueOrThrowProductVersion.mockResolvedValue({
      sourceDir: "products/x",
      listingImages: [],
      customerFiles: { PDF: [], PNG: [], SVG: [], ZIP: [] },
    });

    const { publishListing } = await import("../apps/worker/src/agents/publisher.js");
    const result = await publishListing({
      shopId: "shop_1",
      productId: "product_1",
      productVersionId: "version_1",
      priceUsd: 10,
      category: "wedding_welcome_sign",
      seo: { title: "t", description: "d", tags: [], materials: [], attributes: {} } as never,
      dryRun: true,
      autoPublish: false,
    });

    expect(result.status).toBe("dry_run");
    expect(createAgentDecision).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "dry_run_publish",
        dataUsed: expect.objectContaining({ shopCurrencyCode: "EUR", priceInShopCurrency: 9.2 }),
      }),
    });
  });
});
