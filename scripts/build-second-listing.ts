#!/usr/bin/env tsx
/**
 * Builds Form & Fern's SECOND real, sellable Etsy digital product end to end
 * and assembles the manual-publish package at artifacts/second-live-listing/.
 *
 * Same one-off pattern as scripts/build-first-listing.ts: reuses the exact
 * same deterministic rendering primitives (packages/product-generator —
 * satori + resvg + pdf-lib, no AI in layout or typography) and the exact
 * same QA/IP-guard modules (packages/qa). Different category/theme from the
 * first listing on purpose — see artifacts/second-live-listing/WHY_THIS_PRODUCT.json.
 *
 * Run: pnpm tsx scripts/build-second-listing.ts
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
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "second-live-listing");
const WORK_DIR = path.join(REPO_ROOT, "storage", "second-listing-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "minimal";
const PRODUCT_SLUG = "new-job-90-day-confidence-kit";
const PRODUCT_TITLE = "New Job Confidence Kit: 90-Day Printable Planner for Starting a New Job | Career Onboarding PDF";

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
// Written from scratch, original organizational content. Deliberately does
// NOT use "The First 90 Days" as a title or reproduce any framework/model
// from Michael Watkins' book of that name (STARS model, "diagnose the
// business", etc.) — "first 90 days at a new job" is used only as a plain,
// widely-used descriptive phrase for the onboarding period, and the content
// below (people tracker, culture log, boundaries page, etc.) is original.

const coverSpec = {
  eyebrow: "FOR YOUR FIRST DAY AND BEYOND",
  title: "New Job\nConfidence Kit",
  subtitle: "Day One · Week One · 90 Days",
  bodyLines: ["A calm, structured way to navigate a new job —", "without losing yourself in the overwhelm."],
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
    role: "before-day-one",
    title: "Before Day One:\nPrep Checklist",
    subtitle: "A calm start begins the night before. Get the logistics handled so day one is one less thing to worry about.",
    items: [
      "Confirmed start time, location (or login details), and dress code",
      "Laid out or packed what you're wearing the next morning",
      "Test-ran the commute or logged in early to check remote access",
      "Gathered ID, bank details, and any paperwork HR asked for",
      "Charged your phone and laptop, and packed a charger",
      "Wrote down your new manager's name and how to reach them",
      "Prepped one or two questions you want to ask on day one",
      "Planned a simple, ready-to-go breakfast and lunch",
      "Set an alarm with extra buffer time — arriving early beats rushing",
    ],
  },
  {
    role: "day-one-survival",
    title: "Day One\nSurvival Checklist",
    subtitle: "You don't need to have it all figured out today — just get through it, one step at a time.",
    items: [
      "Brought a notebook or this kit to jot down names and instructions",
      "Practiced a short, simple way to introduce yourself",
      "Asked where the bathroom, kitchen, and exits are — no shame in asking",
      "Wrote down every name you heard, even if you'll double check later",
      "Asked what to do at lunchtime instead of guessing",
      "Gave yourself permission to say \"I'm not sure yet, I'll find out\"",
      "Noted one thing that felt reassuring or went smoothly today",
      "Noted one question to ask tomorrow instead of stressing tonight",
      "Did one small thing for yourself after work, regardless of how it went",
    ],
  },
  {
    role: "people-tracker",
    title: "People &\nNames Tracker",
    subtitle: "You'll meet a lot of people fast. A quick note beats trying to remember it all in your head.",
    items: [
      "Logged their name, role, and team for everyone you met today",
      "Noted one memorable detail to help the name stick",
      "Marked who your day-to-day go-to person seems to be",
      "Marked who to ask about IT, HR, and building/office logistics",
      "Noted who seemed friendly and easy to ask a follow-up question",
      "Noted anyone you specifically want to reconnect with this week",
      "Flagged names you're still unsure how to pronounce, to check quietly",
      "Reviewed your list at the end of each day while it's still fresh",
      "Set a reminder to review the whole list again at the end of week one",
    ],
  },
  {
    role: "culture-log",
    title: "Culture &\nUnwritten Rules Log",
    subtitle: "Every workplace has norms nobody writes down. Notice them instead of guessing.",
    items: [
      "Noted how people actually communicate — chat, email, in person",
      "Noted the real meeting norms — on time, cameras on, how casual",
      "Noted the actual dress code, not just what the handbook says",
      "Noted how decisions seem to get made and who's usually in the room",
      "Noted what \"urgent\" seems to mean here in practice",
      "Noted how people handle being unsure — do they ask, or dig in alone",
      "Noted anything that surprised you compared to your last workplace",
      "Noted one unwritten rule you picked up on just by observing",
      "Circled anything worth asking a trusted coworker to confirm",
    ],
  },
  {
    role: "first-week-reflection",
    title: "First Week:\nA Reflection",
    subtitle: "A short space to process this transition — it's a big one, even when it's a good change.",
    items: [
      "What surprised you most about the role or the team so far?",
      "What was harder than you expected this week?",
      "What went better than you expected?",
      "What's one small win worth celebrating from this week?",
      "What's one thing you'd do differently if the week started over?",
      "How are you feeling about this change, honestly?",
      "What questions are you still sitting with after week one?",
      "What's one thing you're already glad about with this move?",
      "What's one thing you want to remember about this exact moment?",
    ],
  },
  {
    role: "30-day-checkin",
    title: "30-Day Check-In:\nWins & Adjustments",
    subtitle: "The new-job fog usually starts lifting around now. Take stock of where things stand.",
    items: [
      "Listed 3 things you've learned that felt confusing at first",
      "Listed one win you're proud of from the first month",
      "Noted a task or process you're still finding your footing with",
      "Noted whether your workload feels realistic or needs a conversation",
      "Identified one relationship at work you want to build further",
      "Noted whether you've settled into a basic daily rhythm yet",
      "Wrote down one thing to bring up at your next check-in with your manager",
      "Noted how your energy levels have been most days",
      "Gave yourself credit for making it through the first month",
    ],
  },
  {
    role: "60-day-checkin",
    title: "60-Day Check-In:\nBuilding Your Routine",
    subtitle: "Less scrambling, more rhythm. Start layering in the habits that make the job sustainable.",
    items: [
      "Set a consistent start-of-day routine that works for this role",
      "Identified your most productive hours and protected them where you can",
      "Built a simple system for tracking tasks so nothing slips",
      "Noted which meetings are genuinely useful vs. optional for you",
      "Started saying no (politely) to requests outside your role, when needed",
      "Checked in with yourself on work-life balance so far",
      "Identified one skill you want to strengthen over the next month",
      "Noted one process you could suggest improving, when the time feels right",
      "Reviewed your 30-day notes to see how far you've already come",
    ],
  },
  {
    role: "90-day-checkin",
    title: "90-Day Check-In:\nProgress Without Comparison",
    subtitle: "This is where it starts to feel like your job, not just a new one. Comparison to tenured coworkers isn't a fair yardstick.",
    items: [
      "Noted something you now do without thinking that once felt hard",
      "Noted a moment someone relied on your knowledge or judgment",
      "Reviewed whether the role matches what you expected going in",
      "Identified a goal for the next 90 days, not just the last 90",
      "Noted a relationship at work that's become genuinely comfortable",
      "Reminder: everyone's ramp-up timeline looks different — yours is valid",
      "Reminder: asking questions at 90 days is still completely normal",
      "Noted one thing you'd tell a friend starting a new job tomorrow",
      "Gave yourself real credit for the effort these 90 days have taken",
    ],
  },
  {
    role: "manager-1-1-prep",
    title: "Manager 1:1\nPrep Sheet",
    subtitle: "Use this before any check-in with your manager so you walk in with something to say, not just to listen.",
    items: [
      "Listed 1-2 wins or progress points to mention this check-in",
      "Listed 1-2 things you're currently stuck on or unsure about",
      "Noted any workload or priority question you want clarity on",
      "Noted any resource, access, or support you still need",
      "Prepared one question about how your manager prefers to communicate",
      "Prepared one question about what success looks like in this role",
      "Left space to jot down what your manager says during the check-in",
      "Noted any follow-up items to complete before the next check-in",
      "Reviewed last check-in's notes before walking into this one",
    ],
  },
  {
    role: "questions-worth-asking",
    title: "Questions\nWorth Asking",
    subtitle: "Organize your questions here so you don't have to hold them all in your head — bring this to onboarding sessions or 1:1s.",
    items: [
      "What does success look like in this role at 30, 60, and 90 days?",
      "Who are the key people I should build a relationship with early on?",
      "What tools, systems, or docs should I get familiar with first?",
      "How does this team prefer to give and receive feedback?",
      "What's the best way to reach you if something urgent comes up?",
      "Are there any team traditions or norms I should know about?",
      "What's a common mistake new hires make here that I can avoid?",
      "What resources exist if I want to grow or upskill in this role?",
      "Who can I ask if I have a question you're not the right person for?",
    ],
  },
  {
    role: "boundaries-energy",
    title: "Boundaries &\nEnergy Management",
    subtitle: "New-job fatigue is real. This page is about organizing your own limits, not professional or medical advice.",
    items: [
      "Set a rough end-of-day cutoff for checking messages",
      "Identified one thing outside work that recharges you and scheduled it",
      "Noted your realistic weekly capacity vs. what's being asked of you",
      "Practiced one polite way to say \"let me check and get back to you\"",
      "Noted any early sign of overwhelm worth paying attention to",
      "Identified one person you can be honest with if things feel like too much",
      "Set a reminder to actually take your lunch break, not skip it",
      "Reviewed whether your commute/schedule is sustainable long-term",
      "Reminder: settling in takes real time — pace yourself accordingly",
    ],
  },
  {
    role: "contacts-logistics",
    title: "Key Contacts &\nLogistics Sheet",
    subtitle: "Fill this out during week one and keep it somewhere easy to find.",
    items: [
      "HR contact name, email, and phone extension",
      "IT helpdesk contact and how to submit a request",
      "Direct manager's name, email, and preferred contact method",
      "Benefits enrollment deadline and where to complete it",
      "Building/office access: badge, parking, or entry instructions",
      "Payroll contact or portal for pay and timesheet questions",
      "Team distribution list or main chat group name",
      "Emergency contact procedure if you're sick or running late",
      "Login portal links for key systems you'll use regularly",
    ],
  },
];

const IMPORTANT_INFO_LINES = [
  "This is an organizational tool, not professional HR, legal, career coaching, or mental health advice.",
  "Every job and every workplace is different — treat these as gentle prompts, not a strict script.",
  "For workplace concerns, please talk to your manager, HR, or a qualified professional as appropriate.",
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
  const digitalFilesForEtsy = [...customerFiles.ZIP, ...customerFiles.PDF];
  if (digitalFilesForEtsy.length > LISTING_LIMITS.maxDigitalFiles) {
    throw new Error(`Too many digital files for one Etsy listing: ${digitalFilesForEtsy.length} > ${LISTING_LIMITS.maxDigitalFiles}`);
  }

  console.log(`2. Customer bundle written: ${zipEntries.length} files zipped, ${customerFiles.PDF.length} convenience PDFs\n`);

  // --- 3. SEO copy ---------------------------------------------------------
  const aiDisclosureLine = buildAiDisclosureText({ usedAiText: true, usedAiImages: false });
  const title = truncate(PRODUCT_TITLE, LISTING_LIMITS.maxTitleLength);
  const description = [
    `Starting a new job is exciting — and genuinely overwhelming. This 90-day printable system turns "just wing it" into a calm, structured plan so you always know what to focus on next, from the night before day one through your 90-day check-in.`,
    `This isn't a single onboarding checklist — it's a full 13-page confidence-building system covering what most new-hire checklists skip: a before-day-one prep list, a day one survival checklist, a People & Names Tracker, a Culture & Unwritten Rules Log, a First Week Reflection, 30/60/90-day check-ins, a Manager 1:1 Prep Sheet, a Questions Worth Asking organizer, a Boundaries & Energy Management page, and a Key Contacts & Logistics Sheet.`,
    `What's included:`,
    `- 13 pages total (title page + 12 focused planner pages) covering prep, day one, people, culture, reflection, and check-ins`,
    `- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live`,
    `- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download`,
    `- A short printing guide and personal-use license included`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can start using it before your first day.`,
    `This is an organizational tool, not professional HR, legal, career coaching, or mental health advice — for workplace concerns, please talk to your manager, HR, or a qualified professional.`,
    `For personal use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "new job planner",
    "onboarding kit",
    "first 90 days",
    "career printable",
    "new job checklist",
    "job anxiety",
    "work planner",
    "new hire gift",
    "career planner",
    "job confidence",
    "printable pdf",
    "instant download",
    "new employee",
  ];
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "New job", style: "Minimalist", recipient: "Adult", color: "Black and white", primaryColor: "Black" };
  const category = "career_planner_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 7.5; // see listing-data/etsy-price.txt — only valid IF the connected Etsy shop's currency is USD

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
            "13 pages: title page + 12 focused planner pages covering prep, day one, people, culture, and check-ins",
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
            "Structured around the natural arc of the first 90 days at a new job",
            "Covers prep, day one, people, culture, reflection, and manager check-ins",
            "A calm, judgment-free way to track what's normal",
            "Reusable for every future job change or career transition",
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
            "Keep it in your bag or on your desk during your first 90 days",
            "Fill it out daily/weekly to track names, wins, and questions",
            "A thoughtful gift for a friend starting a new job",
            "Bring the 1:1 prep and questions pages straight into meetings",
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

  // --- 5. QA: technical + IP/policy + SEO + placeholder-leakage -----------
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

  // --- 6. Assemble artifacts/second-live-listing/ --------------------------
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
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6 for how it's fetched for real once OAuth is connected. In Etsy's listing editor, type a description of the actual product — e.g. "career planner printable" or "new job checklist" — into the category search field and Etsy will suggest real, current categories live. Pick whichever suggested category is the closest match to this specific listing at the time you create it.)\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-price.txt"),
    `${priceUsd.toFixed(2)} (only valid if the connected Etsy shop's currency is USD)\n\nThis figure is a reference price computed in USD. Etsy's price field has no currency parameter on write — it always uses whatever currency the shop itself is set to. Before entering a price:\n1. Check the shop's currency in Etsy Shop Manager > Finances > Payment account (or Settings).\n2. If the shop currency is USD, enter ${priceUsd.toFixed(2)}.\n3. If the shop currency is anything other than USD (e.g. TRY), do NOT enter ${priceUsd.toFixed(2)} as the number — convert it to the shop's currency at a current exchange rate first, then enter that converted amount.\n`,
    "utf8",
  );
  await writeFile(
    path.join(OUT_DIR, "listing-data", "etsy-attributes.json"),
    JSON.stringify(
      {
        ...attributes,
        materials,
        who_made: "i_did",
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
