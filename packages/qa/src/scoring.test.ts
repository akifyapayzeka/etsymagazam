import { describe, expect, it } from "vitest";
import { buildQaReport } from "./scoring.js";

describe("buildQaReport", () => {
  it("passes a clean product with a perfect score", () => {
    const report = buildQaReport({
      designIssues: [],
      technicalIssues: [],
      seoIssues: [],
      originalityIssues: [],
      policyIssues: [],
      minPassScore: 90,
    });
    expect(report.overallScore).toBe(100);
    expect(report.passed).toBe(true);
  });

  it("hard-fails on any policy error even if the weighted average would pass", () => {
    const report = buildQaReport({
      designIssues: [],
      technicalIssues: [],
      seoIssues: [],
      originalityIssues: [],
      policyIssues: [{ code: "IP_RISK", severity: "error", message: "Disney reference detected" }],
      minPassScore: 90,
    });
    expect(report.passed).toBe(false);
  });

  it("fails below the configured minimum score", () => {
    const report = buildQaReport({
      designIssues: [{ code: "X", severity: "error", message: "bad" }],
      technicalIssues: [
        { code: "Y", severity: "error", message: "bad" },
        { code: "Z", severity: "error", message: "bad" },
      ],
      seoIssues: [],
      originalityIssues: [],
      policyIssues: [],
      minPassScore: 90,
    });
    expect(report.overallScore).toBeLessThan(90);
    expect(report.passed).toBe(false);
  });
});
