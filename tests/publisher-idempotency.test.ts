import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.ENCRYPTION_KEY ??= "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
process.env.SESSION_SECRET ??= "test-session-secret";

const findUniqueOrThrowShop = vi.fn();
const findUniqueOrThrowProductVersion = vi.fn();
const upsertPublishState = vi.fn();
const updatePublishState = vi.fn();
const findFirstListing = vi.fn();
const createListing = vi.fn();
const createManyListingAsset = vi.fn();
const createManyDigitalFile = vi.fn();
const updateProduct = vi.fn();
const createAgentDecision = vi.fn();
const createAuditLog = vi.fn();

// In-memory PublishState row so upsert/update behave like the real table
// across the two publishListing() calls this test makes.
let publishStateRow: Record<string, unknown> | null = null;

vi.mock("@etsymagazam/database", () => ({
  prisma: {
    shop: { findUniqueOrThrow: findUniqueOrThrowShop },
    productVersion: { findUniqueOrThrow: findUniqueOrThrowProductVersion },
    publishState: { upsert: upsertPublishState, update: updatePublishState },
    listing: { findFirst: findFirstListing, create: createListing },
    listingAsset: { createMany: createManyListingAsset },
    digitalFile: { createMany: createManyDigitalFile },
    product: { update: updateProduct },
    agentDecision: { create: createAgentDecision },
    auditLog: { create: createAuditLog },
  },
}));

vi.mock("../apps/worker/src/config/etsy-taxonomy.json", () => ({
  default: { categoryToTaxonomyId: { wedding_welcome_sign: 1234 } },
}));

// publishListing reads real files off storage for image/file uploads — stub
// that out so this test only exercises the idempotency state machine, not
// the filesystem.
vi.mock("@etsymagazam/core", async () => {
  const actual = await vi.importActual<typeof import("@etsymagazam/core")>("@etsymagazam/core");
  return {
    ...actual,
    getStorage: () => ({ read: vi.fn(async () => Buffer.from("fake")), write: vi.fn(async () => {}) }),
  };
});

const createDraftListing = vi.fn();
const uploadListingImage = vi.fn();
const uploadListingFile = vi.fn();
const activateListing = vi.fn();

vi.mock("../apps/worker/src/lib/etsy-client.js", () => ({
  getEtsyClientForShop: vi.fn(async () => ({
    createDraftListing,
    uploadListingImage,
    uploadListingFile,
    activateListing,
  })),
}));

describe("publishListing idempotency (integration: retry never creates a second Etsy draft)", () => {
  beforeEach(() => {
    vi.resetModules();
    publishStateRow = null;

    findUniqueOrThrowShop.mockReset().mockResolvedValue({ id: "shop_1", currencyCode: "USD" });
    findUniqueOrThrowProductVersion.mockReset().mockResolvedValue({
      sourceDir: "products/x",
      listingImages: [{ role: "cover", path: "products/x/cover.png", rank: 1 }],
      customerFiles: { PDF: [], PNG: [], SVG: [], ZIP: ["products/x/bundle.zip"] },
    });

    upsertPublishState.mockReset().mockImplementation(async ({ create }: { create: Record<string, unknown> }) => {
      if (!publishStateRow) publishStateRow = { id: "ps_1", status: "PENDING", etsyListingId: null, imagesUploaded: false, filesUploaded: false, activated: false, ...create };
      return publishStateRow;
    });
    updatePublishState.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      publishStateRow = { ...(publishStateRow as Record<string, unknown>), ...data };
      return publishStateRow;
    });

    findFirstListing.mockReset().mockResolvedValue(null);
    createListing.mockReset().mockResolvedValue({ id: "listing_row_1", state: "DRAFT" });
    createManyListingAsset.mockReset();
    createManyDigitalFile.mockReset();
    updateProduct.mockReset();
    createAgentDecision.mockReset();
    createAuditLog.mockReset();

    createDraftListing.mockReset().mockResolvedValue({ listing_id: 555, shop_id: 1 });
    uploadListingImage.mockReset();
    uploadListingFile.mockReset();
    activateListing.mockReset();
  });

  it("does not call createDraftListing again on retry after the draft was already created, even if a later step failed first", async () => {
    // First attempt: listing creation succeeds, then the image upload throws
    // (simulating a crash/network blip between steps).
    uploadListingImage.mockRejectedValueOnce(new Error("network blip"));

    const { publishListing } = await import("../apps/worker/src/agents/publisher.js");
    const baseInput = {
      shopId: "shop_1",
      productId: "product_1",
      productVersionId: "version_1",
      priceUsd: 6.5,
      category: "wedding_welcome_sign",
      seo: { title: "t", description: "d", tags: [], materials: [], attributes: {} } as never,
      dryRun: false,
      autoPublish: false,
    };

    await expect(publishListing(baseInput)).rejects.toThrow("network blip");
    expect(createDraftListing).toHaveBeenCalledTimes(1);
    expect(publishStateRow).toMatchObject({ status: "FAILED", etsyListingId: "555" });

    // Second attempt (the BullMQ retry): image upload now succeeds.
    uploadListingImage.mockResolvedValueOnce({ listing_image_id: 1 });
    const result = await publishListing(baseInput);

    expect(result.status).toBe("published_draft");
    // The crucial assertion: still only ever called once across both attempts.
    expect(createDraftListing).toHaveBeenCalledTimes(1);
    expect(createListing).toHaveBeenCalledTimes(1);
    expect(createListing.mock.calls[0]![0].data.etsyListingId).toBe("555");
  });

  it("returns an idempotent replay result for a publish that already completed, without touching Etsy again", async () => {
    publishStateRow = {
      id: "ps_1",
      status: "COMPLETED",
      etsyListingId: "555",
      imagesUploaded: true,
      filesUploaded: true,
      activated: false,
    };
    findFirstListing.mockResolvedValue({ id: "listing_row_1", state: "DRAFT" });

    const { publishListing } = await import("../apps/worker/src/agents/publisher.js");
    const result = await publishListing({
      shopId: "shop_1",
      productId: "product_1",
      productVersionId: "version_1",
      priceUsd: 6.5,
      category: "wedding_welcome_sign",
      seo: { title: "t", description: "d", tags: [], materials: [], attributes: {} } as never,
      dryRun: false,
      autoPublish: false,
    });

    expect(result.status).toBe("published_draft");
    expect(result.reason).toMatch(/idempotent replay/);
    expect(createDraftListing).not.toHaveBeenCalled();
    expect(uploadListingImage).not.toHaveBeenCalled();
  });
});
