#!/usr/bin/env tsx
/**
 * Builds Form & Fern's FOURTH product: Wildflower Wedding Welcome Sign Bundle.
 *
 * A poster-template bundle (not checklist) — a matching set of 9 wedding-day
 * signs. Deliberately generic/non-personalized (welcome, guest book, cards &
 * gifts, unplugged ceremony, find your seat, bar menu, order of events,
 * thank you, reception directional) since this system renders statically —
 * it does not support per-buyer name/date customization, so every sign here
 * works as-is for any couple rather than promising editable personalization
 * we can't deliver.
 *
 * Run: pnpm tsx scripts/build-fourth-listing.ts
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { Storage } from "@etsymagazam/core";
import { getFeeScheduleMeta } from "@etsymagazam/core";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import {
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
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "fourth-live-listing");
const WORK_DIR = path.join(REPO_ROOT, "storage", "fourth-listing-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "wildflower";
const PRODUCT_SLUG = "wildflower-wedding-welcome-sign-bundle";
const PRODUCT_TITLE = "Wildflower Wedding Welcome Sign Bundle: 9 Printable Wedding Day Signs, Instant Download";

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
  eyebrow: "9 MATCHING SIGNS",
  title: "Wildflower\nWedding Sign Bundle",
  subtitle: "Welcome · Guest Book · Cards & Gifts · Bar Menu · and more",
  bodyLines: ["A cohesive, ready-to-print set of wedding-day signage —", "one design family, nine signs, zero extra design work."],
  footer: BRAND_NAME,
};

interface SignPage {
  role: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  bodyLines?: string[];
}

const signPages: SignPage[] = [
  {
    role: "welcome",
    eyebrow: "TODAY WE SAY",
    title: "Welcome to\nOur Wedding",
    subtitle: "We're so glad you're here to celebrate with us",
  },
  {
    role: "guest-book",
    title: "Please Sign\nOur Guest Book",
    subtitle: "Leave us a note — we'll treasure it for years to come",
  },
  {
    role: "cards-gifts",
    title: "Cards &\nGifts",
    subtitle: "This way, please — thank you for being so generous",
  },
  {
    role: "unplugged-ceremony",
    eyebrow: "A KIND REQUEST",
    title: "Unplugged\nCeremony",
    subtitle: "Please silence your phones and be fully present with us today",
    bodyLines: ["Our photographer has it covered —", "you'll see every photo soon."],
  },
  {
    role: "find-your-seat",
    title: "Find Your\nSeat",
    subtitle: "Your table awaits — see the seating chart nearby",
  },
  {
    role: "bar-menu",
    eyebrow: "CHEERS TO US",
    title: "Signature\nDrinks",
    subtitle: "His & Hers Signature Cocktails",
    bodyLines: ["Wine · Beer · Champagne", "Ask your bartender for tonight's specials"],
  },
  {
    role: "order-of-events",
    title: "Order of\nEvents",
    bodyLines: [
      "4:00 PM  —  Ceremony",
      "4:30 PM  —  Cocktail Hour",
      "5:30 PM  —  Reception Begins",
      "6:00 PM  —  Dinner & Toasts",
      "7:30 PM  —  First Dance",
      "8:00 PM  —  Dancing",
      "10:00 PM  —  Send-Off",
    ],
  },
  {
    role: "reception-directional",
    title: "Reception\nThis Way",
    subtitle: "Follow the path to the party",
  },
  {
    role: "thank-you",
    title: "Thank\nYou",
    subtitle: "For celebrating this day with us — it means the world",
  },
];

const IMPORTANT_INFO_LINES = [
  "This bundle is printable as-is and is not editable with your own names or date.",
  "Times on the Order of Events sign are a starting template — hand-letter or relabel to match your real schedule if needed.",
  "Instant digital download — no physical item will be shipped.",
  "For personal wedding use — see the included license.txt for details.",
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
  let welcomeSignPngLetter: Buffer | undefined;

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

    for (const [i, sign] of signPages.entries()) {
      const node = buildPosterNode(
        { eyebrow: sign.eyebrow, title: sign.title, subtitle: sign.subtitle, bodyLines: sign.bodyLines ?? [], footer: BRAND_NAME, palette },
        widthPx,
        heightPx,
      );
      const svg = await renderToSvg(node, { widthPx, heightPx, fonts });
      const png = rasterizeSvgToPng(svg);
      pngs.push({ role: `${String(i + 1).padStart(2, "0")}-${sign.role}`, buffer: png });
      allTechnicalIssues.push(
        ...(await checkImageTechnical({ buffer: png, expectedWidthIn: size.widthIn, expectedHeightIn: size.heightIn, label: `${sign.role} (${size.id})` })),
      );
      if (size.id === "letter" && sign.role === "welcome") welcomeSignPngLetter = png;
    }
  }

  console.log(`1. Rendered ${sizes.length} sizes x ${signPages.length + 1} pages = ${sizes.length * (signPages.length + 1)} print-ready PNGs\n`);

  const customerFiles: { PDF: string[]; PNG: string[]; SVG: string[]; ZIP: string[] } = { PDF: [], PNG: [], SVG: [], ZIP: [] };
  const zipEntries: { filename: string; data: Buffer }[] = [];

  for (const size of sizes) {
    const { pngs } = perSizeAssets[size.id]!;
    const pdfBuffer = await buildPdf(pngs.map((p) => ({ pngBuffer: p.buffer, widthIn: size.widthIn, heightIn: size.heightIn })));
    const pdfPath = `${PRODUCT_SLUG}/source/pdf/${PRODUCT_SLUG}-${size.id}.pdf`;
    await storage.write(pdfPath, pdfBuffer);
    customerFiles.PDF.push(pdfPath);
    zipEntries.push({ filename: `PDF/${size.id}-all-signs.pdf`, data: pdfBuffer });
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
   the "PNG" folder if you want individual signs.
2. Two paper sizes are included — pick whichever matches your printer or
   frame:
   - "letter" = US Letter (8.5 x 11 in)
   - "a_series" = A4 (8.27 x 11.69 in)
3. Print at "Actual Size" / 100% scale — NOT "Fit to Page" — to keep the
   correct proportions. For a larger sign, take the file to a local print
   shop and ask for an enlarged print or a foam-board mount.
4. These signs are ready to print as-is and are not editable with your own
   names or date. The Order of Events sign uses template times — hand-letter
   or relabel it if your schedule differs.

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
    `A cohesive set of 9 wedding-day signs, all in one soft wildflower design family — so your welcome table, bar, ceremony, and reception all feel like part of the same day, without hiring a separate designer for every sign.`,
    `What's included:`,
    `- 10 pages total (title page + 9 signs): Welcome, Please Sign Our Guest Book, Cards & Gifts, Unplugged Ceremony, Find Your Seat, Signature Drinks / Bar Menu, Order of Events, Reception This Way, and Thank You`,
    `- 2 print sizes: US Letter and A4 — print small for a table easel or take to a local print shop for a larger mounted sign`,
    `- Delivered as a print-ready PDF (all signs together) and individual PNG files, zipped into one download`,
    `- A short printing guide and personal-use license included`,
    `These signs are ready to print exactly as shown and are not editable with your own names or date — the Order of Events sign includes template times you can hand-letter over if your schedule differs. This keeps the whole set fast, affordable, and instantly ready.`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy.`,
    `For personal wedding use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "wedding sign bundle",
    "wedding welcome sign",
    "guest book sign",
    "cards and gifts sign",
    "unplugged wedding",
    "wedding bar sign",
    "wedding decor set",
    "printable wedding",
    "wildflower wedding",
    "order of events",
    "printable pdf",
    "instant download",
    "wedding signage",
  ].map((t) => truncate(t, LISTING_LIMITS.maxTagLength));
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "Wedding", style: "Minimalist", recipient: "Adult", color: "Cream and terracotta", primaryColor: "Brown" };
  const category = "wedding_decor_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 12.0; // 9-sign bundle — priced above the single-item printables per market research (wedding templates commonly $15-50; kept conservative for a static, non-editable set)

  console.log(`3. SEO copy drafted: title (${title.length} chars), ${tags.length} tags, description (${description.length} chars)\n`);

  if (!coverPngLetter || !welcomeSignPngLetter) throw new Error("Missing rendered cover/welcome PNG for listing images.");
  const letterAspect = PRINT_SIZES.letter!.widthIn / PRINT_SIZES.letter!.heightIn;
  const { widthPx: listingW, heightPx: listingH } = LISTING_IMAGE_SIZE;

  const listingImageSpecs: { role: string; node: Awaited<ReturnType<typeof buildInfoCardNode>> }[] = [
    {
      role: "01_cover",
      node: buildCoverNode({ designPngBase64: coverPngLetter.toString("base64"), designAspect: letterAspect, badge: "Instant Download", palette }, listingW, listingH),
    },
    {
      role: "02_mockup",
      node: buildCoverNode({ designPngBase64: welcomeSignPngLetter.toString("base64"), designAspect: letterAspect, badge: "9 Signs Included", palette }, listingW, listingH),
    },
    {
      role: "03_whats_included",
      node: buildInfoCardNode(
        {
          title: "What's Included",
          bullets: [
            "10 pages: title page + 9 matching wedding-day signs",
            "1 print-ready PDF per paper size, plus individual PNG files",
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
            "One cohesive wildflower design family across every sign",
            "Covers welcome, guest book, cards, bar, ceremony, and more",
            "No separate designer needed for each individual sign",
            "Print small for a table or large for an easel display",
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
          bullets: ["US Letter (8.5 x 11 in)", "A4 (8.27 x 11.69 in)", "Delivered as PDF (all signs together) and individual PNG files"],
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
          title: "Signs Included",
          bullets: ["Welcome · Guest Book · Cards & Gifts", "Unplugged Ceremony · Find Your Seat", "Bar Menu · Order of Events", "Reception Directional · Thank You"],
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
    .concat(signPages.flatMap((p) => [p.eyebrow, p.title, p.subtitle, ...(p.bodyLines ?? [])].filter((s): s is string => Boolean(s))))
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
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6. In Etsy's listing editor, type a description of the actual product — e.g. "wedding sign printable" or "wedding decor" — into the category search field and Etsy will suggest real, current categories live.)\n`,
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
