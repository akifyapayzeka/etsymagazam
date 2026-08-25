import { describe, expect, it } from "vitest";
import { matchProductType } from "./trend-scout.js";

describe("matchProductType", () => {
  it("matches a wedding welcome sign keyword", () => {
    expect(matchProductType("wildflower wedding welcome sign").productType).toBe("wedding_welcome_sign");
  });
  it("matches a checklist/planner keyword", () => {
    expect(matchProductType("daily habit checklist").productType).toBe("checklist");
  });
  it("falls back to wall art for an unmatched keyword", () => {
    expect(matchProductType("completely unrelated phrase xyz").productType).toBe("wall_art_quote");
  });
});
