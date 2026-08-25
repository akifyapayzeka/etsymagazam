import type { QaIssue, QaScoreBreakdown } from "./types.js";

export interface QaScoringInput {
  designIssues: QaIssue[];
  technicalIssues: QaIssue[];
  seoIssues: QaIssue[];
  originalityIssues: QaIssue[];
  policyIssues: QaIssue[];
  minPassScore: number;
}

const WEIGHTS = {
  design: 0.2,
  technical: 0.25,
  seo: 0.2,
  originality: 0.15,
  policy: 0.2,
} as const;

/** error -20, warning -8, info -2, floored at 0. */
export function scoreCategory(issues: QaIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "error") score -= 20;
    else if (issue.severity === "warning") score -= 8;
    else score -= 2;
  }
  return Math.max(0, score);
}

/**
 * Combines per-category issue lists into the final QA report. Any
 * error-severity policy issue (IP/trademark risk, Etsy policy violation)
 * hard-fails the product regardless of the weighted average — publishing a
 * flagged design is not a "mostly fine" situation.
 */
export function buildQaReport(input: QaScoringInput): QaScoreBreakdown {
  const designScore = scoreCategory(input.designIssues);
  const technicalScore = scoreCategory(input.technicalIssues);
  const seoScore = scoreCategory(input.seoIssues);
  const originalityScore = scoreCategory(input.originalityIssues);
  const policySafetyScore = scoreCategory(input.policyIssues);

  const overallScore = Math.round(
    designScore * WEIGHTS.design +
      technicalScore * WEIGHTS.technical +
      seoScore * WEIGHTS.seo +
      originalityScore * WEIGHTS.originality +
      policySafetyScore * WEIGHTS.policy,
  );

  const hasPolicyError = input.policyIssues.some((i) => i.severity === "error");
  const hasTechnicalError = input.technicalIssues.some((i) => i.severity === "error");
  const passed = overallScore >= input.minPassScore && !hasPolicyError && !hasTechnicalError;

  return {
    designScore,
    technicalScore,
    seoScore,
    originalityScore,
    policySafetyScore,
    overallScore,
    passed,
    issues: [...input.designIssues, ...input.technicalIssues, ...input.seoIssues, ...input.originalityIssues, ...input.policyIssues],
  };
}
