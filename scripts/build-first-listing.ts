#!/usr/bin/env tsx
/**
 * Builds Form & Fern's first REAL, sellable Etsy digital product end to end
 * and assembles the manual-publish package at artifacts/first-live-listing/.
 *
 * This is a deliberate one-off script, not a new autopilot code path: the
 * shop isn't ACTIVE on Etsy yet, so the very first listing must be
 * published by a human through the Etsy Shop Manager UI (see
 * ETSY_FIRST_LISTING_STEPS.md in the output). It reuses the exact same
 * deterministic rendering primitives the autopilot pipeline uses
 * (packages/product-generator — satori + resvg + pdf-lib, no AI in layout
 * or typography, ever) and the exact same QA/IP-guard modules
 * (packages/qa), just orchestrated by hand for a 5-page bundle instead of
 * the single-design ProductPackageBuilder wrapper.
 *
 * Run: pnpm tsx scripts/build-first-listing.ts
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Storage } from "@etsymagazam/core";
import { getFeeScheduleMeta } from "@etsymagazam/core";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import {
  buildChecklistNode,
  buildCoverNode,
  buildInfoCardNode,
  buildLicenseText,
  buildPdf,
  buildPosterNode,
  buildZip,
  loadDefaultTypeFamily,
  LISTING_IMAGE_SIZE,
  pixelDimensions,
  PRINT_SIZES,
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
  checkPdfValidity,
  checkPlaceholderLeakage,
  checkZipValidity,
} from "@etsymagazam/qa";
import type { QaIssue } from "@etsymagazam/qa";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "first-live-listing");
/** Scratch working directory for intermediate renders — kept outside artifacts/ so the final deliverable only contains the curated, documented folders below. */
const WORK_DIR = path.join(REPO_ROOT, "storage", "first-listing-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "sage";
const PRODUCT_SLUG = "333-rescue-dog-decompression-tracker";
const PRODUCT_TITLE = "The 3-3-3 Rescue Dog Decompression Tracker";

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

// --- Content: the 5-page bundle -------------------------------------------
// Written from scratch based on the widely-taught, generic-knowledge "3-3-3
// rule" concept (independently published by many rescues/shelters — not
// owned by any single organization), never copied from any one source.

const coverSpec = {
  eyebrow: "FOR NEWLY ADOPTED DOGS",
  title: "The 3-3-3\nDecompression Tracker",
  subtitle: "3 Days · 3 Weeks · 3 Months",
  bodyLines: [
    "A gentle, structured guide to help your rescue or shelter dog",
    "settle in — one step at a time.",
  ],
  footer: BRAND_NAME,
};

interface ChecklistPage {
  role: string;
  title: string;
  subtitle: string;
  items: string[];
}

const checklistPages: ChecklistPage[] = [
  {
    role: "days-1-3",
    title: "Days 1–3:\nLet Them Decompress",
    subtitle: "Check off each day. Don't worry about progress yet — just safety and quiet.",
    items: [
      "Quiet space set up: bed, water, and a low-traffic spot to retreat to",
      "Leash on for every outdoor bathroom break (even in a fenced yard)",
      "No visitors, parties, or dog park trips this week",
      "Offered food in a calm, low-pressure spot — no pressure to eat right away",
      "Let them choose where to rest — did not force cuddles or attention",
      "Kept walks short and low-stimulation, away from busy areas",
      "Noticed today's appetite and sleep: normal, restless, or hiding",
      "Noted any triggers seen today (loud noises, strangers, other pets, etc.)",
      "Gave them permission to just be a dog — no training pressure yet",
    ],
  },
  {
    role: "weeks-1-3",
    title: "Weeks 1–3:\nBuilding Routine",
    subtitle: "Now that the dust has settled, start layering in gentle structure.",
    items: [
      "Feeding and bathroom breaks are becoming predictable and consistent",
      "Introduced a consistent bedtime and wake-up routine",
      "Started short, positive-only training sessions (5–10 minutes)",
      "Practiced their name and one basic cue in a quiet space",
      "Slowly introduced one new person or place, one at a time",
      "Watched body language during new experiences (tail, ears, posture)",
      "Began identifying their specific comfort signals vs. stress signals",
      "Explored the house room-by-room at their own pace",
      "Started building a positive association with the crate or resting spot",
    ],
  },
  {
    role: "months-1-3",
    title: "Months 1–3:\nSettling In For Good",
    subtitle: "Trust deepens here. This is where their real personality starts to show.",
    items: [
      "Personality is coming through — noted what makes them, them",
      "Responding to their name and basic cues consistently",
      "Has one or more clear favorite people, places, or toys",
      "Comfortable being left alone for short periods",
      "Scheduled or completed a wellness check-up appointment",
      "Socialization is progressing at their own pace, not on a deadline",
      "Identified their long-term triggers and a plan to manage them",
      "Considered whether a certified trainer's support would help",
      "Gave yourself credit for the patience this journey has taken",
    ],
  },
  {
    role: "safe-space-and-signs",
    title: "Safe Space &\nSigns of Progress",
    subtitle: "A quick-reference checklist for setup and encouraging signs to watch for.",
    items: [
      "Designated a quiet 'safe zone' away from foot traffic",
      "Set up a crate or bed with a blanket that has a familiar scent",
      "Gates or doors set up so they can retreat without being cornered",
      "Water available in 1–2 consistent, easy-to-find spots",
      "Sign of progress: taking treats gently from your hand",
      "Sign of progress: choosing to be in the same room as you",
      "Sign of progress: a relaxed body — soft eyes, loose tail, normal breathing",
      "Sign of progress: a full-body shake-off after stress (a great sign!)",
      "Sign of progress: seeking you out for comfort",
    ],
  },
];

const IMPORTANT_INFO_LINES = [
  "This is an organizational tool, not veterinary or professional training advice.",
  "Every dog adjusts at their own pace — treat these as gentle guidelines, not a strict schedule.",
  "For behavioral concerns, please consult a certified trainer or your veterinarian.",
  "Instant digital download — no physical item will be shipped.",
];

async function main() {
  console.log(`Building "${PRODUCT_TITLE}" (${PRODUCT_SLUG})...\n`);
  const storage = new LocalStorage(WORK_DIR);
  const fonts = await loadDefaultTypeFamily();
  const palette = resolvePalette(PALETTE_ID);
  const sizeIds = ["letter", "a_series"];
  const sizes = sizeIds.map((id) => PRINT_SIZES[id]!);

  // --- 1. Render every page at every size ---------------------------------
  const allTechnicalIssues: QaIssue[] = [];
  const perSizeAssets: Record<string, { pngs: { role: string; buffer: Buffer }[]; svg: string }> = {};
  let coverPngLetter: Buffer | undefined;
  let checklistPngLetter: Buffer | undefined;

  for (const size of sizes) {
    const { widthPx, heightPx } = pixelDimensions(size);
    const pngs: { role: string; buffer: Buffer }[] = [];

    const coverNode = buildPosterNode({ ...coverSpec, palette }, widthPx, heightPx);
    const coverSvg = await renderToSvg(coverNode, { widthPx, heightPx, fonts });
    const coverPng = rasterizeSvgToPng(coverSvg);
    pngs.push({ role: "00-cover", buffer: coverPng });
    allTechnicalIssues.push(
      ...(await checkImageTechnical({ buffer: coverPng, expectedWidthIn: size.widthIn, expectedHeightIn: size.heightIn, label: `cover (${size.id})` })),
    );
    if (size.id === "letter") {
      coverPngLetter = coverPng;
      perSizeAssets[size.id] = { pngs, svg: coverSvg };
    } else {
      perSizeAssets[size.id] = { pngs, svg: coverSvg };
    }

    for (const [i, page] of checklistPages.entries()) {
      const node = buildChecklistNode({ title: page.title, subtitle: page.subtitle, items: page.items, palette }, widthPx, heightPx);
      const svg = await renderToSvg(node, { widthPx, heightPx, fonts });
      const png = rasterizeSvgToPng(svg);
      pngs.push({ role: `0${i + 1}-${page.role}`, buffer: png });
      allTechnicalIssues.push(
        ...(await checkImageTechnical({ buffer: png, expectedWidthIn: size.widthIn, expectedHeightIn: size.heightIn, label: `${page.role} (${size.id})` })),
      );
      if (size.id === "letter" && i === 0) checklistPngLetter = png;
    }
  }

  console.log(`1. Rendered ${sizes.length} sizes x ${checklistPages.length + 1} pages = ${sizes.length * (checklistPages.length + 1)} print-ready PNGs\n`);

  // --- 2. Customer files: per-size PDF + all PNGs + instructions + license ---
  const customerFiles: { PDF: string[]; PNG: string[]; SVG: string[]; ZIP: string[] } = { PDF: [], PNG: [], SVG: [], ZIP: [] };
  const zipEntries: { filename: string; data: Buffer }[] = [];

  for (const size of sizes) {
    const { pngs } = perSizeAssets[size.id]!;
    const pdfBuffer = await buildPdf(pngs.map((p) => ({ pngBuffer: p.buffer, widthIn: size.widthIn, heightIn: size.heightIn })));
    const pdfPath = `${PRODUCT_SLUG}/source/pdf/${PRODUCT_SLUG}-${size.id}.pdf`;
    await storage.write(pdfPath, pdfBuffer);
    customerFiles.PDF.push(pdfPath);
    zipEntries.push({ filename: `PDF/${size.id}-all-pages.pdf`, data: pdfBuffer });
    allTechnicalIssues.push(...(await checkPdfValidity(pdfBuffer, `${size.id} combined PDF`)));

    for (const p of pngs) {
      const pngPath = `${PRODUCT_SLUG}/source/png/${size.id}/${PRODUCT_SLUG}-${p.role}.png`;
      await storage.write(pngPath, p.buffer);
      customerFiles.PNG.push(pngPath);
      zipEntries.push({ filename: `PNG/${size.id}/${p.role}.png`, data: p.buffer });
    }
  }

  const instructionsText = `HOW TO PRINT — ${PRODUCT_TITLE}

1. Unzip the download. Pick the "PDF" folder for the easiest printing, or
   the "PNG" folder if you want individual pages.
2. Two paper sizes are included — pick whichever matches your printer:
   - "letter" = US Letter (8.5 x 11 in)
   - "a_series" = A4 (8.27 x 11.69 in)
3. Print at "Actual Size" / 100% scale — NOT "Fit to Page" — to keep the
   correct proportions.
4. For the sharpest print, use a local print shop or a home printer set to
   its highest quality / photo setting on regular or lightly textured
   paper. A 3-ring binder or clipboard works great for keeping pages
   together as you fill them in.

This is a digital product. No physical item will be mailed to you.
`;
  const instructionsPath = `${PRODUCT_SLUG}/instructions/how-to-print.txt`;
  await storage.write(instructionsPath, Buffer.from(instructionsText, "utf8"));
  zipEntries.push({ filename: "instructions.txt", data: Buffer.from(instructionsText, "utf8") });

  const licenseText = buildLicenseText(PRODUCT_TITLE, BRAND_NAME);
  const licensePath = `${PRODUCT_SLUG}/license.txt`;
  await storage.write(licensePath, Buffer.from(licenseText, "utf8"));
  zipEntries.push({ filename: "license.txt", data: Buffer.from(licenseText, "utf8") });

  const zipBuffer = await buildZip(zipEntries);
  const zipPath = `${PRODUCT_SLUG}/source/${PRODUCT_SLUG}-complete-bundle.zip`;
  await storage.write(zipPath, zipBuffer);
  customerFiles.ZIP.push(zipPath);
  allTechnicalIssues.push(...(await checkZipValidity(zipBuffer, "complete bundle ZIP")));
  // Etsy digital listings cap at 5 files — this bundle ships as the single ZIP + the two convenience PDFs.
  const digitalFilesForEtsy = [...customerFiles.ZIP, ...customerFiles.PDF];
  if (digitalFilesForEtsy.length > LISTING_LIMITS.maxDigitalFiles) {
    throw new Error(`Too many digital files for one Etsy listing: ${digitalFilesForEtsy.length} > ${LISTING_LIMITS.maxDigitalFiles}`);
  }

  console.log(`2. Customer bundle written: ${zipEntries.length} files zipped, ${customerFiles.PDF.length} convenience PDFs\n`);

  // --- 3. SEO copy (written directly for this listing — see AI disclosure) ---
  const aiDisclosureLine = buildAiDisclosureText({ usedAiText: true, usedAiImages: false });
  const title = truncate(
    "3-3-3 Rescue Dog Decompression Tracker | Printable Adjustment Checklist for New Shelter Dogs | Instant Download PDF",
    LISTING_LIMITS.maxTitleLength,
  );
  const description = [
    `Just brought home a rescue or shelter dog? The first 3 months are the hardest to navigate — and this tracker turns the widely-recommended "3-3-3 rule" (3 days, 3 weeks, 3 months) into a simple, printable guide so you always know what's normal and what to focus on next.`,
    `Instead of one generic checklist, you get 5 focused pages: a Days 1-3 decompression log, a Weeks 1-3 routine-building checklist, a Months 1-3 settling-in checklist, and a Safe Space Setup + Signs of Progress quick-reference — so you're never left wondering "is this normal?" during the adjustment period.`,
    `What's included:`,
    `- 4 checklist pages (Days 1-3 / Weeks 1-3 / Months 1-3 / Safe Space & Signs of Progress) plus a title page`,
    `- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live`,
    `- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download`,
    `- A short printing guide and personal-use license included`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can start using it the moment your new dog gets home.`,
    `This is an organizational tool, not veterinary or professional training advice — for behavioral concerns, please consult a certified trainer or your veterinarian.`,
    `For personal use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "rescue dog",
    "dog adoption",
    "decompression",
    "shelter dog",
    "new dog owner",
    "dog checklist",
    "printable pdf",
    "pet planner",
    "foster dog",
    "dog tracker",
    "3 3 3 rule",
    "instant download",
    "dog printable",
  ].map((t) => truncate(t, LISTING_LIMITS.maxTagLength));
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "New pet", style: "Minimalist", recipient: "Pet owner", color: "Sage green", primaryColor: "Green" };
  const category = "pet_supplies_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 6.5;

  console.log(`3. SEO copy drafted: title (${title.length} chars), ${tags.length} tags, description (${description.length} chars)\n`);

  // --- 4. Listing images (9, 2000x2000, mobile-readable) ------------------
  if (!coverPngLetter || !checklistPngLetter) throw new Error("Missing rendered cover/checklist PNG for listing images.");
  const letterAspect = PRINT_SIZES.letter!.widthIn / PRINT_SIZES.letter!.heightIn;
  const { widthPx: listingW, heightPx: listingH } = LISTING_IMAGE_SIZE;

  const listingImageSpecs: { role: string; node: Awaited<ReturnType<typeof buildInfoCardNode>> }[] = [
    {
      role: "01_cover",
      node: buildCoverNode({ designPngBase64: coverPngLetter.toString("base64"), designAspect: letterAspect, badge: "Instant Download", palette }, listingW, listingH),
    },
    {
      role: "02_mockup",
      node: buildCoverNode({ designPngBase64: checklistPngLetter.toString("base64"), designAspect: letterAspect, badge: "Printable Bundle", palette }, listingW, listingH),
    },
    {
      role: "03_whats_included",
      node: buildInfoCardNode(
        {
          title: "What's Included",
          bullets: [
            "5 pages: Title page + 4 focused checklists (Days 1-3, Weeks 1-3, Months 1-3, Safe Space & Signs)",
            "1 print-ready PDF per paper size, plus individual PNG pages",
            "2 sizes included: US Letter and A4",
            "Printing guide + personal use license",
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
          badge: "Why This Helps",
          title: "Features & Benefits",
          bullets: [
            "Structured around the widely-recommended 3-3-3 adjustment framework",
            "Covers the whole first 3 months, not just move-in day",
            "A calm, judgment-free way to track what's normal",
            "Reusable for every future foster or rescue dog",
          ],
          palette,
        },
        listingW,
        listingH,
      ),
    },
    {
      role: "05_sizes_formats",
      node: buildInfoCardNode(
        {
          title: "Sizes & Formats",
          bullets: ["US Letter (8.5 x 11 in)", "A4 (8.27 x 11.69 in)", "Delivered as PDF (all pages together) and individual PNG pages"],
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
          bullets: ["Purchase this listing and check out.", "Download your files from Etsy (desktop recommended for the ZIP).", "Print at home or send to a local/online print shop."],
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
            "Keep it on the fridge or in a binder during the first 3 months",
            "Fill it out daily/weekly to spot patterns and progress",
            "A thoughtful gift for a friend who just adopted",
            "Share the Safe Space page with pet sitters or family",
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
          bullets: ["Your files are delivered instantly after checkout — no waiting.", "Download from Etsy's 'Purchases and Reviews' page.", "No physical item will be shipped."],
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

  const listingImages: { role: string; path: string; rank: number }[] = [];
  for (const [i, spec] of listingImageSpecs.entries()) {
    const png = await renderToPng(spec.node, { widthPx: listingW, heightPx: listingH, fonts });
    const relPath = `${PRODUCT_SLUG}/listing_images/${spec.role}.png`;
    await storage.write(relPath, png);
    listingImages.push({ role: spec.role, path: relPath, rank: i + 1 });
    allTechnicalIssues.push(...(await checkImageTechnical({ buffer: png, expectedWidthIn: 1, expectedHeightIn: 1, label: `listing image ${spec.role}` })));
  }
  console.log(`4. Rendered ${listingImages.length} listing images (2000x2000)\n`);

  // --- 5. QA: technical + IP/policy + SEO + placeholder-leakage, using the REAL qa package ---
  const allText = [title, description, ...tags, ...materials, coverSpec.eyebrow, coverSpec.title, coverSpec.subtitle, ...(coverSpec.bodyLines ?? [])]
    .concat(checklistPages.flatMap((p) => [p.title, p.subtitle, ...p.items]))
    .concat(IMPORTANT_INFO_LINES)
    .join(" | ");
  const ipCheck = checkIpRisk(allText, 10); // this listing's own bar: IP risk must be <= 10, stricter than the system default 40

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
    minPassScore: 95, // stricter than the system default 90, per this listing's own bar
  });

  console.log(`5. QA — overall score: ${qaReport.overallScore} | passed: ${qaReport.passed} | IP risk: ${ipCheck.riskScore} (${ipCheck.riskLevel})\n`);
  if (!qaReport.passed || ipCheck.riskScore > 10) {
    console.error("QA or IP check did not meet this listing's bar (QA>=95, IP<=10). Issues:");
    console.error(JSON.stringify(qaReport.issues, null, 2));
    process.exit(1);
  }

  // --- 6. Assemble artifacts/first-live-listing/ --------------------------
  await mkdir(path.join(OUT_DIR, "customer-download"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "listing-images"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "listing-data"), { recursive: true });
  await mkdir(path.join(OUT_DIR, "qa-report"), { recursive: true });

  await writeFile(path.join(OUT_DIR, "customer-download", `${PRODUCT_SLUG}-complete-bundle.zip`), zipBuffer);
  for (const size of sizes) {
    const pdfBuffer = await storage.read(customerFiles.PDF.find((p) => p.includes(`-${size.id}.pdf`))!);
    await writeFile(path.join(OUT_DIR, "customer-download", `${PRODUCT_SLUG}-${size.id}.pdf`), pdfBuffer);
  }

  for (const img of listingImages) {
    const buf = await storage.read(img.path);
    await writeFile(path.join(OUT_DIR, "listing-images", `${img.role}.png`), buf);
  }

  await writeFile(path.join(OUT_DIR, "listing-data", "etsy-title.txt"), title, "utf8");
  await writeFile(path.join(OUT_DIR, "listing-data", "etsy-description.txt"), description, "utf8");
  await writeFile(path.join(OUT_DIR, "listing-data", "etsy-tags.txt"), tags.join("\n"), "utf8");
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-category.txt"),
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6 for how it's fetched for real once OAuth is connected. In Etsy's listing editor, type into the category search field and pick the closest match: try "Pet Supplies" first and narrow to a digital/printable pet planner or tracker subcategory if Etsy offers one; if not, "Craft Supplies & Tools > Paper & Party Supplies > Printables" is the right fallback for a printable digital download like this one.)\n`,
    "utf8",
  );
  await writeFile(path.join(OUT_DIR, "listing-data", "etsy-price.txt"), `${priceUsd.toFixed(2)} USD\n`, "utf8");
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-attributes.json"),
    JSON.stringify({ ...attributes, materials, who_made: "i_did", when_made: "made_to_order", type: "download", quantity: 999, should_auto_renew: true }, null, 2),
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
