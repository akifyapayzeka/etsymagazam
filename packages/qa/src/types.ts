export interface QaIssue {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  location?: string;
}

export interface QaScoreBreakdown {
  designScore: number;
  technicalScore: number;
  seoScore: number;
  originalityScore: number;
  policySafetyScore: number;
  overallScore: number;
  passed: boolean;
  issues: QaIssue[];
}

export type IpRiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface IpMatchedTerm {
  term: string;
  category: string;
  matchType: "exact" | "fuzzy";
  confidence: number;
}

export interface IpCheckResult {
  riskScore: number;
  riskLevel: IpRiskLevel;
  matchedTerms: IpMatchedTerm[];
  decision: "APPROVED" | "REJECTED" | "NEEDS_REVIEW";
  rulesetVersion: string;
}
