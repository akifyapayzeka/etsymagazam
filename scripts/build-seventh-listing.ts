#!/usr/bin/env tsx
/**
 * Builds Form & Fern's SEVENTH product: Pet Sitter Emergency & Routine Binder.
 *
 * Pet category, checklist template, but a genuinely different purpose from
 * the existing two dog products: this is a hand-off document you fill in
 * ONCE and leave for whoever cares for your pet while you're away (a
 * sitter, walker, boarder, or family member) — routine, feeding,
 * medication, behavior, house access, and emergency contacts. No text is
 * reused from the 3-3-3 Decompression Bundle or the Gotcha Day Memory Bundle.
 *
 * Run: pnpm tsx scripts/build-seventh-listing.ts
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
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "seventh-live-listing");
const WORK_DIR = path.join(REPO_ROOT, "storage", "seventh-listing-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "wildflower";
const PRODUCT_SLUG = "pet-sitter-emergency-routine-binder";
const PRODUCT_TITLE = "Pet Sitter Emergency & Routine Binder: Printable Care Instructions for Sitters, Instant Download";

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
  eyebrow: "FOR WHOEVER'S WATCHING THEM",
  title: "Pet Sitter\nEmergency & Routine Binder",
  subtitle: "Everything a sitter needs to know, in one place",
  bodyLines: ["Fill it out once, hand it off with confidence —", "every time you're away."],
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
    role: "pet-profile",
    title: "Pet\nProfile",
    subtitle: "The basics, all in one place for a sitter meeting your pet for the first time.",
    items: [
      "Name, breed or mix, age, and weight",
      "Microchip number and registry, if known",
      "Spayed/neutered status",
      "Any known allergies or sensitivities",
      "Current medications and supplements, if any",
      "Personality in a few words — shy, social, independent, velcro",
      "Favorite toy, spot, or activity",
      "Anything that scares or startles them",
      "A recent photo attached or saved somewhere easy to find",
    ],
  },
  {
    role: "daily-routine",
    title: "Daily Routine\nSchedule",
    subtitle: "Keeping the routine consistent is the single biggest thing a sitter can do right.",
    items: [
      "Morning wake-up and first outdoor break time",
      "Feeding times and which meals happen when",
      "Walk times, length, and preferred route",
      "Midday check-in or break, if applicable",
      "Evening feeding and final outdoor break time",
      "Bedtime routine — crate, specific room, or free roam",
      "Any daily medication times built into the schedule",
      "Playtime or enrichment expectations",
      "Anything different about weekends vs. weekdays",
    ],
  },
  {
    role: "feeding-instructions",
    title: "Feeding\nInstructions",
    subtitle: "Be specific — sitters can't guess portion sizes or food swaps correctly.",
    items: [
      "Food brand and exact type (wet, dry, raw, prescription)",
      "Exact amount per meal, in cups or grams",
      "Where food and treats are stored",
      "Approved treats and how many per day",
      "Foods that are strictly off-limits for this pet",
      "Water bowl location and how often it's refreshed",
      "Any feeding quirks — slow feeder, food guarding, picky eating",
      "What to do if they skip a meal (see What To Do If page for more)",
      "Whether other pets in the home need to be fed separately",
    ],
  },
  {
    role: "medication-instructions",
    title: "Medication\nInstructions",
    subtitle: "Leave blank if not applicable — never guess dosages or timing.",
    items: [
      "Medication name and exact dose",
      "Time(s) of day it's given",
      "How it's given — in food, pill pocket, by hand",
      "Where the medication is stored",
      "What it's for, in simple terms",
      "What a missed dose situation should look like — call owner or vet first",
      "Any side effects to watch for",
      "Refill information if the sitter's stay is longer than the supply",
      "Prescribing vet's name and contact info",
    ],
  },
  {
    role: "behavior-quirks",
    title: "Behavior,\nQuirks & Triggers",
    subtitle: "The things you'd tell a friend if they were watching your pet for the first time.",
    items: [
      "What tends to stress or startle them",
      "What reliably calms them down",
      "How they react to strangers at the door",
      "How they do around other animals",
      "Any resource guarding around food, toys, or space",
      "Noise sensitivities — thunderstorms, fireworks, vacuum, etc.",
      "Separation habits — do they settle quickly or take time",
      "Any commands or cues they respond to best",
      "One thing that always makes them happy",
    ],
  },
  {
    role: "leash-walking-notes",
    title: "Leash &\nWalking Notes",
    subtitle: "For anyone taking them outside — walks, potty breaks, or the yard.",
    items: [
      "Preferred leash, harness, or collar and how it's fastened",
      "Whether they pull, and any technique that helps",
      "Reactivity to other dogs, people, bikes, or cars",
      "Favorite walking route or park, if any",
      "Off-leash reliability — yes, no, or only in a fenced area",
      "How they signal needing a bathroom break",
      "Weather considerations — heat, cold, or paw sensitivity",
      "What to do if they slip a collar or leash (see What To Do If page)",
      "Whether they're comfortable meeting other dogs on walks",
    ],
  },
  {
    role: "house-access",
    title: "House Access\nInstructions",
    subtitle: "The practical logistics of getting in, staying comfortable, and locking up.",
    items: [
      "How to get in — key location, lockbox code, or garage code",
      "Alarm system code and how to arm/disarm it",
      "Wifi network name and password",
      "Thermostat instructions and preferred temperature range",
      "Trash and recycling day, if the sitter's stay overlaps",
      "Mail or package handling instructions",
      "Rooms or areas that are off-limits",
      "Where cleaning supplies and pet-mess supplies are kept",
      "Any neighbors who know a sitter will be coming and going",
    ],
  },
  {
    role: "emergency-contacts",
    title: "Emergency\nContacts",
    subtitle: "Fill this out before you leave and post it somewhere visible.",
    items: [
      "Regular vet clinic name, phone number, and address",
      "Nearest 24-hour emergency animal hospital and phone number",
      "Pet insurance provider and policy number, if applicable",
      "Owner's cell phone and best way to reach them while away",
      "A trusted local backup contact if the owner is unreachable",
      "Building manager or landlord contact, if relevant",
      "Poison control or animal poison hotline number",
      "Where the pet carrier is kept, for emergency transport",
      "Any standing authorization for the sitter to approve emergency vet care",
    ],
  },
  {
    role: "what-to-do-if",
    title: "What To Do If...\n(Scenario Guide)",
    subtitle: "A few common situations, so a sitter isn't guessing under pressure.",
    items: [
      "They won't eat a meal: note it, try once more later, call if it continues past 24 hours",
      "They seem lethargic or \"off\": note specifics and call the owner to discuss",
      "They vomit once but seem otherwise fine: monitor, note it, mention at pickup",
      "They get loose or escape: check known hiding/favorite spots first, then notify owner immediately",
      "A medication dose is missed: do not double up — call the owner or vet for guidance",
      "There's a knock at the door from someone unexpected: don't let the pet near the door unsupervised",
      "Severe weather hits during a walk: head home immediately, prioritize safety over finishing the route",
      "Something seems seriously wrong: go to the emergency vet listed above, then call the owner",
      "You're simply unsure about something: when in doubt, call — better a quick question than a guess",
    ],
  },
  {
    role: "sitter-daily-log",
    title: "Sitter's\nDaily Log",
    subtitle: "A quick daily note back to the owner — meals, walks, mood, anything worth mentioning.",
    items: [
      "Date and which visit or day this covers",
      "Meals given and how much was eaten",
      "Walks or outdoor time completed",
      "Medication given, if applicable",
      "General mood and energy level today",
      "Anything unusual noticed today",
      "Anything the sitter needs from the owner",
      "A quick highlight from today worth sharing",
      "Confirmed the home was left secure after the visit",
    ],
  },
  {
    role: "house-rules",
    title: "House Rules\n& Boundaries",
    subtitle: "The small preferences that make a sitter's stay feel like it matches how you actually live.",
    items: [
      "Furniture and bed access — allowed or not, and where",
      "Whether the pet is allowed in the kitchen during meal prep",
      "Rules around guests visiting during the sitter's stay",
      "Whether the pet can be left alone, and for how long",
      "Preferred way to handle nail trims, brushing, or grooming touch-ups",
      "How to handle visitors at the door — greet, crate, or separate room",
      "Any household member (human or pet) with special handling needs",
      "Preferred bedtime routine for the pet",
      "Anything the owner considers a hard no",
    ],
  },
  {
    role: "departure-return-checklist",
    title: "Departure &\nReturn Checklist",
    subtitle: "A simple checklist for the owner, before leaving and right after getting back.",
    items: [
      "Left enough food, treats, and any medication for the full stay",
      "Filled in every page of this binder before the sitter arrives",
      "Introduced the sitter to the pet in person if this is their first visit",
      "Shared this binder and all access codes with the sitter",
      "Confirmed the sitter's contact info and check-in schedule",
      "Left a copy of this binder both printed and saved digitally",
      "On return: checked in with the sitter about how the stay went",
      "On return: reviewed the sitter's daily log entries",
      "On return: thanked the sitter and noted anything for next time",
    ],
  },
];

const IMPORTANT_INFO_LINES = [
  "This is an organizational and communication tool, not veterinary or professional advice.",
  "Always confirm emergency care decisions with your vet or the pet's owner when possible.",
  "Instant digital download — no physical item will be shipped.",
  "Re-download and re-print this binder for every trip so the information stays current.",
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
4. A 3-ring binder works best so pages (especially the Daily Log) can be
   swapped or reprinted for each new trip.

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
    `Leaving your pet with a sitter, walker, or boarder is so much easier when everything they need to know is in one place — not scattered across texts you're trying to remember while you're already at the airport.`,
    `What's included:`,
    `- 13 pages: title page + a Pet Profile, Daily Routine Schedule, Feeding Instructions, Medication Instructions, Behavior & Triggers, Leash & Walking Notes, House Access Instructions, Emergency Contacts, a "What To Do If" scenario guide, a Sitter's Daily Log, House Rules, and a Departure & Return Checklist`,
    `- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live`,
    `- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download`,
    `- A short printing guide and personal-use license included`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can fill it out before your very next trip.`,
    `This is an organizational and communication tool, not veterinary or professional advice — always confirm emergency care decisions with your vet or the pet's owner when possible.`,
    `For personal use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "pet sitter binder",
    "dog sitter printable",
    "pet care instructions",
    "house sitter binder",
    "pet emergency sheet",
    "dog walker notes",
    "pet boarding binder",
    "pet care checklist",
    "dog sitting printable",
    "pet feeding chart",
    "printable pdf",
    "instant download",
    "pet owner printable",
  ].map((t) => truncate(t, LISTING_LIMITS.maxTagLength));
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "Travel", style: "Minimalist", recipient: "Pet owner", color: "Wildflower neutral", primaryColor: "Tan" };
  const category = "pet_supplies_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 7.5; // consistent with the other multi-page checklist bundles' pricing tier

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
            "13 pages: title page + 12 focused sitter hand-off pages",
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
            "Everything a sitter needs in one organized binder",
            "Covers routine, feeding, meds, behavior, and access all at once",
            "A dedicated 'What To Do If' scenario guide for peace of mind",
            "Reusable for every future trip or sitter",
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
            "Fill it out once and reprint the Daily Log for each trip",
            "Hand it to a pet sitter, dog walker, or family member",
            "Keep a copy at home and share a photo/PDF copy with the sitter",
            "A thoughtful gift for a friend who travels often with pets",
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
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6. In Etsy's listing editor, type a description of the actual product — e.g. "pet sitter printable" or "pet care binder" — into the category search field and Etsy will suggest real, current categories live.)\n`,
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
