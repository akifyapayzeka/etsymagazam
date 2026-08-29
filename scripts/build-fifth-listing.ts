#!/usr/bin/env tsx
/**
 * Builds Form & Fern's FIFTH product: Halloween Party Planner & Games Bundle.
 *
 * Seasonal/party category, checklist template. Original content — a full
 * hosting system (timeline, guest list, decor, costumes, menu, safety) plus
 * four ready-to-run party games with real rules/questions, not generic
 * "have fun" filler.
 *
 * Run: pnpm tsx scripts/build-fifth-listing.ts
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
const OUT_DIR = path.join(REPO_ROOT, "artifacts", "fifth-live-listing");
const WORK_DIR = path.join(REPO_ROOT, "storage", "fifth-listing-build");
const BRAND_NAME = "Form & Fern";
const PALETTE_ID = "minimal";
const PRODUCT_SLUG = "halloween-party-planner-games-bundle";
const PRODUCT_TITLE = "Halloween Party Planner & Games Bundle: Printable Host Kit with 4 Party Games, Instant Download";

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
  eyebrow: "HOST WITHOUT THE STRESS",
  title: "Halloween Party\nPlanner & Games",
  subtitle: "A complete host kit, plus 4 ready-to-play games",
  bodyLines: ["Everything from the guest list to the games —", "so you can actually enjoy your own party."],
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
    role: "planning-timeline",
    title: "Party Planning\nTimeline",
    subtitle: "Spread the work out so the week of the party is calm, not chaotic.",
    items: [
      "3-4 weeks out: pick a date, theme, and rough guest count",
      "3 weeks out: send invitations, digital or printed",
      "2 weeks out: order or buy any costumes, decor, or rentals needed",
      "1 week out: confirm RSVPs and plan the final menu",
      "1 week out: buy non-perishable decor and game supplies",
      "2-3 days out: buy perishable food and drinks",
      "1 day out: decorate what can be set up early",
      "Day of: finish food prep, set out games, and light the candles",
      "Day of: take five minutes before guests arrive to just breathe",
    ],
  },
  {
    role: "guest-list-invitations",
    title: "Guest List &\nInvitations",
    subtitle: "Keep track of who's coming so you can plan food, seating, and games accordingly.",
    items: [
      "Finalized the guest list and any plus-ones",
      "Decided: kids invited, adults-only, or a mixed party",
      "Sent invitations with date, time, address, and costume expectations",
      "Noted any dietary restrictions or allergies mentioned in RSVPs",
      "Tracked RSVPs as they come in",
      "Sent a reminder a few days before the party",
      "Decided on a parking or arrival plan for guests",
      "Planned for a few walk-ins or last-minute yeses",
      "Shared your address or location pin with out-of-town guests",
    ],
  },
  {
    role: "decor-ambiance",
    title: "Decor &\nAmbiance Checklist",
    subtitle: "A few well-placed touches go further than covering every surface.",
    items: [
      "Entryway: a wreath, lanterns, or a pumpkin display to set the mood",
      "Lighting: string lights, candles, or colored bulbs for ambiance",
      "A designated photo spot with a backdrop or fun prop",
      "Music playlist queued up ahead of time",
      "Tableware and napkins that match your theme or colors",
      "A few fog, spooky sound, or scent touches if you want extra atmosphere",
      "Outdoor decor visible from the street if you want walk-up appeal",
      "A clearly marked spot for coats, bags, or trick-or-treat buckets",
      "A test walk-through the space once decor is up, checking for trip hazards",
    ],
  },
  {
    role: "costume-planning",
    title: "Costume\nPlanning",
    subtitle: "Whether you're dressing up too or just prepping for guests, plan this early.",
    items: [
      "Decided if the party has a group theme or costumes are open",
      "Picked or confirmed your own costume with enough lead time",
      "Checked costume comfort for a full evening of standing/sitting",
      "Planned makeup or accessories that need extra prep time",
      "Set aside a space for guests to touch up costumes or makeup",
      "Considered a few spare accessories (masks, hats) for under-dressed guests",
      "Planned a costume contest if you want one — see the judging sheet",
      "Took a \"before\" photo of your look before the party starts",
      "Packed a small kit for costume repairs (safety pins, tape)",
    ],
  },
  {
    role: "menu-treats",
    title: "Menu &\nTreats Planning",
    subtitle: "Keep the menu simple and mostly make-ahead so you're not stuck in the kitchen all night.",
    items: [
      "Picked 2-3 savory items that can be made ahead or served cold",
      "Picked 1-2 themed treats or desserts",
      "Planned a drink station, spiked and non-alcoholic options if mixed ages",
      "Noted any allergies or dietary needs from your guest list",
      "Labeled dishes with allergens if serving a larger group",
      "Planned candy or treats specifically for any trick-or-treaters",
      "Assigned a few dishes to guests if doing a potluck-style party",
      "Confirmed you have enough serving dishes, napkins, and utensils",
      "Planned easy reheating or serving instructions for the day of",
    ],
  },
  {
    role: "trick-or-treat-safety",
    title: "Trick-or-Treat\nSafety Checklist",
    subtitle: "If your party overlaps with trick-or-treating, a few basics keep it smooth.",
    items: [
      "Left a porch light on (or off, per your household's preference) to signal availability",
      "Kept a clear, well-lit, trip-free path to your door",
      "Stocked enough candy for your neighborhood's typical turnout",
      "Set out a note or sign for allergy-friendly treats if offering any",
      "Assigned someone to answer the door if you're mid-party",
      "Kept pets in a separate room if door traffic might stress them out",
      "Reminded costumed kids in your own group about road safety",
      "Kept a flashlight or glow item by the door for after-dark walks",
      "Planned a cutoff time for answering the door if needed",
    ],
  },
  {
    role: "game-scavenger-hunt",
    title: "Game 1:\nSpooky Scavenger Hunt",
    subtitle: "Hide or place these around your party space before guests arrive. First to find all items wins.",
    items: [
      "A plastic spider or bug hidden somewhere unexpected",
      "A black cat decoration tucked on a shelf",
      "A miniature pumpkin hidden behind something",
      "A \"witch's hat\" object placed somewhere silly",
      "A skeleton or bone-shaped item in plain sight but easy to miss",
      "A candy corn or orange-and-black item near the food table",
      "A spooky word written somewhere in chalk or on a sticky note",
      "A bat silhouette taped somewhere on a wall or window",
      "One \"golden ticket\" item that wins an extra prize",
    ],
  },
  {
    role: "game-trivia",
    title: "Game 2:\nHalloween Trivia",
    subtitle: "Read these aloud one at a time — first correct answer gets a point. Answers included below each question.",
    items: [
      "What holiday is traditionally celebrated on October 31st? (Answer: Halloween)",
      "What vegetable is traditionally carved into a jack-o'-lantern today? (Answer: Pumpkin)",
      "What do you traditionally say when trick-or-treating at a door? (Answer: Trick or treat)",
      "What flying nocturnal animal is a classic Halloween symbol? (Answer: Bat)",
      "What color combination is most associated with Halloween? (Answer: Orange and black)",
      "What sweet, striped candy is a classic Halloween treat? (Answer: Candy corn)",
      "What do you call a witch's flying broomstick companion? (Answer: A black cat, traditionally)",
      "What was the original vegetable used for jack-o'-lanterns before pumpkins? (Answer: Turnips)",
      "What's the name for a group costume where everyone matches a theme? (Answer: A group costume)",
    ],
  },
  {
    role: "game-pumpkin-judging",
    title: "Game 3:\nPumpkin Carving Judging Sheet",
    subtitle: "Have each carver number their pumpkin, then score each category 1-5 as guests vote.",
    items: [
      "Creativity: how original or unexpected is the design?",
      "Difficulty: how much detail or skill does the carving show?",
      "Spookiness: how well does it fit a classic Halloween mood?",
      "Humor: does it make people laugh or smile?",
      "Overall craftsmanship: clean cuts, stable structure",
      "Tally each pumpkin's total score across all categories",
      "Announce 1st, 2nd, and 3rd place, or just an overall winner",
      "Have a small prize ready for the winner ahead of time",
      "Take a group photo of all the finished pumpkins together",
    ],
  },
  {
    role: "game-mummy-relay",
    title: "Game 4:\nMummy Wrap Relay",
    subtitle: "A classic team game — no advance prep beyond toilet paper or gauze rolls.",
    items: [
      "Split guests into teams of 2-3 people",
      "Give each team one roll of toilet paper or cheap gauze",
      "One team member is the \"mummy,\" the others are the wrappers",
      "Set a timer — 2-3 minutes works well for most groups",
      "Teams race to fully wrap their mummy before time runs out",
      "Judge on full coverage, not just speed, if it's close",
      "Award a prize for best-wrapped mummy, not just fastest",
      "Take photos of the finished mummies for the party memory book",
      "Have a backup roll ready in case one team runs out early",
    ],
  },
  {
    role: "party-day-timeline",
    title: "Party Day\nTimeline",
    subtitle: "A sample run of show — adjust the times to fit your own party's length.",
    items: [
      "1 hour before: final food prep and decor touch-ups",
      "30 minutes before: music on, lights set, games laid out",
      "Arrival: greet guests, take coats, offer a drink",
      "First 30-45 minutes: mingling, food, and photos",
      "Mid-party: run Game 1 (Scavenger Hunt) once most guests have arrived",
      "Mid-party: run Game 2 (Trivia) as a group activity",
      "Later: pumpkin carving contest if included, then judging",
      "Late-party: Mummy Wrap Relay for a high-energy close",
      "Wind-down: dessert, final photos, and thank-yous as guests leave",
    ],
  },
  {
    role: "cleanup-thank-you",
    title: "Cleanup &\nThank-You Checklist",
    subtitle: "A quick plan for the next morning makes cleanup much less overwhelming.",
    items: [
      "Bagged and disposed of easy trash before going to bed",
      "Put away food that can be saved for leftovers",
      "Recruited a helper or two for the bigger cleanup tasks",
      "Took down decor that won't be reused, saved what will",
      "Washed or returned any borrowed serving dishes",
      "Sent a quick thank-you message to guests who came",
      "Shared party photos with the group if you took any",
      "Noted what worked well for next year's party",
      "Gave yourself credit for hosting — it's genuinely a lot of work",
    ],
  },
];

const IMPORTANT_INFO_LINES = [
  "This is a party-planning and entertainment tool, not a safety or liability guarantee for your specific event.",
  "Always supervise children's activities and use your own judgment for your guests and space.",
  "Instant digital download — no physical item will be shipped.",
  "Trivia answers are provided for general Halloween folklore/trivia purposes and are common knowledge, not sourced from any single copyrighted work.",
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
4. Print the game pages a few days ahead so you're ready to run them on
   party day. A binder or clipboard keeps the planning pages together.

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
    `Hosting a Halloween party is fun right up until you're the one stuck running everything. This printable bundle gives you a full planning system PLUS 4 ready-to-run party games with real instructions — no last-minute Googling for activities.`,
    `What's included:`,
    `- 13 pages: title page + a Planning Timeline, Guest List, Decor Checklist, Costume Planning, Menu Planning, Trick-or-Treat Safety, a Party Day Timeline, and Cleanup Checklist`,
    `- 4 full party games with real rules: a Spooky Scavenger Hunt list, Halloween Trivia questions with answers, a Pumpkin Carving Judging Sheet, and a Mummy Wrap Relay`,
    `- 2 print sizes: US Letter and A4, so it prints cleanly no matter where you live`,
    `- Delivered as a print-ready PDF (all pages together) and individual PNG pages, zipped into one download`,
    `- A short printing guide and personal-use license included`,
    `This is a DIGITAL product — no physical item will be shipped. Files are delivered instantly after purchase via Etsy, so you can start planning right away.`,
    `This is a party-planning and entertainment tool — always supervise activities and use your own judgment for your guests and space.`,
    `For personal use — see the included license.txt for details.`,
    aiDisclosureLine,
    `Brought to you by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const tags = [
    "halloween party kit",
    "halloween planner",
    "halloween games",
    "party planner pdf",
    "pumpkin carving",
    "halloween trivia",
    "party host checklist",
    "halloween decor list",
    "trick or treat",
    "fall party printable",
    "printable pdf",
    "instant download",
    "halloween printable",
  ];
  if (tags.length !== 13) throw new Error(`Expected exactly 13 tags, got ${tags.length}`);
  for (const t of tags) {
    if (t.length > LISTING_LIMITS.maxTagLength) throw new Error(`Tag "${t}" exceeds ${LISTING_LIMITS.maxTagLength} chars`);
  }

  const materials = ["Digital File", "PDF", "PNG"];
  const attributes = { occasion: "Halloween", style: "Minimalist", recipient: "Adult", color: "Black and white", primaryColor: "Black" };
  const category = "party_printable"; // see docs/ETSY_SETUP.md step 6 — real taxonomy_id fetched after OAuth connects, never guessed
  const priceUsd = 8.0; // planner + 4 games bundle — priced above a single checklist per market research (party printables/kits commonly higher than single-page items)

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
            "13 pages: title page + 8 planning pages + 4 full party games",
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
            "A full host system — timeline, guest list, decor, menu, and safety",
            "4 ready-to-run games with real rules, not vague ideas",
            "Covers hosting AND trick-or-treat overlap logistics",
            "Reusable every year with your own updates",
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
          title: "Games Included",
          bullets: ["Spooky Scavenger Hunt", "Halloween Trivia (with answers)", "Pumpkin Carving Judging Sheet", "Mummy Wrap Relay"],
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
    `${category}\n\n(This is a category HINT for the human publisher, not a numeric taxonomy_id — the autopilot system never guesses one; see docs/ETSY_SETUP.md step 6. In Etsy's listing editor, type a description of the actual product — e.g. "halloween party printable" or "party planner" — into the category search field and Etsy will suggest real, current categories live.)\n`,
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
