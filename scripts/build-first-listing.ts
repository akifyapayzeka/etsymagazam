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
 * (packages/qa), just orchestrated by hand for a 13-page bundle instead of
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
const PRODUCT_TITLE = "The 3-3-3 Rescue Dog Decompression & Adjustment Bundle";

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

// --- Content: the 13-page bundle -------------------------------------------
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
    role: "72-hours",
    title: "First 72 Hours:\nCalm-Home Plan",
    subtitle: "A simple plan for the first three days — focus on calm, not commands.",
    items: [
      "Picked one quiet, low-traffic room as their home base",
      "Set up food, water, and a bed in that same spot each time",
      "Kept the leash on for every outdoor bathroom break, even in a fenced yard",
      "Blocked off exits and hiding spots you don't want them to access",
      "Put away other pets' toys/bowls until everyone has settled in",
      "Planned no visitors, parties, or outings for the first 72 hours",
      "Kept the household calm: lower voices, fewer sudden movements",
      "Let them approach you first — no forced petting or eye contact",
      "Confirmed who is \"on duty\" for the first 72 hours if multiple people live here",
    ],
  },
  {
    role: "safe-space",
    title: "Safe Space\nSetup",
    subtitle: "Give them one place in the home that always feels safe and predictable.",
    items: [
      "Chose a quiet spot away from doors, windows, and foot traffic",
      "Set up a crate, bed, or mat with a blanket that has a familiar scent",
      "Made sure the space has an exit they can see and reach — never a dead end",
      "Kept the space consistent — same spot, same bedding, every day",
      "Told household members this spot is off-limits when they're using it",
      "Added a chew toy or enrichment item they can self-soothe with",
      "Checked the spot is a comfortable temperature (not near vents/drafts)",
      "Introduced kids and guests to the \"leave them alone here\" rule",
      "Noted whether they're using the space on their own by day 3",
    ],
  },
  {
    role: "routine-builder",
    title: "Daily Routine\nBuilder",
    subtitle: "Predictability helps a nervous dog relax faster. Build the same simple loop each day.",
    items: [
      "Set a consistent wake-up time (within about 30 minutes daily)",
      "Set 2–3 consistent feeding times at the same spot each day",
      "Scheduled a short morning walk or yard time, same time each day",
      "Set aside 5–10 minutes of quiet, low-key attention time",
      "Scheduled a consistent \"settle\" period (crate, mat, or safe space)",
      "Set a consistent bedtime and wind-down routine",
      "Picked one consistent word for mealtime and one for walk time",
      "Wrote the routine somewhere visible for everyone in the house",
      "Kept the routine as similar as possible on weekends too",
    ],
  },
  {
    role: "observation-log",
    title: "Food, Water &\nSleep Watch List",
    subtitle: "Simple things to notice each day — not a diagnosis, just useful patterns to track.",
    items: [
      "Noted whether they ate a full, partial, or no meal today",
      "Noted whether they drank water normally, more than usual, or barely at all",
      "Noted roughly how many hours they slept vs. stayed alert and watchful",
      "Noted any change in bathroom habits worth mentioning at their vet visit",
      "Noted whether meals were eaten calmly or anxiously/quickly",
      "Noted any day where sleep or appetite was notably different from the day before",
      "Circled or starred any pattern that repeated 3+ days in a row",
      "Wrote down the date they started eating full meals consistently",
      "Flagged anything unusual to bring up at their first vet visit",
    ],
  },
  {
    role: "trigger-comfort-log",
    title: "Trigger &\nComfort Log",
    subtitle: "Notice what unsettles them and what helps — this becomes your dog's personal playbook.",
    items: [
      "Noted specific sounds that caused a startle or freeze response",
      "Noted specific situations (guests, cars, other dogs) that raised alertness",
      "Noted the earliest signs of stress you saw (yawning, lip licking, stiffening)",
      "Noted what helped them settle back down each time",
      "Noted their favorite calming spot, toy, or activity so far",
      "Noted which family member or approach they responded to most calmly",
      "Noted any trigger that seemed to fade with repeated calm exposure",
      "Wrote down one thing to avoid repeating that clearly overwhelmed them",
      "Starred any trigger worth discussing with a certified trainer",
    ],
  },
  {
    role: "first-3-days-reflection",
    title: "First 3 Days:\nA Reflection",
    subtitle: "A short space to process this huge transition — for the dog, and for you.",
    items: [
      "What surprised you most about their personality so far?",
      "What was harder than you expected these first few days?",
      "What went better than you expected?",
      "What's one small win worth celebrating from today?",
      "What's one thing you'd do differently if you were starting over?",
      "How are you feeling about this transition, honestly?",
      "What questions are you still sitting with after day 3?",
      "What's one thing you're already grateful for about this dog?",
      "What's one thing you want to remember about this exact moment?",
    ],
  },
  {
    role: "weeks-1-3",
    title: "Weeks 1–3:\nRoutine Tracker",
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
    title: "Months 1–3:\nProgress Tracker",
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
    role: "vet-trainer-questions",
    title: "Questions For Your\nVet or Trainer",
    subtitle: "Bring this list to your first appointment — you don't have to remember everything.",
    items: [
      "Is their weight, coat, and energy level within a healthy range?",
      "What vaccinations or preventive care are due, and when?",
      "Is their current food appropriate, or should we discuss alternatives?",
      "What's a realistic timeline for house-training or routine adjustment?",
      "Which logged behaviors are typical adjustment vs. worth watching?",
      "Would a certified trainer help with a specific behavior I've noted?",
      "What's the best way to introduce them to other pets or people safely?",
      "Are there local classes, trainers, or behaviorists you'd recommend?",
      "What symptoms should prompt an immediate call, not a wait-and-see?",
    ],
  },
  {
    role: "emergency-info",
    title: "New Home\nEmergency Information",
    subtitle: "Fill this out once and keep it somewhere everyone in the household can find it.",
    items: [
      "Vet clinic name, phone number, and address",
      "Nearest 24-hour emergency animal hospital and phone number",
      "Microchip number and registry, if known",
      "Adoption or rescue organization contact, in case of questions",
      "Current medications, supplements, or known allergies",
      "Emergency contact person if you're unreachable",
      "Pet insurance provider and policy number, if applicable",
      "Where their leash, carrier, and go-bag are kept",
      "A recent photo saved somewhere easy to find, in case they get lost",
    ],
  },
  {
    role: "family-consistency",
    title: "Family\nConsistency Sheet",
    subtitle: "Everyone in the house using the same rules and words helps them settle in faster.",
    items: [
      "Agreed on the same word for mealtime across all household members",
      "Agreed on the same word for walks and potty breaks",
      "Agreed on whether furniture and bed access is allowed, and where",
      "Agreed on who feeds, walks, and lets them out, and when",
      "Agreed on how guests should (and shouldn't) greet them at first",
      "Agreed on what to do if they seem overwhelmed at a family gathering",
      "Posted the routine somewhere every household member can see it",
      "Talked with kids about giving space and reading calm body language",
      "Checked in as a household after week 1 on what's working and what isn't",
    ],
  },
  {
    role: "progress-without-deadlines",
    title: "Progress Without\nDeadlines",
    subtitle: "The 3-3-3 rule is a guide, not a deadline. Every dog moves at their own pace.",
    items: [
      "Sign of progress: taking treats gently from your hand",
      "Sign of progress: choosing to be in the same room as you, unprompted",
      "Sign of progress: a relaxed body — soft eyes, loose tail, normal breathing",
      "Sign of progress: a full-body shake-off after something stressful (a great sign!)",
      "Sign of progress: seeking you out for comfort or attention",
      "Sign of progress: playful moments, even short or clumsy ones",
      "Reminder: setbacks are normal and don't erase progress already made",
      "Reminder: \"on their own timeline\" is a real strategy, not a lack of one",
      "Gave yourself credit for the patience this journey has taken",
    ],
  },
];

const IMPORTANT_INFO_LINES = [
  "This is an organizational tool, not veterinary or professional training advice or a medical diagnosis.",
  "Every dog adjusts at their own pace — treat these as gentle guidelines, not a strict schedule.",
  "For behavioral or health concerns, please consult a certified trainer or your veterinarian.",
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
      pngs.push({ role: `${String(i + 1).padStart(2, "0")}-${page.role}`, buffer: png });
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
  // usedAiText: true is accurate for BOTH the listing description below AND
  // this product's own checklist page text (checklistPages above) — all of
  // that written content was drafted with AI assistance. The page layout,
  // typography, and rendering are deterministic (satori/resvg), not AI —
  // see packages/qa/src/config/ai-disclosure-policy.json for the exact,
  // re-verified wording this maps to.
  const aiDisclosureLine = buildAiDisclosureText({ usedAiText: true, usedAiImages: false });
  const title = truncate(
    "3-3-3 Rescue Dog Adjustment Bundle | 12-Page Printable Planner for New Shelter & Rescue Dogs | Instant Download PDF",
    LISTING_LIMITS.maxTitleLength,
  );
  const description = [
    `Just brought home a rescue or shelter dog? The first 3 months are the hardest to navigate — and this bundle turns the widely-recommended "3-3-3 rule" (3 days, 3 weeks, 3 months) into a complete, printable system so you always know what's normal and what to focus on next.`,
    `This isn't a single checklist — it's a full 12-page adjustment system covering the parts most trackers skip: a First 72 Hours calm-home plan, a Safe Space setup guide, a Daily Routine Builder, a Food/Water/Sleep watch list, a Trigger & Comfort log, a First 3 Days reflection page, Week 1-3 and Month 1-3 trackers, a Questions-for-Vet-or-Trainer prep page, a New Home Emergency Information sheet, a Family Consistency sheet for multi-person households, and a Progress Without Deadlines page so you never feel behind schedule.`,
    `What's included:`,
    `- 12 focused pages plus a title page (13 pages total), covering setup, daily routine, observation logs, reflection, vet/trainer prep, emergency info, and family alignment`,
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
    "dog adjustment",
    "printable pdf",
    "pet planner",
    "foster dog",
    "dog tracker",
    "3 3 3 rule",
    "instant download",
    "dog printable",
  ];
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "New pet", style: "Minimalist", recipient: "Pet owner", color: "Sage green", primaryColor: "Green" };
  const category = "pet_supplies_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 8.5; // see listing-data/etsy-price.txt — only valid IF the connected shop's currency is USD; never state this figure blind against a non-USD shop

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
            "13 pages: title page + 12 focused planner pages covering setup, routine, logs, and reflection",
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
            "Covers the whole first 3 months — setup, routine, logs, vet/trainer prep, and family alignment",
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
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6 for how it's fetched for real once OAuth is connected. Do NOT force this into an unrelated craft-supply category just because it's digital. In Etsy's listing editor, type a description of the actual product — e.g. "pet adjustment planner" or "dog printable" — into the category search field and Etsy will suggest real, current categories live. Pick whichever suggested category is the closest match to this specific listing at the time you create it; Etsy's own category taxonomy can change, so trust its live suggestions over this hint.)\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-price.txt"),
    `${priceUsd.toFixed(2)} (only valid if the connected Etsy shop's currency is USD)\n\nThis figure is a reference price computed in USD. Etsy's price field has no currency parameter on write — it always uses whatever currency the shop itself is set to. Before entering a price:\n1. Check the shop's currency in Etsy Shop Manager > Finances > Payment account (or Settings).\n2. If the shop currency is USD, enter ${priceUsd.toFixed(2)}.\n3. If the shop currency is anything other than USD (e.g. TRY), do NOT enter ${priceUsd.toFixed(2)} as the number — that would be the wrong amount in the wrong currency. Convert ${priceUsd.toFixed(2)} USD to the shop's currency at a current exchange rate first, then enter that converted amount.\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-attributes.json"),
    JSON.stringify(
      {
        ...attributes,
        materials,
        who_made: "i_did",
        // "made_to_order" is ONLY for items specially made after a specific
        // customer's order — this is a pre-rendered, ready-made instant
        // download, so it must use the real date-range value covering when
        // it was actually created (see packages/etsy/src/types.ts
        // EtsyWhenMade for the full enum, verified against Etsy's live API).
        when_made: "2020_2026",
        type: "download",
        quantity: 999,
        should_auto_renew: true,
      },
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
