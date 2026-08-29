#!/usr/bin/env tsx
/**
 * Builds Form & Fern's SIXTH product: 2026-2027 Student Semester Reset Planner.
 *
 * Education/planner category, checklist template. A semester-level academic
 * planning system (syllabus intake, class tracking, exam prep, campus
 * resources, semester-specific budgeting, finals survival, reflection) —
 * deliberately distinct from the existing Weekly Reset Checklist (daily/
 * weekly household reset) and Monthly Budget Planner (general personal
 * finance) products: this one is academic-calendar-scoped and student-specific.
 *
 * Run: pnpm tsx scripts/build-sixth-listing.ts
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
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "sixth-live-listing");
const WORK_DIR = path.join(REPO_ROOT, "storage", "sixth-listing-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "sage";
const PRODUCT_SLUG = "2026-2027-student-semester-reset-planner";
const PRODUCT_TITLE = "2026-2027 Student Semester Reset Planner: Printable Academic Planner for College & High School";

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
  eyebrow: "2026–2027 ACADEMIC YEAR",
  title: "Student Semester\nReset Planner",
  subtitle: "Start the semester organized. Stay that way through finals.",
  bodyLines: ["A full academic-term system —", "from syllabus week to the last exam."],
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
    role: "semester-setup",
    title: "Semester\nSetup",
    subtitle: "Do this during the first week, while every syllabus is still fresh.",
    items: [
      "Listed every class you're enrolled in for the term",
      "Added the add/drop deadline to your calendar",
      "Added the withdrawal deadline to your calendar",
      "Added each class's final exam date and time",
      "Noted which classes have mandatory attendance policies",
      "Noted which classes allow laptops/recording and which don't",
      "Bought or rented all required textbooks and materials",
      "Set up folders (physical or digital) for each class",
      "Blocked out a realistic weekly study-time estimate per class",
    ],
  },
  {
    role: "class-schedule-tracker",
    title: "Class Schedule\nTracker",
    subtitle: "One row per class — fill in as you confirm each syllabus.",
    items: [
      "Class name, course number, and credit hours",
      "Professor or instructor name and contact info",
      "Office hours location and times",
      "Class meeting days, times, and room/link",
      "Grading breakdown (% for exams, homework, participation)",
      "Late work and attendance policy in your own words",
      "TA or tutoring contact if the class has one",
      "Where lecture notes/recordings get posted, if applicable",
      "One thing you want to remember about this professor's expectations",
    ],
  },
  {
    role: "assignment-deadline-tracker",
    title: "Assignment &\nDeadline Tracker",
    subtitle: "A running list — add to it as new assignments get announced throughout the term.",
    items: [
      "Assignment name and which class it's for",
      "Due date and time (note the exact time zone if it's online)",
      "Estimated time needed to complete it realistically",
      "Whether it's individual or group work",
      "Submission method (portal, email, in-person, etc.)",
      "Marked whether it's been started, in progress, or submitted",
      "Noted the grade or feedback once returned",
      "Flagged anything that overlaps with another deadline",
      "Reviewed this list at the start of each week",
    ],
  },
  {
    role: "exam-prep-planner",
    title: "Exam Prep\nPlanner",
    subtitle: "Start this 2-3 weeks before a big exam, not the night before.",
    items: [
      "Confirmed the exam format (multiple choice, essay, mixed, open-book)",
      "Confirmed what material is covered — which chapters/weeks",
      "Gathered notes, slides, and readings into one place",
      "Made a study schedule working backward from the exam date",
      "Identified your weakest topics to prioritize first",
      "Found or made practice questions to test yourself",
      "Scheduled a study group or office-hours visit if needed",
      "Planned what to eat and how to sleep the night before",
      "Packed everything you need for exam day the night before",
    ],
  },
  {
    role: "study-routine-builder",
    title: "Weekly Study\nRoutine Builder",
    subtitle: "A consistent rhythm beats last-minute cramming — sketch out a realistic weekly plan.",
    items: [
      "Blocked out set study times for each class during the week",
      "Identified your most focused hours and protected them",
      "Picked a consistent study location that actually works for you",
      "Scheduled short breaks so study blocks don't burn you out",
      "Set a weekly time to review notes from that week's classes",
      "Built in buffer time for unexpected assignments",
      "Scheduled at least one full rest day or evening per week",
      "Noted which study method works best for which class",
      "Reviewed and adjusted the routine after the first two weeks",
    ],
  },
  {
    role: "reading-list-tracker",
    title: "Reading &\nAssignment List Tracker",
    subtitle: "Track required readings separately from graded assignments so nothing slips through.",
    items: [
      "Title or chapter and which class it's assigned for",
      "Due date or the class it needs to be done before",
      "Estimated pages or time to complete",
      "Marked whether it's been read, skimmed, or not started",
      "Noted key takeaways for later review before exams",
      "Flagged anything you'll want to reference in a paper later",
      "Noted any readings that were unexpectedly difficult",
      "Checked whether a reading has a companion quiz or discussion post",
      "Reviewed completed readings before the related class discussion",
    ],
  },
  {
    role: "campus-resources",
    title: "Campus Resources\nChecklist",
    subtitle: "Know where these are before you actually need them, not during a crisis.",
    items: [
      "Location and hours of the tutoring or academic support center",
      "Location and hours of the writing center, if available",
      "Health center location, hours, and how to make an appointment",
      "Counseling or mental health services contact info",
      "Financial aid office contact for billing or aid questions",
      "Career center contact for internships or resume help",
      "Library hours and how to reserve study rooms",
      "Campus safety or escort service contact, if offered",
      "Advisor or department contact for schedule questions",
    ],
  },
  {
    role: "semester-budget",
    title: "Semester-Specific\nBudget Planner",
    subtitle: "Costs that show up once a term, not every month — plan for them up front.",
    items: [
      "Textbooks and course materials cost, bought or rented",
      "Meal plan or grocery budget for the semester",
      "Housing cost or rent for the term, if separate from housing plan",
      "Transportation — parking pass, transit pass, or gas budget",
      "Lab fees, course fees, or supply costs specific to certain classes",
      "A small buffer for printing, copies, or unexpected school costs",
      "Any planned big purchases (laptop, supplies) for the term",
      "Checked for financial aid or scholarship disbursement dates",
      "Set a rough weekly spending target based on the above",
    ],
  },
  {
    role: "midterm-checkin",
    title: "Midterm\nCheck-In",
    subtitle: "Pause around the midpoint of the term to see how things are actually going.",
    items: [
      "Reviewed grades so far in each class",
      "Identified which class needs the most attention going forward",
      "Noted whether your study routine is actually being followed",
      "Checked in on your energy levels and overall workload",
      "Considered whether office hours or tutoring would help any class",
      "Reviewed the add/drop and withdrawal deadlines again if relevant",
      "Noted one thing that's working well so far",
      "Noted one thing you want to change for the second half",
      "Gave yourself credit for making it to the midpoint",
    ],
  },
  {
    role: "finals-survival",
    title: "Finals Week\nSurvival Checklist",
    subtitle: "The final stretch — protect your basics so you can actually perform well.",
    items: [
      "Confirmed every final exam's date, time, and location",
      "Made a study schedule covering all finals, prioritized by weight",
      "Protected sleep — cramming all night rarely helps as much as it feels like it will",
      "Planned simple, ready-to-go meals for the week",
      "Scheduled short breaks and at least one thing you enjoy each day",
      "Reached out for help early if you're struggling with any material",
      "Packed exam-day materials (ID, calculator, pencils) the night before",
      "Checked each exam's allowed materials policy in advance",
      "Planned something to look forward to once finals are over",
    ],
  },
  {
    role: "semester-wrap-up",
    title: "Semester\nWrap-Up Reflection",
    subtitle: "Once grades are in, take a few minutes to reflect before diving into the break.",
    items: [
      "What class or topic surprised you most this semester?",
      "What study habit worked better than expected?",
      "What would you do differently next semester?",
      "What's one win you're proud of, academic or otherwise?",
      "What campus resource do you wish you'd used sooner?",
      "How did your workload compare to what you expected going in?",
      "What relationship (professor, classmate, advisor) mattered most this term?",
      "What are you most looking forward to next semester?",
      "What's one thing you want to remember about this semester?",
    ],
  },
  {
    role: "next-semester-prep",
    title: "Next Semester\nPrep Checklist",
    subtitle: "A few things to handle before the break ends, so next term starts smoother.",
    items: [
      "Registered for next semester's classes",
      "Checked next term's key dates (start, add/drop, finals)",
      "Reviewed which textbooks or materials to sell, keep, or buy new",
      "Followed up on any incomplete grades or grade disputes",
      "Scheduled a check-in with your academic advisor if needed",
      "Noted any scholarship or financial aid renewal deadlines",
      "Backed up any files, notes, or work you want to keep",
      "Planned how you'll apply this term's lessons to the next one",
      "Set one specific goal for next semester",
    ],
  },
];

const IMPORTANT_INFO_LINES = [
  "This is an organizational tool, not academic, financial aid, or professional advice.",
  "Always confirm dates and policies against your school's official calendar and each course's syllabus.",
  "Instant digital download — no physical item will be shipped.",
  "Works for any academic calendar — adjust the dates to match your own school's term.",
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
4. A 3-ring binder works well since several pages (assignment tracker,
   reading list) are meant to be reprinted or added to across the term.

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
    `A new semester is a clean slate — this printable planner helps you keep it that way past week one. Built around the actual shape of a college or high school term: syllabus week, the deadline grind, midterms, finals, and everything in between.`,
    `What's included:`,
    `- 13 pages: title page + Semester Setup, Class Schedule Tracker, Assignment & Deadline Tracker, Exam Prep Planner, Weekly Study Routine Builder, Reading List Tracker, Campus Resources Checklist, a Semester-Specific Budget Planner, a Midterm Check-In, a Finals Week Survival Checklist, a Semester Wrap-Up Reflection, and Next Semester Prep`,
    `- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live`,
    `- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download`,
    `- A short printing guide and personal-use license included`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can start using it before your first class.`,
    `This is an organizational tool, not academic, financial aid, or professional advice — always confirm dates and policies against your own school's calendar and each course's syllabus.`,
    `For personal use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "student planner",
    "semester planner",
    "college planner",
    "academic planner",
    "class schedule",
    "exam prep planner",
    "study planner",
    "finals week planner",
    "assignment tracker",
    "back to school",
    "printable pdf",
    "instant download",
    "student printable",
  ];
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "Back to school", style: "Minimalist", recipient: "Student", color: "Sage green", primaryColor: "Green" };
  const category = "student_planner_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
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
            "13 pages: title page + 12 focused academic planning pages",
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
            "Covers the whole term — setup, deadlines, exams, and reflection",
            "A semester-specific budget page, not just a monthly one",
            "A dedicated Finals Week Survival Checklist",
            "Works for any school's academic calendar",
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
            "Fill it out during syllabus week and keep it in your school bag",
            "Reprint the tracker pages each new semester",
            "A thoughtful gift for a student heading back to school",
            "Pairs well with a 3-ring binder for the term",
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
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6. In Etsy's listing editor, type a description of the actual product — e.g. "student planner printable" or "academic planner" — into the category search field and Etsy will suggest real, current categories live.)\n`,
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
