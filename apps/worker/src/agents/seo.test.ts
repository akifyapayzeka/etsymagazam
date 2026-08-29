import { describe, expect, it, vi } from "vitest";

// Forces the AI path to fail so generateSeoCopy falls back to its
// deterministic description — that's the path guaranteed to run even
// without an AI provider configured, so it's the one that must carry the
// brand mention reliably.
vi.mock("@etsymagazam/ai", () => ({
  createAiRouter: () => ({
    text: {
      generate: vi.fn(async () => {
        throw new Error("no AI provider configured (test)");
      }),
    },
  }),
}));

describe("generateSeoCopy fallback description", () => {
  it("credits the given brand name, not the shop's technical Etsy name", async () => {
    const { generateSeoCopy } = await import("./seo.js");
    const seo = await generateSeoCopy({
      productTitle: "Wildflower Wedding Welcome Sign",
      conceptSummary: "A romantic wildflower-themed welcome sign",
      sizesList: ["16x20"],
      fileFormats: ["PDF", "PNG"],
      usedAiImages: false,
      brandName: "Form & Fern",
    });

    expect(seo.usedAi).toBe(false);
    expect(seo.description).toContain("Form & Fern");
  });

  it("reflects a different configured brand name in the same fallback description", async () => {
    const { generateSeoCopy } = await import("./seo.js");
    const seo = await generateSeoCopy({
      productTitle: "Some Product",
      conceptSummary: "summary",
      sizesList: ["16x20"],
      fileFormats: ["PDF"],
      usedAiImages: false,
      brandName: "A Totally Different Brand",
    });

    expect(seo.description).toContain("A Totally Different Brand");
    expect(seo.description).not.toContain("Form & Fern");
  });
});

describe("generateSeoCopy tag sanitization", () => {
  it("hard-cuts an over-length AI-generated tag instead of appending an ellipsis (Etsy rejects '…' with a 400 invalid_characters error)", async () => {
    vi.doMock("@etsymagazam/ai", () => ({
      createAiRouter: () => ({
        text: {
          generate: vi.fn(async () => ({
            text: JSON.stringify({
              title: "Test Product",
              description: "A description long enough to pass the length check for this fallback test case here.",
              tags: ["a valid short tag", "this tag is definitely over twenty characters long"],
              materials: ["Digital File"],
              attributes: {},
            }),
          })),
        },
      }),
    }));
    vi.resetModules();
    const { generateSeoCopy } = await import("./seo.js");

    const seo = await generateSeoCopy({
      productTitle: "Test Product",
      conceptSummary: "summary",
      sizesList: ["16x20"],
      fileFormats: ["PDF"],
      usedAiImages: false,
      brandName: "Form & Fern",
    });

    for (const tag of seo.tags) {
      expect(tag.length).toBeLessThanOrEqual(20);
      expect(tag).not.toContain("…");
    }
  });
});
