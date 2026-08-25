#!/usr/bin/env tsx
/**
 * First end-to-end product pipeline test (see docs/AUTOPILOT.md #42).
 *
 * Runs the full CONTENT pipeline for one real sample product — research
 * concept -> deterministic design/layout -> real customer files (PDF/PNG/
 * SVG/ZIP) -> real listing images -> AI SEO copy -> QA -> IP/policy check
 * -> price recommendation -> the exact Etsy API payload that *would* be
 * sent — without needing Postgres/Redis running and without ever calling
 * the real Etsy API. This is intentionally infra-free: it's the fast way
 * to sanity-check the whole content pipeline before wiring up the database
 * and worker queues.
 *
 * Run: pnpm pipeline:dry-run
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createAiRouter } from "@etsymagazam/ai";
import { getFeeScheduleMeta, loadPrompt, renderPromptTemplate, type Storage } from "@etsymagazam/core";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import { PRINT_SIZES, ProductPackageBuilder } from "@etsymagazam/product-generator";
import {
  buildAiDisclosureText,
  buildQaReport,
  checkIpRisk,
  checkImageTechnical,
  checkPdfValidity,
  checkPlaceholderLeakage,
  checkZipValidity,
} from "@etsymagazam/qa";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "storage", "pipeline-test");

class LocalScriptStorage implements Storage {
  constructor(private readonly root: string) {}
  async write(relativePath: string, data: Buffer): Promise<string> {
    const full = path.join(this.root, relativePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return relativePath;
  }
  async read(relativePath: string): Promise<Buffer> {
    return readFile(path.join(this.root, relativePath));
  }
  async resolveUrl(relativePath: string): Promise<string> {
    return path.join(this.root, relativePath);
  }
}

async function main() {
  console.log("=== Etsy AI Autopilot — first pipeline test (DRY_RUN, infra-free) ===\n");

  // --- 1. Opportunity (the example from the spec itself) ---
  const opportunity = {
    title: "Wildflower Wedding Welcome Sign",
    niche: "wedding",
    productType: "wedding_welcome_sign",
    demandScore: 87,
    competitionScore: 54,
    marginScore: 95,
    automationSuitability: 97,
    seasonalityScore: 78,
  };
  const ipRiskCheck = checkIpRisk(opportunity.title, 40);
  const opportunityScore = Math.round(
    opportunity.demandScore * 0.25 +
      (100 - opportunity.competitionScore) * 0.15 +
      opportunity.marginScore * 0.2 +
      opportunity.automationSuitability * 0.15 +
      opportunity.seasonalityScore * 0.1 +
      (100 - ipRiskCheck.riskScore) * 0.15,
  );
  console.log("1. Opportunity:", opportunity.title);
  console.log(`   Opportunity Score: ${opportunityScore}/100 (IP Risk: ${ipRiskCheck.riskScore}/100 — ${ipRiskCheck.riskLevel})\n`);

  // --- 2. Product concept (AI ideation prompt; runs against the mock provider unless real API keys are configured) ---
  const ideationPrompt = await loadPrompt("product-ideation", 1);
  const ai = createAiRouter();
  const conceptResult = await ai.text.generate({
    systemPrompt: ideationPrompt.system,
    userPrompt: renderPromptTemplate(ideationPrompt.userTemplate, {
      opportunityTitle: opportunity.title,
      niche: opportunity.niche,
      productType: opportunity.productType,
      styleHint: "",
    }),
    tier: "cheap",
    jsonMode: true,
    promptVersion: `${ideationPrompt.id}@${ideationPrompt.version}`,
  });

  const concept = {
    title: "Sarah & James — Wildflower Wedding Welcome Sign",
    eyebrow: "Welcome to the wedding of",
    subtitle: "June 14, 2026 · Willow Creek Barn",
    bodyLines: ["Please sign our guestbook", "and join us for the celebration"],
    footer: "With love",
    suggestedSizes: ["2x3", "4x5", "a_series"],
    suggestedPaletteId: "wildflower",
  };
  console.log("2. Product concept drafted (AI provider:", conceptResult.provider, "— cost $" + conceptResult.costUsd.toFixed(5) + ")\n");

  // --- 3. Real customer files + listing images (fully deterministic layout/typography) ---
  const storage = new LocalScriptStorage(OUTPUT_DIR);
  const builder = new ProductPackageBuilder(storage);
  const manifest = await builder.build({
    productSlug: "wildflower-wedding-welcome-sign-pipeline-test",
    productTitle: concept.title,
    brandName: "Form & Fern",
    templateType: "poster",
    paletteId: concept.suggestedPaletteId,
    posterContent: {
      eyebrow: concept.eyebrow,
      title: concept.title,
      subtitle: concept.subtitle,
      bodyLines: concept.bodyLines,
      footer: concept.footer,
    },
    sizeIds: concept.suggestedSizes,
  });
  console.log("3. Generated real product files at", path.join(OUTPUT_DIR, manifest.productDir));
  console.log(`   ${manifest.customerFiles.PNG.length} PNGs, ${manifest.customerFiles.PDF.length} PDF, ${manifest.customerFiles.ZIP.length} ZIP, ${manifest.listingImages.length} listing images\n`);

  // --- 4. SEO copy ---
  const seoPrompt = await loadPrompt("seo-copywriting", 2);
  const aiDisclosureLine = buildAiDisclosureText({ usedAiText: true, usedAiImages: false });
  const seoResult = await ai.text.generate({
    systemPrompt: seoPrompt.system,
    userPrompt: renderPromptTemplate(seoPrompt.userTemplate, {
      productTitle: concept.title,
      conceptSummary: `${concept.eyebrow} — ${concept.subtitle}`,
      sizesList: concept.suggestedSizes.join(", "),
      fileFormats: "PDF, PNG, SVG",
      aiDisclosureLine,
      brandName: "Form & Fern",
    }),
    tier: "cheap",
    jsonMode: true,
    promptVersion: `${seoPrompt.id}@${seoPrompt.version}`,
  });

  const fallbackSeo = {
    title: concept.title.slice(0, LISTING_LIMITS.maxTitleLength),
    description: `${concept.title} — a printable digital download.\n\n${aiDisclosureLine}`,
    tags: ["printable", "wedding sign", "instant download", "digital download", "wedding decor"],
  };
  let seo: { title: string; description: string; tags: string[] } = fallbackSeo;
  try {
    const parsed = JSON.parse(seoResult.text) as Partial<typeof fallbackSeo>;
    if (parsed.title && parsed.description && Array.isArray(parsed.tags)) {
      seo = { title: parsed.title, description: parsed.description, tags: parsed.tags };
    }
  } catch {
    // fall through to fallbackSeo — the mock/AI provider didn't return the expected shape
  }
  console.log("4. SEO copy drafted:", JSON.stringify({ title: seo.title, tagCount: seo.tags.length }), "\n");

  // --- 5. QA ---
  const technicalIssues = [];
  for (const pdfPath of manifest.customerFiles.PDF) {
    technicalIssues.push(...(await checkPdfValidity(await storage.read(pdfPath), pdfPath)));
  }
  for (const zipPath of manifest.customerFiles.ZIP) {
    technicalIssues.push(...(await checkZipValidity(await storage.read(zipPath), zipPath)));
  }
  for (const [i, sizeId] of concept.suggestedSizes.entries()) {
    const size = PRINT_SIZES[sizeId];
    const pngPath = manifest.customerFiles.PNG[i];
    if (!size || !pngPath) continue;
    technicalIssues.push(
      ...(await checkImageTechnical({
        buffer: await storage.read(pngPath),
        expectedWidthIn: size.widthIn,
        expectedHeightIn: size.heightIn,
        label: pngPath,
      })),
    );
  }
  technicalIssues.push(...checkPlaceholderLeakage(seo.description, "description"));

  const combinedText = [seo.title, seo.description, ...seo.tags].join(" ");
  const finalIpCheck = checkIpRisk(combinedText, 40);

  const qaReport = buildQaReport({
    designIssues: [],
    technicalIssues,
    seoIssues: seo.tags.length !== 13 ? [{ code: "TAG_COUNT", severity: "warning", message: "Not exactly 13 tags in this test run." }] : [],
    originalityIssues: [],
    policyIssues:
      finalIpCheck.decision === "REJECTED"
        ? [{ code: "IP_RISK", severity: "error", message: `Risk score ${finalIpCheck.riskScore}` }]
        : [],
    minPassScore: 90,
  });
  console.log("5. QA report — overall score:", qaReport.overallScore, "| passed:", qaReport.passed, "| IP risk:", finalIpCheck.riskScore, "\n");

  // --- 6. Price recommendation ---
  const basePriceUsd = 6.5; // wedding_welcome_sign category base (apps/worker/src/config/product-catalog.json)
  const bundleMultiplier = 1 + (concept.suggestedSizes.length - 1) * 0.08;
  const priceUsd = Math.round(basePriceUsd * bundleMultiplier * 100) / 100;
  console.log("6. Price recommendation: $" + priceUsd, `(fee schedule v${getFeeScheduleMeta().version}, last verified ${getFeeScheduleMeta().lastVerified})\n`);

  // --- 7. The exact payload that WOULD be sent to Etsy (never actually sent by this script) ---
  const intendedPayload = {
    title: seo.title,
    description: seo.description,
    price: priceUsd,
    tags: seo.tags,
    type: "download",
    who_made: "i_did",
    when_made: "made_to_order",
    listingImages: manifest.listingImages.map((i) => i.path),
    digitalFiles: [...manifest.customerFiles.ZIP, ...manifest.customerFiles.PDF],
  };
  const summaryPath = path.join(OUTPUT_DIR, manifest.productDir, "pipeline-test-summary.json");
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(
    summaryPath,
    JSON.stringify({ opportunity, opportunityScore, concept, seo, qaReport, ipCheck: finalIpCheck, priceUsd, intendedPayload }, null, 2),
  );

  console.log("7. DRY_RUN — nothing was sent to Etsy. Full summary written to:");
  console.log("   " + summaryPath);
  console.log("\n=== Pipeline test complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
