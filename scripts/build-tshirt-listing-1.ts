#!/usr/bin/env tsx
/**
 * Builds Form & Fern's FIRST t-shirt digital design: "Bloom Where You Are
 * Planted" — a transparent-background typographic PNG for print-on-demand
 * apparel (DTF transfer, heat press, sublimation), not a printable planner.
 *
 * Sample #1 of a planned 5-design t-shirt series (see build-tshirt-listing-2
 * through -5 once this one is approved) — deliberately a single, broadly
 * appealing, evergreen motivational/botanical statement rather than a
 * seasonal or narrow-niche one, matching real Etsy demand research (see
 * WHY_THIS_PRODUCT.json). Uses the new buildTshirtDesignNode template
 * (packages/product-generator/src/templates/tshirt.ts) — transparent
 * background, no bordered box, unlike the existing poster/checklist
 * templates which are built for printable paper goods.
 *
 * Run: pnpm tsx scripts/build-tshirt-listing-1.ts
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Storage } from "@etsymagazam/core";
import { getFeeScheduleMeta } from "@etsymagazam/core";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import {
  buildInfoCardNode,
  buildLicenseText,
  buildTshirtDesignNode,
  buildTshirtMockupPng,
  buildZip,
  loadDefaultTypeFamily,
  LISTING_IMAGE_SIZE,
  rasterizeSvgToPng,
  renderToPng,
  renderToSvg,
  resolvePalette,
} from "@etsymagazam/product-generator";
import {
  buildAiDisclosureText,
  buildQaReport,
  checkImageTechnical,
  checkIpRisk,
  checkPlaceholderLeakage,
  checkZipValidity,
} from "@etsymagazam/qa";
import type { QaIssue } from "@etsymagazam/qa";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "tshirt-live-listing-1");
const WORK_DIR = path.join(REPO_ROOT, "storage", "tshirt-listing-1-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "wildflower";
const PRODUCT_SLUG = "bloom-where-you-are-planted-tshirt-design";
const PRODUCT_TITLE = "Bloom Where You Are Planted PNG | Motivational Botanical T-Shirt Design | Sublimation & DTF Download";

// Standard print-on-demand front-design canvas: 4500x5400px at 300 DPI = 15in x 18in.
const DESIGN_WIDTH_PX = 4500;
const DESIGN_HEIGHT_PX = 5400;
const DESIGN_WIDTH_IN = DESIGN_WIDTH_PX / 300;
const DESIGN_HEIGHT_IN = DESIGN_HEIGHT_PX / 300;

class LocalStorage implements Storage {
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

const designSpec = {
  eyebrow: "GROWTH TAKES TIME",
  phrase: "Bloom Where\nYou Are Planted",
  showDivider: true,
};

const IMPORTANT_INFO_LINES = [
  "This is a digital design file (PNG) for print-on-demand apparel — no physical shirt is included or shipped.",
  "Best results on light or white fabric — this is a single dark-ink design, not a full-color print.",
  "You will need a heat press, DTF printer, sublimation setup, or a print-on-demand service to apply it to fabric.",
  "For personal or small-batch print use — see the included license.txt for details.",
];

async function main() {
  console.log(`Building "${PRODUCT_TITLE}" (${PRODUCT_SLUG})...\n`);
  const storage = new LocalStorage(WORK_DIR);
  const fonts = await loadDefaultTypeFamily();
  const palette = resolvePalette(PALETTE_ID);
  const allTechnicalIssues: QaIssue[] = [];

  // --- 1. Render the actual transparent design PNG -------------------------
  const designNode = buildTshirtDesignNode({ ...designSpec, palette }, DESIGN_WIDTH_PX, DESIGN_HEIGHT_PX);
  const designPng = await renderToPng(designNode, { widthPx: DESIGN_WIDTH_PX, heightPx: DESIGN_HEIGHT_PX, fonts });
  allTechnicalIssues.push(
    ...(await checkImageTechnical({ buffer: designPng, expectedWidthIn: DESIGN_WIDTH_IN, expectedHeightIn: DESIGN_HEIGHT_IN, label: "design PNG (transparent)" })),
  );
  console.log(`1. Rendered design PNG at ${DESIGN_WIDTH_PX}x${DESIGN_HEIGHT_PX}px (${DESIGN_WIDTH_IN}x${DESIGN_HEIGHT_IN}in @ 300 DPI)\n`);

  // --- 2. Customer files: the PNG + instructions + license, zipped ---------
  const designPath = `${PRODUCT_SLUG}/source/${PRODUCT_SLUG}-4500x5400.png`;
  await storage.write(designPath, designPng);

  const instructionsText = `HOW TO USE — ${PRODUCT_TITLE}

1. Unzip the download. Inside is one transparent PNG file at 4500x5400px
   (15 x 18 in) at 300 DPI — full print resolution for a standard adult
   t-shirt front design.
2. Use it with a DTF (direct-to-film) printer, a sublimation printer +
   heat press, an iron-on transfer paper, or upload it directly to a
   print-on-demand service (Printful, Printify, and similar all accept
   transparent PNG uploads).
3. This is a single dark-ink design — it shows up best on light or white
   fabric. It is not recommended for dark/black garments as-is.
4. No physical shirt is included. This is a digital file only.
`;
  const instructionsPath = `${PRODUCT_SLUG}/instructions/how-to-use.txt`;
  await storage.write(instructionsPath, Buffer.from(instructionsText, "utf8"));

  const licenseText = buildLicenseText(PRODUCT_TITLE, BRAND_NAME);
  const licensePath = `${PRODUCT_SLUG}/license.txt`;
  await storage.write(licensePath, Buffer.from(licenseText, "utf8"));

  const zipBuffer = await buildZip([
    { filename: `${PRODUCT_SLUG}-4500x5400.png`, data: designPng },
    { filename: "instructions.txt", data: Buffer.from(instructionsText, "utf8") },
    { filename: "license.txt", data: Buffer.from(licenseText, "utf8") },
  ]);
  const zipPath = `${PRODUCT_SLUG}/source/${PRODUCT_SLUG}-complete-bundle.zip`;
  await storage.write(zipPath, zipBuffer);
  allTechnicalIssues.push(...(await checkZipValidity(zipBuffer, "complete bundle ZIP")));

  const customerFiles = { PDF: [] as string[], PNG: [designPath], SVG: [] as string[], ZIP: [zipPath] };
  const digitalFilesForEtsy = [...customerFiles.ZIP, ...customerFiles.PNG];
  if (digitalFilesForEtsy.length > LISTING_LIMITS.maxDigitalFiles) {
    throw new Error(`Too many digital files for one Etsy listing: ${digitalFilesForEtsy.length} > ${LISTING_LIMITS.maxDigitalFiles}`);
  }
  console.log(`2. Customer bundle written: ZIP + convenience PNG\n`);

  // --- 3. SEO copy ----------------------------------------------------------
  const aiDisclosureLine = buildAiDisclosureText({ usedAiText: true, usedAiImages: false });
  const title = truncate(PRODUCT_TITLE, LISTING_LIMITS.maxTitleLength);
  const description = [
    `A simple, honest reminder in clean, bold typography: "Bloom where you are planted." A transparent PNG design file, ready for DTF, sublimation, heat-press transfer, or your favorite print-on-demand platform.`,
    `What's included:`,
    `- 1 transparent PNG design file at 4500x5400px (15 x 18 in) — full 300 DPI print resolution for a standard adult t-shirt front`,
    `- A short usage guide and personal/small-batch-use license included`,
    `Works great with: DTF printers, sublimation + heat press, iron-on transfer paper, and print-on-demand services like Printful or Printify.`,
    `This is a DIGITAL design file — no physical shirt is included or shipped. Files are delivered instantly after purchase via Etsy.`,
    `Best on light or white fabric — this is a single dark-ink design, not a full-color print.`,
    `For personal or small-batch print use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "tshirt design png",
    "bloom where planted",
    "motivational tshirt",
    "botanical design",
    "sublimation png",
    "dtf design file",
    "plant lover shirt",
    "wildflower design",
    "quote tshirt png",
    "digital tshirt art",
    "instant download",
    "png design file",
    "shirt design",
  ];
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PNG"];
  const attributes = { occasion: "Everyday", style: "Minimalist", recipient: "Adult", color: "Black ink", primaryColor: "Black" };
  const category = "shirt_design_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 3.5; // single-design PNG — priced per market research (typical Etsy digital shirt-design PNGs run $2-5)

  console.log(`3. SEO copy drafted: title (${title.length} chars), ${tags.length} tags, description (${description.length} chars)\n`);

  // --- 4. Listing images (9, 2000x2000) -------------------------------------
  const { widthPx: listingW, heightPx: listingH } = LISTING_IMAGE_SIZE;

  // Images 1-2 are t-shirt SILHOUETTE mockups (sharp-composited, not a
  // satori node) — a shopper must see this is an apparel design, not a
  // paper print, which buildCoverNode's matted-paper-with-shadow look
  // actively misrepresents for this product type.
  const mockupHeather = await buildTshirtMockupPng(designPng, { canvasSize: listingW, shirtFill: "#EDEAE4", palette });
  const mockupSage = await buildTshirtMockupPng(designPng, { canvasSize: listingW, shirtFill: "#F1F4EE", palette: resolvePalette("sage") });
  await storage.write(`${PRODUCT_SLUG}/listing_images/01_mockup_heather.png`, mockupHeather);
  await storage.write(`${PRODUCT_SLUG}/listing_images/02_mockup_sage.png`, mockupSage);
  const mockupImages = [
    { role: "01_mockup_heather", path: `${PRODUCT_SLUG}/listing_images/01_mockup_heather.png`, rank: 1 },
    { role: "02_mockup_sage", path: `${PRODUCT_SLUG}/listing_images/02_mockup_sage.png`, rank: 2 },
  ];
  allTechnicalIssues.push(
    ...(await checkImageTechnical({ buffer: mockupHeather, expectedWidthIn: 1, expectedHeightIn: 1, label: "listing image 01_mockup_heather" })),
    ...(await checkImageTechnical({ buffer: mockupSage, expectedWidthIn: 1, expectedHeightIn: 1, label: "listing image 02_mockup_sage" })),
  );

  const listingImageSpecs: { role: string; node: Awaited<ReturnType<typeof buildInfoCardNode>> }[] = [
    {
      role: "03_whats_included",
      node: buildInfoCardNode(
        {
          title: "What's Included",
          bullets: [
            "1 transparent PNG design file, 4500x5400px (15 x 18 in) at 300 DPI",
            "Ready for DTF, sublimation, heat press, or print-on-demand upload",
            "Usage guide + personal/small-batch license",
            "No physical shirt included — digital file only",
          ],
          palette,
        },
        listingW,
        listingH,
      ),
    },
    {
      role: "04_features_benefits",
      node: buildInfoCardNode(
        {
          badge: "Why This Works",
          title: "Features & Benefits",
          bullets: [
            "Clean, bold typography — no illustration skill needed to use it",
            "Transparent background works on any light-colored fabric",
            "Full print resolution (300 DPI) at standard t-shirt-front size",
            "A simple, evergreen message that isn't tied to a season or trend",
          ],
          palette,
        },
        listingW,
        listingH,
      ),
    },
    {
      role: "05_file_specs",
      node: buildInfoCardNode(
        {
          title: "File Specs",
          bullets: ["4500 x 5400 px (15 x 18 in)", "300 DPI print resolution", "Transparent background PNG"],
          palette,
        },
        listingW,
        listingH,
      ),
    },
    {
      role: "06_how_it_works",
      node: buildInfoCardNode(
        {
          title: "How It Works",
          bullets: ["Purchase this listing and check out.", "Download your ZIP file from Etsy.", "Print via DTF/sublimation/heat press, or upload to your POD platform."],
          palette,
        },
        listingW,
        listingH,
      ),
    },
    {
      role: "07_use_case",
      node: buildInfoCardNode(
        {
          title: "Ways To Use This",
          bullets: [
            "Print on a t-shirt, tote bag, or hoodie",
            "Upload to Printful/Printify for your own print-on-demand shop",
            "A simple, meaningful gift for a plant lover or new-home friend",
            "Use as wall art on its own — it's just a clean PNG file",
          ],
          palette,
        },
        listingW,
        listingH,
      ),
    },
    {
      role: "08_instant_download",
      node: buildInfoCardNode(
        {
          badge: "Instant Download",
          title: "Instant Download",
          bullets: ["Your file is delivered instantly after checkout — no waiting.", "Download from Etsy's 'Purchases and Reviews' page.", "No physical item will be shipped."],
          palette,
        },
        listingW,
        listingH,
      ),
    },
    {
      role: "09_important_info",
      node: buildInfoCardNode({ title: "Good To Know", bullets: IMPORTANT_INFO_LINES, palette }, listingW, listingH),
    },
  ];

  const listingImages: { role: string; path: string; rank: number }[] = [...mockupImages];
  for (const [i, spec] of listingImageSpecs.entries()) {
    const png = await renderToPng(spec.node, { widthPx: listingW, heightPx: listingH, fonts });
    const relPath = `${PRODUCT_SLUG}/listing_images/${spec.role}.png`;
    await storage.write(relPath, png);
    listingImages.push({ role: spec.role, path: relPath, rank: mockupImages.length + i + 1 });
    allTechnicalIssues.push(...(await checkImageTechnical({ buffer: png, expectedWidthIn: 1, expectedHeightIn: 1, label: `listing image ${spec.role}` })));
  }
  console.log(`4. Rendered ${listingImages.length} listing images (2000x2000)\n`);

  // --- 5. QA: technical + IP/policy + SEO + placeholder-leakage ------------
  const allText = [title, description, ...tags, ...materials, designSpec.eyebrow, designSpec.phrase].concat(IMPORTANT_INFO_LINES).join(" | ");
  const ipCheck = checkIpRisk(allText, 10);

  const placeholderIssues = checkPlaceholderLeakage(allText, "all listing + product text");
  const seoIssues: QaIssue[] = [];
  if (title.length > LISTING_LIMITS.maxTitleLength) seoIssues.push({ code: "TITLE_TOO_LONG", severity: "error", message: "Title exceeds Etsy's max length." });
  if (tags.length !== LISTING_LIMITS.maxTags) seoIssues.push({ code: "TAG_COUNT", severity: "error", message: `Expected exactly ${LISTING_LIMITS.maxTags} tags.` });
  if (description.length < 200) seoIssues.push({ code: "DESCRIPTION_TOO_SHORT", severity: "warning", message: "Description is shorter than expected for a full listing." });

  const policyIssues: QaIssue[] = ipCheck.riskScore > 0 ? [{ code: "IP_RISK", severity: ipCheck.decision === "REJECTED" ? "error" : "warning", message: `IP risk score ${ipCheck.riskScore} (${ipCheck.riskLevel}) — matched: ${ipCheck.matchedTerms.map((m) => m.term).join(", ") || "none"}` }] : [];

  const qaReport = buildQaReport({
    designIssues: [],
    technicalIssues: [...allTechnicalIssues, ...placeholderIssues],
    seoIssues,
    originalityIssues: [],
    policyIssues,
    minPassScore: 95,
  });

  console.log(`5. QA — overall score: ${qaReport.overallScore} | passed: ${qaReport.passed} | IP risk: ${ipCheck.riskScore} (${ipCheck.riskLevel})\n`);
  if (!qaReport.passed || ipCheck.riskScore > 10) {
    console.error("QA or IP check did not meet this listing's bar (QA>=95, IP<=10). Issues:");
    console.error(JSON.stringify(qaReport.issues, null, 2));
    process.exit(1);
  }

  // --- 6. Assemble artifacts/tshirt-live-listing-1/ -------------------------
  await mkdir(path.join(OUT_DIR, "customer-download"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "listing-images"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "listing-data"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "qa-report"), { recursive: true });

  await writeFile(path.join(OUT_DIR, "customer-download", `${PRODUCT_SLUG}-complete-bundle.zip`), zipBuffer);
  await writeFile(path.join(OUT_DIR, "customer-download", `${PRODUCT_SLUG}-4500x5400.png`), designPng);

  for (const img of listingImages) {
    const buf = await storage.read(img.path);
    await writeFile(path.join(OUT_DIR, "listing-images", `${img.role}.png`), buf);
  }

  await writeFile(path.join(OUT_DIR, "listing-data", "etsy-title.txt"), title, "utf8");
  await writeFile(path.join(OUT_DIR, "listing-data", "etsy-description.txt"), description, "utf8");
  await writeFile(path.join(OUT_DIR, "listing-data", "etsy-tags.txt"), tags.join("\n"), "utf8");
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-category.txt"),
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6. In Etsy's listing editor, type a description of the actual product — e.g. "t-shirt design png" or "sublimation design" — into the category search field and Etsy will suggest real, current categories live.)\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-price.txt"),
    `${priceUsd.toFixed(2)} (only valid if the connected Etsy shop's currency is USD)\n\nThis figure is a reference price computed in USD. Etsy's price field has no currency parameter on write — it always uses whatever currency the shop itself is set to. Before entering a price:\n1. Check the shop's currency in Etsy Shop Manager > Finances > Payment account (or Settings).\n2. If the shop currency is USD, enter ${priceUsd.toFixed(2)}.\n3. If the shop currency is anything other than USD (e.g. TRY), convert ${priceUsd.toFixed(2)} USD to the shop's currency at a current exchange rate first, then enter that converted amount.\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-attributes.json"),
    JSON.stringify(
      { ...attributes, materials, who_made: "i_did", when_made: "2020_2026", type: "download", quantity: 999, should_auto_renew: true },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(path.join(OUT_DIR, "qa-report", "qa-report.json"), JSON.stringify({ qaReport, ipCheck, feeScheduleMeta: getFeeScheduleMeta() }, null, 2), "utf8");

  console.log(`6. Assembled artifacts at ${path.relative(REPO_ROOT, OUT_DIR)}\n`);
  console.log("Done. QA score:", qaReport.overallScore, "| IP risk:", ipCheck.riskScore, "| Price: $" + priceUsd.toFixed(2));
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + "…";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
