import blocklist from "./config/ip-blocklist.json" with { type: "json" };
import type { IpCheckResult, IpMatchedTerm, IpRiskLevel } from "./types.js";

interface BlocklistTerm {
  term: string;
  category: string;
  weight: number;
}

const TERMS = blocklist.terms as BlocklistTerm[];
const GENERIC_PATTERNS = (blocklist.genericHighRiskPatterns as string[]).map((p) => new RegExp(p, "i"));
const RULESET_VERSION = `ip-blocklist@${blocklist.version}`;

/**
 * Scans arbitrary product text (title, description, tags, design copy) for
 * trademark/IP/policy risk. Combines exact substring matches with fuzzy
 * (edit-distance) matching so close variants/typosquats ("Diisney",
 * "Pokeman") are also caught. Returns a 0-100 risk score; callers reject
 * above IP_RISK_REJECT_THRESHOLD (see .env.example).
 */
export function checkIpRisk(text: string, rejectThreshold: number): IpCheckResult {
  const normalizedText = text.toLowerCase();
  const words = tokenize(normalizedText);
  const matched: IpMatchedTerm[] = [];

  for (const entry of TERMS) {
    const termLower = entry.term.toLowerCase();
    if (normalizedText.includes(termLower)) {
      matched.push({ term: entry.term, category: entry.category, matchType: "exact", confidence: 1 });
      continue;
    }
    const termWords = tokenize(termLower);
    const fuzzyHit = termWords.length === 1 ? findFuzzyMatch(termWords[0] as string, words) : undefined;
    if (fuzzyHit) {
      matched.push({ term: entry.term, category: entry.category, matchType: "fuzzy", confidence: fuzzyHit.confidence });
    }
  }

  for (const pattern of GENERIC_PATTERNS) {
    const hit = pattern.exec(text);
    if (hit) {
      matched.push({ term: hit[0], category: "generic_risk_pattern", matchType: "exact", confidence: 0.8 });
    }
  }

  const riskScore = computeRiskScore(matched);
  const riskLevel = scoreToLevel(riskScore);
  const decision: IpCheckResult["decision"] =
    riskScore >= rejectThreshold ? "REJECTED" : riskScore >= rejectThreshold * 0.6 ? "NEEDS_REVIEW" : "APPROVED";

  return { riskScore, riskLevel, matchedTerms: dedupeMatches(matched), decision, rulesetVersion: RULESET_VERSION };
}

function computeRiskScore(matches: IpMatchedTerm[]): number {
  if (matches.length === 0) return 0;
  const termWeights = new Map<string, number>();
  for (const m of matches) {
    const entry = TERMS.find((t) => t.term === m.term);
    const weight = (entry?.weight ?? 60) * m.confidence;
    termWeights.set(m.term, Math.max(termWeights.get(m.term) ?? 0, weight));
  }
  const strongest = Math.max(...termWeights.values());
  // Multiple distinct risky terms compound the score slightly, capped at 100.
  const extraTerms = termWeights.size - 1;
  return Math.min(100, Math.round(strongest + extraTerms * 3));
}

function scoreToLevel(score: number): IpRiskLevel {
  if (score >= 90) return "CRITICAL";
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  if (score >= 15) return "LOW";
  return "NONE";
}

function dedupeMatches(matches: IpMatchedTerm[]): IpMatchedTerm[] {
  const byTerm = new Map<string, IpMatchedTerm>();
  for (const m of matches) {
    const existing = byTerm.get(m.term);
    if (!existing || m.confidence > existing.confidence) byTerm.set(m.term, m);
  }
  return [...byTerm.values()];
}

function tokenize(text: string): string[] {
  return text.split(/[^a-z0-9]+/i).filter(Boolean);
}

/** Finds the closest word in `words` to `target` by normalized Levenshtein distance, if close enough to be suspicious. */
function findFuzzyMatch(target: string, words: string[]): { confidence: number } | undefined {
  if (target.length < 4) return undefined; // too short to fuzzy-match safely (false positive risk)
  let best = Infinity;
  for (const word of words) {
    if (Math.abs(word.length - target.length) > 2) continue;
    const dist = levenshtein(target, word);
    if (dist < best) best = dist;
  }
  if (best === Infinity) return undefined;
  const maxLen = target.length;
  const similarity = 1 - best / maxLen;
  // Require high similarity (close typo) but not an exact match (already handled above).
  if (similarity >= 0.75 && best > 0 && best <= 2) {
    return { confidence: Math.min(0.95, similarity) };
  }
  return undefined;
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}
