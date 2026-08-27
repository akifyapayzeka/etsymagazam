import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";

const getCanonicalShop = vi.fn();
const findUniqueOrThrowOpportunity = vi.fn();
const updateOpportunity = vi.fn();
const createProduct = vi.fn();
const updateProduct = vi.fn();
const createAgentDecision = vi.fn();
const canGenerateMore = vi.fn();
const draftProductConcept = vi.fn();
const createProductVersion = vi.fn();
const generateSeoCopy = vi.fn();
const bumpDailyAutopilotCounter = vi.fn();
const queueAdd = vi.fn();

vi.mock("@etsymagazam/database", () => ({
  getCanonicalShop,
  prisma: {
    opportunity: { findUniqueOrThrow: findUniqueOrThrowOpportunity, update: updateOpportunity },
    product: { create: createProduct, update: updateProduct },
    agentDecision: { create: createAgentDecision },
    productVersion: { update: vi.fn() },
  },
}));

vi.mock("../apps/worker/src/agents/store-director.js", () => ({ canGenerateMore }));
vi.mock("../apps/worker/src/agents/product-strategy.js", () => ({ draftProductConcept }));
vi.mock("../apps/worker/src/agents/product-creator.js", () => ({
  createProductVersion,
  slugify: (title: string, suffix: string) => `${title.toLowerCase().replace(/\s+/g, "-")}-${suffix}`,
}));
vi.mock("../apps/worker/src/agents/seo.js", () => ({ generateSeoCopy }));
vi.mock("../apps/worker/src/agents/finance.js", () => ({ bumpDailyAutopilotCounter }));
vi.mock("../apps/worker/src/lib/queues.js", () => ({ getQueue: () => ({ add: queueAdd }) }));

describe("Product generation job: placeholder/fallback-concept guard", () => {
  beforeEach(() => {
    getCanonicalShop.mockReset().mockResolvedValue({ id: "shop_1" });
    findUniqueOrThrowOpportunity.mockReset().mockResolvedValue({ id: "opp_1", title: "weekly reset checklist printable", niche: "organization", productType: "checklist" });
    updateOpportunity.mockReset();
    createProduct.mockReset();
    updateProduct.mockReset();
    createAgentDecision.mockReset();
    canGenerateMore.mockReset().mockResolvedValue({ allowed: true });
    draftProductConcept.mockReset();
    createProductVersion.mockReset();
    generateSeoCopy.mockReset();
    bumpDailyAutopilotCounter.mockReset();
    queueAdd.mockReset();
  });

  it("refuses to create a product from the deterministic fallback concept (literal 'Item one'/'Item two'/'Item three')", async () => {
    const { handleGenerateProduct } = await import("../apps/worker/src/jobs/product-generation.js");
    draftProductConcept.mockResolvedValue({
      title: "Weekly Reset Checklist Printable",
      eyebrow: null,
      subtitle: null,
      bodyLines: ["Item one", "Item two", "Item three"],
      footer: null,
      suggestedSizes: ["a_series"],
      suggestedPaletteId: "wildflower",
      templateType: "checklist",
    });

    await handleGenerateProduct({ opportunityId: "opp_1" });

    expect(createProduct).not.toHaveBeenCalled();
    expect(createProductVersion).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
    expect(updateOpportunity).toHaveBeenCalledWith({ where: { id: "opp_1" }, data: { status: "NEW" } });
  });

  it("proceeds normally when the concept has real, non-placeholder content", async () => {
    const { handleGenerateProduct } = await import("../apps/worker/src/jobs/product-generation.js");
    draftProductConcept.mockResolvedValue({
      title: "Weekly Reset Checklist Printable",
      eyebrow: null,
      subtitle: null,
      bodyLines: ["Wiped down every kitchen counter", "Sorted the mail pile", "Ran one load of laundry"],
      footer: null,
      suggestedSizes: ["a_series"],
      suggestedPaletteId: "wildflower",
      templateType: "checklist",
    });
    createProduct.mockResolvedValue({ id: "prod_1", slug: "weekly-reset-checklist" });
    createProductVersion.mockResolvedValue({ id: "ver_1", versionNumber: 1 });
    generateSeoCopy.mockResolvedValue({ usedAi: true });

    await handleGenerateProduct({ opportunityId: "opp_1" });

    expect(createProduct).toHaveBeenCalledTimes(1);
    expect(createProductVersion).toHaveBeenCalledTimes(1);
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(updateOpportunity).not.toHaveBeenCalled();
  });
});
