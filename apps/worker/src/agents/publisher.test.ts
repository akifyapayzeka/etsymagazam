import { afterEach, describe, expect, it } from "vitest";
import { resolveTaxonomyId } from "./publisher.js";

describe("resolveTaxonomyId", () => {
  afterEach(() => {
    delete process.env.ETSY_TAXONOMY_IDS;
  });

  it("returns null for an unconfigured category rather than guessing", () => {
    // apps/worker/src/config/etsy-taxonomy.json ships with null placeholders until a human
    // runs scripts/fetch-etsy-taxonomy.ts against their real connected shop.
    expect(resolveTaxonomyId("wedding")).toBeNull();
  });
  it("returns null for an unknown category", () => {
    expect(resolveTaxonomyId("not-a-real-category")).toBeNull();
  });

  it("uses a production taxonomy override from the environment", () => {
    process.env.ETSY_TAXONOMY_IDS = JSON.stringify({ planner: 12476 });
    expect(resolveTaxonomyId("planner")).toBe(12476);
  });
});
