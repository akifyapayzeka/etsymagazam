import { createLogger, getStorage } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { PRINT_SIZES } from "@etsymagazam/product-generator";
import {
  buildQaReport,
  checkIpRisk,
  checkImageTechnical,
  checkPdfValidity,
  checkPlaceholderLeakage,
  checkZipValidity,
  findClosestDuplicate,
  type QaIssue,
} from "@etsymagazam/qa";
import { recordDecision } from "../lib/decisions.js";

const log = createLogger("qa-agent");

export interface QaRunInput {
  productId: string;
  productVersionId: string;
  attempt: number;
  seoTitle: string;
  seoDescription: string;
  seoTags: string[];
  qaMinScore: number;
  ipRiskRejectThreshold: number;
}

export async function runQa(input: QaRunInput) {
  const storage = getStorage();
  const version = await prisma.productVersion.findUniqueOrThrow({ where: { id: input.productVersionId } });
  const metadata = version.metadataJson as { sizes: string[]; coverImageHash?: string | null };
  const customerFiles = version.customerFiles as { PDF: string[]; PNG: string[]; SVG: string[]; ZIP: string[] };

  // --- Technical checks: DPI/aspect ratio on every rendered size, structural validity on PDF/ZIP ---
  const technicalIssues: QaIssue[] = [];
  for (const [i, sizeId] of metadata.sizes.entries()) {
    const size = PRINT_SIZES[sizeId];
    const pngPath = customerFiles.PNG[i];
    if (!size || !pngPath) continue;
    const buffer = await storage.read(pngPath);
    technicalIssues.push(
      ...(await checkImageTechnical({ buffer, expectedWidthIn: size.widthIn, expectedHeightIn: size.heightIn, label: pngPath })),
    );
  }
  for (const pdfPath of customerFiles.PDF) {
    technicalIssues.push(...(await checkPdfValidity(await storage.read(pdfPath), pdfPath)));
  }
  for (const zipPath of customerFiles.ZIP) {
    technicalIssues.push(...(await checkZipValidity(await storage.read(zipPath), zipPath)));
  }
  technicalIssues.push(...checkPlaceholderLeakage(input.seoDescription, "description"));
  technicalIssues.push(...checkPlaceholderLeakage(input.seoTitle, "title"));

  // --- Policy / IP risk on the full text surface (title + description + tags) ---
  const combinedText = [input.seoTitle, input.seoDescription, ...input.seoTags].join(" \n ");
  const ipCheck = checkIpRisk(combinedText, input.ipRiskRejectThreshold);
  const policyIssues: QaIssue[] =
    ipCheck.decision === "REJECTED"
      ? [{ code: "IP_RISK", severity: "error", message: `IP/trademark risk score ${ipCheck.riskScore} (${ipCheck.riskLevel}): ${ipCheck.matchedTerms.map((m) => m.term).join(", ")}`, location: "seo" }]
      : ipCheck.decision === "NEEDS_REVIEW"
        ? [{ code: "IP_RISK_REVIEW", severity: "warning", message: `Borderline IP risk score ${ipCheck.riskScore}`, location: "seo" }]
        : [];

  await prisma.ipCheck.create({
    data: {
      productId: input.productId,
      productVersionId: input.productVersionId,
      riskScore: ipCheck.riskScore,
      riskLevel: ipCheck.riskLevel,
      matchedTerms: ipCheck.matchedTerms as unknown as object,
      decision: ipCheck.decision,
      rulesetVersion: ipCheck.rulesetVersion,
    },
  });

  // --- Originality / duplicate detection against other published versions' cover image hashes ---
  const originalityIssues: QaIssue[] = [];
  if (metadata.coverImageHash) {
    const priorVersions = await prisma.productVersion.findMany({
      where: { id: { not: version.id } },
      select: { id: true, metadataJson: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    const existingHashes = priorVersions
      .map((v) => ({ id: v.id, hash: (v.metadataJson as { coverImageHash?: string })?.coverImageHash }))
      .filter((v): v is { id: string; hash: string } => Boolean(v.hash));
    const dup = findClosestDuplicate(metadata.coverImageHash, existingHashes);
    if (dup) {
      originalityIssues.push({
        code: "DUPLICATE_DESIGN",
        severity: "error",
        message: `Cover design is near-identical (hamming distance ${dup.distance}) to product version ${dup.id}.`,
        location: "cover",
      });
    }
  }

  // --- SEO sanity checks (structure, not the AI's writing quality) ---
  const seoIssues: QaIssue[] = [];
  if (input.seoTags.length !== 13) {
    seoIssues.push({ code: "TAG_COUNT", severity: "warning", message: `Expected 13 tags, got ${input.seoTags.length}.`, location: "tags" });
  }
  if (input.seoTitle.length > 140) {
    seoIssues.push({ code: "TITLE_TOO_LONG", severity: "error", message: `Title is ${input.seoTitle.length} chars (max 140).`, location: "title" });
  }
  if (input.seoDescription.length < 200) {
    seoIssues.push({ code: "DESCRIPTION_TOO_SHORT", severity: "warning", message: "Description is unusually short.", location: "description" });
  }

  // Design score: derived purely from technical contrast/DPI/aspect findings (no separate "design AI critique" call — keeps cost near zero).
  const designIssues = technicalIssues.filter((i) => i.code === "LOW_CONTRAST" || i.code === "ASPECT_RATIO_MISMATCH");
  const strictTechnicalIssues = technicalIssues.filter((i) => !designIssues.includes(i));

  const report = buildQaReport({
    designIssues,
    technicalIssues: strictTechnicalIssues,
    seoIssues,
    originalityIssues,
    policyIssues,
    minPassScore: input.qaMinScore,
  });

  await prisma.qaReport.create({
    data: {
      productId: input.productId,
      productVersionId: input.productVersionId,
      attempt: input.attempt,
      designScore: report.designScore,
      technicalScore: report.technicalScore,
      seoScore: report.seoScore,
      originalityScore: report.originalityScore,
      policySafetyScore: report.policySafetyScore,
      overallScore: report.overallScore,
      passed: report.passed,
      issues: report.issues as unknown as object,
    },
  });

  await recordDecision({
    agentName: "qa-agent",
    entityType: "product",
    entityId: input.productId,
    action: report.passed ? "qa_pass" : "qa_fail",
    reason: report.passed
      ? `Overall score ${report.overallScore} >= threshold ${input.qaMinScore}.`
      : `Overall score ${report.overallScore} or a hard-fail issue (${report.issues.filter((i) => i.severity === "error").map((i) => i.code).join(", ") || "none"}).`,
    dataUsed: { overallScore: report.overallScore, issueCount: report.issues.length },
    confidenceScore: report.overallScore / 100,
    result: report.passed ? "PASSED" : "FAILED",
  });

  log.info({ productId: input.productId, overallScore: report.overallScore, passed: report.passed }, "QA run complete");
  return { report, ipCheck };
}
