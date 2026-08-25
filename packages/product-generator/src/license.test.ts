import { describe, expect, it } from "vitest";
import { buildLicenseText } from "./license.js";

describe("buildLicenseText", () => {
  it("embeds the given brand name as the byline and copyright holder", () => {
    const text = buildLicenseText("Wildflower Wedding Welcome Sign", "Form & Fern");
    expect(text).toContain("Form & Fern");
    expect(text).toMatch(/copyright of Form & Fern/);
  });

  it("never hardcodes a brand string — a different brandName produces different output", () => {
    const textA = buildLicenseText("Some Product", "Form & Fern");
    const textB = buildLicenseText("Some Product", "A Totally Different Brand");
    expect(textA).not.toBe(textB);
    expect(textA).not.toContain("A Totally Different Brand");
    expect(textB).not.toContain("Form & Fern");
  });
});
