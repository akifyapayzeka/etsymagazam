import { describe, expect, it } from "vitest";
import { estimateImageCost, estimateTextCost } from "./cost.js";
import { MockTextGenerator } from "./providers/mock.js";

describe("cost estimation", () => {
  it("computes text cost from token counts using the pricing table", () => {
    const cost = estimateTextCost("openai", "gpt-4o-mini", 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.15 + 0.6, 5);
  });

  it("returns 0 for an unknown model instead of throwing", () => {
    expect(estimateTextCost("openai", "not-a-real-model", 1000, 1000)).toBe(0);
  });

  it("computes image cost per unit", () => {
    expect(estimateImageCost("openai", "gpt-image-1", 3)).toBeCloseTo(0.12, 5);
  });
});

describe("MockTextGenerator", () => {
  it("is deterministic for the same prompt", async () => {
    const gen = new MockTextGenerator();
    const a = await gen.generate({ userPrompt: "hello world", tier: "cheap" });
    const b = await gen.generate({ userPrompt: "hello world", tier: "cheap" });
    expect(a.text).toBe(b.text);
    expect(a.costUsd).toBe(0);
  });
});
