import { describe, expect, it } from "vitest";
import { checkIpRisk } from "./ip-guard.js";

describe("checkIpRisk", () => {
  it("approves clean, generic product copy", () => {
    const result = checkIpRisk(
      "Wildflower Wedding Welcome Sign, printable wedding decor for a rustic barn wedding.",
      40,
    );
    expect(result.decision).toBe("APPROVED");
    expect(result.riskScore).toBeLessThan(40);
  });

  it("rejects an exact franchise match", () => {
    const result = checkIpRisk("Disney Frozen Elsa birthday party printable set", 40);
    expect(result.decision).toBe("REJECTED");
    expect(result.matchedTerms.some((m) => m.term === "Disney")).toBe(true);
  });

  it("catches a close typo variant via fuzzy matching", () => {
    const result = checkIpRisk("Cute Pokeman birthday banner printable", 40);
    expect(result.matchedTerms.some((m) => m.term === "Pokemon")).toBe(true);
  });

  it("rejects sports league merchandise references", () => {
    const result = checkIpRisk("NFL game day party printable pack", 40);
    expect(result.decision).toBe("REJECTED");
  });

  it("does not flag common English words one edit away from a short (<5 char) brand name (Nike/like, Elsa/else, Yoda/soda)", () => {
    const result = checkIpRisk("We'd like a soda while we plan updates for the team.", 40);
    expect(result.matchedTerms).toEqual([]);
    expect(result.decision).toBe("APPROVED");
  });
});
