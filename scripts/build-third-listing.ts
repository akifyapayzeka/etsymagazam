#!/usr/bin/env tsx
/**
 * Builds Form & Fern's THIRD product: Rescue Dog Gotcha Day Memory Bundle.
 *
 * Deliberately NOT the same product as the first listing (3-3-3 Rescue Dog
 * Decompression & Adjustment Bundle) — that one is a practical adjustment
 * system for the first 90 days; this one is a celebratory keepsake for
 * marking and re-celebrating the adoption anniversary ("Gotcha Day") every
 * year after. No text is reused between the two.
 *
 * Same one-off pattern as scripts/build-first-listing.ts / build-second-listing.ts.
 * Run: pnpm tsx scripts/build-third-listing.ts
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
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "third-live-listing");
const WORK_DIR = path.join(REPO_ROOT, "storage", "third-listing-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "blush";
const PRODUCT_SLUG = "rescue-dog-gotcha-day-memory-bundle";
const PRODUCT_TITLE = "Rescue Dog Gotcha Day Memory Bundle: Printable Adoption Anniversary Keepsake & Certificate";

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

const coverSpec = {
  eyebrow: "A KEEPSAKE FOR YOUR RESCUE DOG",
  title: "Gotcha Day\nMemory Bundle",
  subtitle: "Celebrate the day your paths crossed",
  bodyLines: ["A printable keepsake to mark — and re-celebrate,", "year after year — your dog's adoption anniversary."],
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
    role: "adoption-certificate",
    title: "Adoption\nCertificate",
    subtitle: "Fill this in once, then frame it or keep it with their things — the official start of your story together.",
    items: [
      "Dog's full name and any nicknames you've already given them",
      "Gotcha Day date — the day they officially came home",
      "Where they came from — shelter, rescue group, or foster home name",
      "Their approximate age and breed or mix, as best known",
      "Who was there the day you brought them home",
      "The very first thing you said to them",
      "The very first thing they did once they felt safe",
      "One word that captured how that day felt",
      "Signed and dated by their new family",
    ],
  },
  {
    role: "gotcha-day-story",
    title: "Our Gotcha\nDay Story",
    subtitle: "Write it while it's fresh — this page becomes more precious every year you re-read it.",
    items: [
      "How you first found out about this dog",
      "What made you say yes to this particular dog",
      "What the drive or walk home was like",
      "What their very first moment inside your home looked like",
      "Where they chose to go first — a corner, a bed, your lap",
      "What surprised you most about them on day one",
      "Who they warmed up to first",
      "What you were most nervous about that day",
      "One sentence you'd want to remember about this day forever",
    ],
  },
  {
    role: "photo-memory-pages",
    title: "Before & After:\nPhoto Memory Page",
    subtitle: "Print this page and glue in real photos, or note where you've saved them digitally for each slot below.",
    items: [
      "Photo slot 1: The very first photo you took of them",
      "Photo slot 2: The drive or walk home",
      "Photo slot 3: Their first night in their new spot",
      "Photo slot 4: The first time they looked truly relaxed",
      "Photo slot 5: One year later, looking and feeling like family",
      "Noted the date each photo was taken underneath it",
      "Picked a consistent spot to photograph them each Gotcha Day",
      "Saved digital copies somewhere easy to find next year",
      "Printed or ordered physical copies of your favorites",
    ],
  },
  {
    role: "firsts-tracker",
    title: "Firsts\nMilestone Tracker",
    subtitle: "The early \"firsts\" go by fast — capture the date and a quick memory for each one.",
    items: [
      "First full night of sleep through, no pacing or whining",
      "First walk where they seemed to genuinely enjoy it",
      "First time they came when called, unprompted",
      "First time they played with a toy on their own",
      "First time they sought you out just for affection",
      "First vet visit as part of your family",
      "First time meeting another dog calmly",
      "First time you saw their personality really come through",
      "First time it felt like they'd always been yours",
    ],
  },
  {
    role: "one-year-reflection",
    title: "One Year Later:\nA Reflection",
    subtitle: "However much time has passed, this page is for looking back at how far you've both come.",
    items: [
      "What's different about them now compared to Gotcha Day?",
      "What's different about you as their person?",
      "What's a habit or quirk that's become completely normal to you now?",
      "What's a moment from this year you don't want to forget?",
      "What's something you were worried about that turned out fine?",
      "What's a way they've surprised you this year?",
      "What's something you'd tell yourself back on Gotcha Day?",
      "What are you most looking forward to in the year ahead together?",
      "What's the biggest thing you're grateful for this year?",
    ],
  },
  {
    role: "yearly-traditions",
    title: "Yearly Gotcha Day\nTradition Ideas",
    subtitle: "Pick a few to make an annual tradition — check off the ones you want to try this year.",
    items: [
      "Retake the same \"after\" photo in the same spot each year",
      "Give them one special new toy just for the occasion",
      "Make or buy a special meal or treat just for the day",
      "Take an extra-long or new walk somewhere they'll love",
      "Write this year's entry in the Memory Keepsake Log",
      "Donate to the shelter or rescue they came from, in their honor",
      "Take a family photo together to mark the year",
      "Share their story with someone who hasn't heard it yet",
      "Do absolutely nothing different and just enjoy the day with them",
    ],
  },
  {
    role: "letter-to-my-dog",
    title: "A Letter\nTo My Dog",
    subtitle: "Write them a letter on this Gotcha Day. Keep it, and maybe write a new one every year.",
    items: [
      "Start with why you're grateful they're yours",
      "Mention one specific memory from this year",
      "Mention something about them that always makes you laugh",
      "Mention something they've taught you without meaning to",
      "Mention a hard moment you got through together",
      "Mention what you hope for the year ahead",
      "Mention something you want them to always know, if they could read it",
      "Sign it and date it",
      "Tuck it away with this year's photos to read again next year",
    ],
  },
  {
    role: "favorite-things",
    title: "Favorite Things\nAbout You",
    subtitle: "A lighthearted page to capture the small, specific things that make them them.",
    items: [
      "Their favorite spot in the house",
      "Their favorite toy or object",
      "Their favorite person and why (be honest)",
      "Their funniest habit or quirk",
      "Their favorite walk or outdoor spot",
      "Their favorite treat",
      "The sound or word that gets the biggest reaction",
      "Their most \"them\" facial expression",
      "The thing about them you'd never trade for anything",
    ],
  },
  {
    role: "celebration-checklist",
    title: "Gotcha Day\nCelebration Checklist",
    subtitle: "A simple, low-pressure checklist for the day itself — pick what fits, skip the rest.",
    items: [
      "Picked a date to celebrate (their actual Gotcha Day or closest weekend)",
      "Planned a special walk, park visit, or outing they'll enjoy",
      "Picked out a small new toy, treat, or accessory",
      "Set aside time for extra one-on-one attention that day",
      "Took this year's \"after\" photo in your chosen spot",
      "Filled in this year's row in the Memory Keepsake Log",
      "Shared a photo or story with friends or family who love them too",
      "Kept the day calm and low-key if that's what they'd enjoy most",
      "Told them, out loud, how glad you are they're yours",
    ],
  },
  {
    role: "memory-keepsake-log",
    title: "Memory\nKeepsake Log",
    subtitle: "Come back to this page every Gotcha Day and add a new row — a growing record across the years.",
    items: [
      "Year 1: Date, their age, and one favorite memory from the year",
      "Year 2: Date, their age, and one favorite memory from the year",
      "Year 3: Date, their age, and one favorite memory from the year",
      "Year 4: Date, their age, and one favorite memory from the year",
      "Year 5: Date, their age, and one favorite memory from the year",
      "Noted any new habits, favorites, or personality changes each year",
      "Noted any milestones — new sibling, new home, new adventures",
      "Kept this page with the photo memory page for a full annual snapshot",
      "Reread past years' entries before writing this year's",
    ],
  },
  {
    role: "gratitude-reflection",
    title: "Gratitude\nReflection",
    subtitle: "A closing page for whenever you need a reminder of why this day matters.",
    items: [
      "Named one way your life is better with them in it",
      "Named one way you think their life is better with you in it",
      "Reminded yourself that Gotcha Day is worth celebrating like a birthday",
      "Reminded yourself that adjustment struggles, if there were any, don't erase this joy",
      "Thought of one other rescue dog or shelter you could help someday",
      "Noted one small thing that made you smile about them today",
      "Told someone else your dog's Gotcha Day story today",
      "Took a breath and just appreciated this exact moment with them",
      "Marked the calendar for next year's Gotcha Day already",
    ],
  },
  {
    role: "keepsake-care-info",
    title: "Keeping This\nKeepsake",
    subtitle: "A few tips for making this bundle last as long as the memories do.",
    items: [
      "Print on slightly heavier paper (cardstock) for the certificate page",
      "Consider a simple frame for the certificate or a favorite photo page",
      "Store filled-in pages in a binder, folder, or scrapbook together",
      "Add new photo and log pages each year using this same file",
      "Keep a digital backup of your filled-in pages alongside the printed ones",
      "This is a personal keepsake, not veterinary or professional advice",
      "Every adoption story is different — use what fits yours and skip what doesn't",
      "Instant digital download — no physical item will be shipped",
      "Re-download your files anytime from Etsy's Purchases page",
    ],
  },
];

const IMPORTANT_INFO_LINES = [
  "This is a personal keepsake and memory-keeping tool, not veterinary or professional training advice.",
  "Every adoption story is different — use the pages that fit yours and skip the ones that don't.",
  "Instant digital download — no physical item will be shipped.",
  "Best printed on cardstock for the certificate page for a more lasting keepsake.",
];

async function main() {
  console.log(`Building "${PRODUCT_TITLE}" (${PRODUCT_SLUG})...\n`);
  const storage = new LocalStorage(WORK_DIR);
  const fonts = await loadDefaultTypeFamily();
  const palette = resolvePalette(PALETTE_ID);
  const sizeIds = ["letter", "a_series"];
  const sizes = sizeIds.map((id) => PRINT_SIZES[id]!);

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
    perSizeAssets[size.id] = { pngs, svg: coverSvg };
    if (size.id === "letter") coverPngLetter = coverPng;

    for (const [i, page] of checklistPages.entries()) {
      const node = buildChecklistNode({ title: page.title, subtitle: page.subtitle, items: page.items, palette }, widthPx, heightPx);
      const svg = await renderToSvg(node, { widthPx, heightPx, fonts });
      const png = rasterizeSvgToPng(svg);
      pngs.push({ role: `${String(i + 1).padStart(2, "0")}-${page.role}`, buffer: png });
      allTechnicalIssues.push(
        ...(await checkImageTechnical({ buffer: png, expectedWidthIn: size.widthIn, expectedHeightIn: size.heightIn, label: `${page.role} (${size.id})` })),
      );
      if (size.id === "letter" && i === 0) checklistPngLetter = png;
    }
  }

  console.log(`1. Rendered ${sizes.length} sizes x ${checklistPages.length + 1} pages = ${sizes.length * (checklistPages.length + 1)} print-ready PNGs\n`);

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
4. For the Adoption Certificate page, cardstock gives the best keepsake
   result. A 3-ring binder, folder, or scrapbook works well for keeping the
   rest of the pages together across multiple years.

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
  const digitalFilesForEtsy = [...customerFiles.ZIP, ...customerFiles.PDF];
  if (digitalFilesForEtsy.length > LISTING_LIMITS.maxDigitalFiles) {
    throw new Error(`Too many digital files for one Etsy listing: ${digitalFilesForEtsy.length} > ${LISTING_LIMITS.maxDigitalFiles}`);
  }

  console.log(`2. Customer bundle written: ${zipEntries.length} files zipped, ${customerFiles.PDF.length} convenience PDFs\n`);

  const aiDisclosureLine = buildAiDisclosureText({ usedAiText: true, usedAiImages: false });
  const title = truncate(PRODUCT_TITLE, LISTING_LIMITS.maxTitleLength);
  const description = [
    `"Gotcha Day" is the day your rescue or shelter dog officially became yours — and it deserves to be celebrated and remembered, not just on year one, but every year after. This printable bundle gives you a certificate to fill in once, plus a growing keepsake log you'll come back to on every future anniversary.`,
    `This isn't a single certificate — it's a full 13-page memory-keeping system: an Adoption Certificate, a Gotcha Day Story page, a Photo Memory page with labeled slots, a Firsts Milestone Tracker, a One Year Later reflection, Yearly Tradition ideas, a Letter To My Dog, a Favorite Things page, a Celebration Checklist, a multi-year Memory Keepsake Log, a Gratitude Reflection, and a keepsake care guide.`,
    `What's included:`,
    `- 13 pages: title page + 12 focused keepsake pages covering the certificate, story, photos, milestones, and a repeatable multi-year log`,
    `- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live`,
    `- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download`,
    `- A short printing guide and personal-use license included`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can start filling it in the moment inspiration strikes.`,
    `This is a personal keepsake and memory-keeping tool, not veterinary or professional advice.`,
    `For personal use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "gotcha day gift",
    "rescue dog gift",
    "adoption keepsake",
    "dog anniversary",
    "adoption certificate",
    "shelter dog gift",
    "dog memory book",
    "pet keepsake",
    "foster dog gift",
    "dog scrapbook",
    "printable pdf",
    "instant download",
    "dog printable",
  ].map((t) => truncate(t, LISTING_LIMITS.maxTagLength));
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "Anniversary", style: "Minimalist", recipient: "Pet owner", color: "Blush pink", primaryColor: "Pink" };
  const category = "pet_supplies_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 7.5; // see listing-data/etsy-price.txt — only valid IF the connected Etsy shop's currency is USD

  console.log(`3. SEO copy drafted: title (${title.length} chars), ${tags.length} tags, description (${description.length} chars)\n`);

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
            "13 pages: title page + 12 keepsake pages — certificate, story, photos, milestones, and a multi-year log",
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
            "A keepsake you fill in once and revisit every Gotcha Day",
            "Covers the certificate, the story, photos, milestones, and yearly traditions",
            "A meaningful gift for any rescue-dog family",
            "Reusable year after year with the multi-year Memory Keepsake Log",
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
            "Fill it out on Gotcha Day and add a new log entry every year after",
            "Frame the certificate or a favorite photo page",
            "A thoughtful gift for a friend who recently adopted",
            "Keep it in a binder alongside your dog's other keepsakes",
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

  const allText = [title, description, ...tags, ...materials, coverSpec.eyebrow, coverSpec.title, coverSpec.subtitle, ...(coverSpec.bodyLines ?? [])]
    .concat(checklistPages.flatMap((p) => [p.title, p.subtitle, ...p.items]))
    .concat(IMPORTANT_INFO_LINES)
    .join(" | ");
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
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6. In Etsy's listing editor, type a description of the actual product — e.g. "pet keepsake printable" or "adoption certificate" — into the category search field and Etsy will suggest real, current categories live. Pick whichever suggested category is the closest match at the time you create it.)\n`,
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
