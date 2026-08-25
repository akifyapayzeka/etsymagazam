import { describe, expect, it } from "vitest";
import { resolveTaxonomyId } from "./publisher.js";

describe("resolveTaxonomyId", () => {
  it("returns null for an unconfigured category rather than guessing", () => {
    // apps/worker/src/config/etsy-taxonomy.json ships with null placeholders until a human
    // runs scripts/fetch-etsy-taxonomy.ts against their real connected shop.
    expect(resolveTaxonomyId("wedding")).toBeNull();
  });
  it("returns null for an unknown category", () => {
    expect(resolveTaxonomyId("not-a-real-category")).toBeNull();
  });
});
