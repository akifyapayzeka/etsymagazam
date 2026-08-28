#!/usr/bin/env tsx
/**
 * Builds a premium botanical wedding planner binder for direct manual Etsy publishing.
 *
 * Output shape intentionally matches scripts/publish-manual-products.ts:
 * artifacts/manual-publish-assets/<slug>/images/listing_images/*.png
 * artifacts/manual-publish-assets/<slug>/downloads/*.pdf|*.zip
 */
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getFeeScheduleMeta } from "@etsymagazam/core";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import { buildLicenseText, buildPdf, buildZip, rasterizeSvgToPng } from "@etsymagazam/product-generator";
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const BRAND_NAME = "Form & Fern";
const PRODUCT_SLUG = "botanical-wedding-planner-binder-v1";
const PRODUCT_TITLE = "Botanical Wedding Planner Binder Printable";
const LISTING_TITLE = "Botanical Wedding Planner Binder Printable | Wedding Budget, Guest List, Timeline & Checklist PDF";
const PRICE_USD = 9.9;
const DPI = 300;

const OUT_DIR = path.join(REPO_ROOT, "artifacts", "manual-publish-assets", PRODUCT_SLUG);
const LISTING_IMAGE_DIR = path.join(OUT_DIR, "images", "listing_images");
const DOWNLOAD_DIR = path.join(OUT_DIR, "downloads");
const QA_DIR = path.join(OUT_DIR, "qa-report");
const DATA_DIR = path.join(OUT_DIR, "listing-data");

const COLORS = {
  ivory: "#FBF8F2",
  paper: "#FFFDF8",
  panel: "#FFFFFF",
  ink: "#2E2A25",
  muted: "#776E63",
  sage: "#6F7F62",
  sageDark: "#43563B",
  sageLight: "#DCE5D3",
  terracotta: "#B86843",
  blush: "#E7C4B5",
  line: "#E7DED2",
  gold: "#B8955A",
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

interface SizeSpec {
  id: "letter" | "a4";
  label: string;
  widthIn: number;
  heightIn: number;
}

const SIZES: SizeSpec[] = [
  { id: "letter", label: "US Letter", widthIn: 8.5, heightIn: 11 },
  { id: "a4", label: "A4", widthIn: 8.27, heightIn: 11.69 },
];

interface PageSpec {
  kind: "cover" | "guide" | "vision" | "checklist" | "table" | "timeline" | "cards" | "notes";
  section: string;
  title: string;
  subtitle: string;
  items?: string[];
  columns?: string[];
  rows?: number;
  cards?: Array<{ title: string; lines: string[] }>;
}

const PAGES: PageSpec[] = [
  {
    kind: "cover",
    section: "Garden wedding planning system",
    title: "Botanical Wedding\nPlanner Binder",
    subtitle: "A calm, print-ready planning bundle for budgets, guests, vendors, timelines, details, and the final wedding week.",
  },
  {
    kind: "guide",
    section: "Start here",
    title: "How To Use\nThis Binder",
    subtitle: "Print the full binder or only the sections you need, then keep the active pages near your calendar, inbox, and wedding contracts.",
    items: [
      "Print the PDF at actual size so the margins stay clean.",
      "Put the pages in a three-ring binder, discbound notebook, or planning folder.",
      "Use pencil for guest counts, budget totals, and vendor shortlists until decisions are final.",
      "Reprint tracker pages as your guest list, payments, or vendor conversations change.",
      "Keep contracts, receipts, swatches, and inspiration behind the matching section.",
      "Schedule a weekly planning check-in so decisions do not pile up at the end.",
      "Bring the final week dashboard, timeline, contacts, and emergency kit list to the venue.",
    ],
  },
  {
    kind: "vision",
    section: "Style direction",
    title: "Wedding Vision\nBoard",
    subtitle: "Anchor the whole celebration before choosing vendors, colors, rentals, or stationery.",
    cards: [
      { title: "Mood words", lines: ["Romantic", "Garden", "Candlelit", "Relaxed"] },
      { title: "Color story", lines: ["Sage", "Ivory", "Terracotta", "Soft blush"] },
      { title: "Guest feeling", lines: ["Welcomed", "Unhurried", "Personal", "Joyful"] },
      { title: "Non-negotiables", lines: ["Great food", "Flowing timeline", "Photos", "Easy logistics"] },
    ],
  },
  {
    kind: "cards",
    section: "Decision filter",
    title: "Priorities And\nNon-Negotiables",
    subtitle: "Use this page when every idea feels tempting. A clear filter keeps the budget and the day aligned.",
    cards: [
      { title: "Top three priorities", lines: ["1.", "2.", "3."] },
      { title: "Worth spending more on", lines: ["", "", ""] },
      { title: "Where we can simplify", lines: ["", "", ""] },
      { title: "Must avoid", lines: ["", "", ""] },
    ],
  },
  {
    kind: "checklist",
    section: "Countdown",
    title: "12-Month\nPlanning Checklist",
    subtitle: "The first decisions set the frame for every quote, contract, and design choice that follows.",
    items: [
      "Set an overall budget range and decide who is contributing.",
      "Draft a first guest count so venues can quote accurately.",
      "Pick a target season, month, or a few possible dates.",
      "Research venues that match the guest count, style, and budget.",
      "Book the venue after reviewing contract terms and payment schedule.",
      "Choose a planning system for receipts, contracts, and vendor notes.",
      "Start a visual reference board for florals, signage, rentals, and attire.",
      "Discuss ceremony style, legal requirements, and any cultural traditions.",
      "Create a shared wedding email address or folder for every vendor thread.",
    ],
  },
  {
    kind: "checklist",
    section: "Countdown",
    title: "9-Month\nPlanning Checklist",
    subtitle: "This is the booking window for the people and services that shape the guest experience.",
    items: [
      "Book photographer, videographer, planner, caterer, florist, and music if needed.",
      "Schedule engagement photos if they will be used for save-the-dates.",
      "Build the first wedding website or guest information page.",
      "Begin attire research and schedule fittings or appointments.",
      "Collect mailing addresses in the guest list tracker.",
      "Review accommodation blocks or nearby hotel suggestions.",
      "Plan ceremony readings, music direction, and officiant requirements.",
      "Create a first decor and rentals wishlist before requesting quotes.",
      "Send save-the-dates if guests need travel notice.",
    ],
  },
  {
    kind: "checklist",
    section: "Countdown",
    title: "6-Month\nPlanning Checklist",
    subtitle: "Move from broad ideas into confirmed details, quantities, and timelines.",
    items: [
      "Order invitations or finalize digital invitation wording.",
      "Confirm guest meal options, dietary note handling, and RSVP deadline.",
      "Choose wedding party attire direction and communicate deadlines.",
      "Book hair, makeup, transportation, and any day-before events.",
      "Outline ceremony order, reception flow, and key speeches.",
      "Request floral proposal updates after finalizing color direction.",
      "Choose signage, seating display, menu cards, and other stationery needs.",
      "Start registry, gift preference, or honeymoon fund details.",
      "Review budget totals against deposits already paid.",
    ],
  },
  {
    kind: "checklist",
    section: "Countdown",
    title: "3-Month\nPlanning Checklist",
    subtitle: "The guest-facing pieces begin to lock in. Confirm the details people will actually experience.",
    items: [
      "Mail invitations or send formal digital invitations.",
      "Finalize menu selections, bar plan, dessert plan, and late-night food if any.",
      "Book final fittings and note alteration pickup dates.",
      "Confirm ceremony music, recessional, processional, and special songs.",
      "Create first seating chart draft from accepted RSVPs.",
      "Write ceremony vows, readings, programs, or welcome note copy.",
      "Purchase accessories, guest book, card box, favors, and emergency kit items.",
      "Confirm vendor arrival needs, parking, load-in, and meal requirements.",
      "Schedule final venue walkthrough or planning meeting.",
    ],
  },
  {
    kind: "checklist",
    section: "Countdown",
    title: "1-Month\nPlanning Checklist",
    subtitle: "This is the month for confirmations, final counts, and making the day easy for everyone involved.",
    items: [
      "Submit final guest count, meal counts, and dietary notes to the caterer.",
      "Pay any remaining balances due before the wedding week.",
      "Confirm final timeline with venue, planner, photographer, and key vendors.",
      "Prepare envelopes, tips, final payments, and contact list.",
      "Break in shoes and gather attire details in one place.",
      "Assign who takes home gifts, florals, signs, decor, and personal items.",
      "Pack ceremony, reception, beauty, and getting-ready items by category.",
      "Share the wedding party timeline and arrival information.",
      "Confirm honeymoon or post-wedding travel details.",
    ],
  },
  {
    kind: "checklist",
    section: "Countdown",
    title: "Week-Of\nChecklist",
    subtitle: "Keep this page visible. It is built for the final run of small but important tasks.",
    items: [
      "Steam or press attire, veil, suit, shirts, and backup pieces.",
      "Pack rings, license, vows, accessories, emergency kit, and detail photos items.",
      "Confirm weather plan, shuttle timing, and venue arrival windows.",
      "Send final timeline and contact list to wedding party and key family.",
      "Charge portable speakers, phones, watches, batteries, and emergency lights.",
      "Prepare breakfast, water, snacks, and calm getting-ready space.",
      "Print vows, speeches, ceremony copy, and any final paper pieces.",
      "Put tips and vendor balances in labeled envelopes.",
      "Sleep, hydrate, and stop adding new projects unless they truly matter.",
    ],
  },
  {
    kind: "table",
    section: "Budget",
    title: "Master Budget\nOverview",
    subtitle: "Track the big categories first, then use the next pages to break down payments and details.",
    columns: ["Category", "Planned", "Quoted", "Paid", "Remaining", "Notes"],
    rows: 14,
  },
  {
    kind: "table",
    section: "Budget",
    title: "Budget Category\nTracker",
    subtitle: "Use one row per line item so quotes, taxes, fees, tips, and extras stay visible.",
    columns: ["Item", "Vendor", "Estimate", "Actual", "Due date", "Status"],
    rows: 16,
  },
  {
    kind: "table",
    section: "Payments",
    title: "Payment Due\nDates",
    subtitle: "Deposits, balances, tips, overtime, rentals, and day-of cash envelopes all live here.",
    columns: ["Due date", "Vendor or item", "Amount", "Method", "Confirmed", "Notes"],
    rows: 15,
  },
  {
    kind: "table",
    section: "Vendors",
    title: "Vendor\nShortlist",
    subtitle: "Compare options before booking. The best vendor is not always the cheapest one.",
    columns: ["Role", "Vendor name", "Quote", "Availability", "Fit", "Next step"],
    rows: 13,
  },
  {
    kind: "cards",
    section: "Vendors",
    title: "Vendor Contact\nSheet",
    subtitle: "Keep this page with the final week dashboard and share it with your planner or point person.",
    cards: [
      { title: "Venue", lines: ["Contact:", "Phone:", "Email:", "Arrival:"] },
      { title: "Planner or coordinator", lines: ["Contact:", "Phone:", "Email:", "Arrival:"] },
      { title: "Photographer", lines: ["Contact:", "Phone:", "Email:", "Arrival:"] },
      { title: "Catering", lines: ["Contact:", "Phone:", "Email:", "Arrival:"] },
      { title: "Florist", lines: ["Contact:", "Phone:", "Email:", "Arrival:"] },
      { title: "Music or DJ", lines: ["Contact:", "Phone:", "Email:", "Arrival:"] },
    ],
  },
  {
    kind: "table",
    section: "Venue",
    title: "Venue\nComparison",
    subtitle: "Use the same criteria for every tour so the decision stays grounded.",
    columns: ["Venue", "Capacity", "Included", "Restrictions", "Total", "Feeling"],
    rows: 12,
  },
  {
    kind: "table",
    section: "Guests",
    title: "Guest List\nTracker",
    subtitle: "A practical guest list page for names, households, meal notes, and follow-up.",
    columns: ["Guest or household", "Invite", "Address", "RSVP", "Meal", "Notes"],
    rows: 18,
  },
  {
    kind: "table",
    section: "Guests",
    title: "RSVP\nDashboard",
    subtitle: "Track the answers that affect seating, food, rentals, and the final count.",
    columns: ["Group", "Invited", "Yes", "No", "Pending", "Dietary notes"],
    rows: 14,
  },
  {
    kind: "cards",
    section: "Seating",
    title: "Seating Plan\nWorksheet",
    subtitle: "Map tables by relationships, accessibility, and conversation flow before building the final chart.",
    cards: [
      { title: "Head table", lines: ["", "", ""] },
      { title: "Family table", lines: ["", "", ""] },
      { title: "Friends table", lines: ["", "", ""] },
      { title: "Accessibility notes", lines: ["", "", ""] },
      { title: "Keep near", lines: ["", "", ""] },
      { title: "Seat apart", lines: ["", "", ""] },
    ],
  },
  {
    kind: "timeline",
    section: "Ceremony",
    title: "Ceremony\nTimeline",
    subtitle: "Capture the order, music cues, people, and handoffs that make the ceremony feel smooth.",
    columns: ["Time", "Moment", "People", "Music or cue", "Notes"],
    rows: 12,
  },
  {
    kind: "timeline",
    section: "Reception",
    title: "Reception\nFlow",
    subtitle: "Dinner, speeches, dances, cake, photos, and exit moments should all have owners.",
    columns: ["Time", "Moment", "Owner", "Location", "Notes"],
    rows: 13,
  },
  {
    kind: "timeline",
    section: "Day of",
    title: "Day-Of\nTimeline",
    subtitle: "The page to hand to your coordinator, photographer, wedding party, and family point person.",
    columns: ["Time", "Task", "Owner", "Where", "Backup plan"],
    rows: 15,
  },
  {
    kind: "checklist",
    section: "Photos",
    title: "Photography\nShot List",
    subtitle: "A focused checklist for the shots that are easy to miss when the day is moving fast.",
    items: [
      "Invitation suite, rings, shoes, jewelry, bouquet, perfume, and flat lay details.",
      "Getting-ready candids with wedding party and immediate family.",
      "First look or private vows, if planned.",
      "Ceremony wide shot, aisle moments, vows, rings, kiss, and recessional.",
      "Formal family combinations that must not be skipped.",
      "Wedding party portraits, couple portraits, and venue portraits.",
      "Reception room before guests enter, tablescape, florals, signage, and cake.",
      "Speeches, dances, guests laughing, candid hugs, and dance floor energy.",
      "Exit or final private moment before the night ends.",
    ],
  },
  {
    kind: "cards",
    section: "Floral and decor",
    title: "Floral And\nDecor Plan",
    subtitle: "Keep the visual plan cohesive across ceremony, reception, signage, and small details.",
    cards: [
      { title: "Ceremony florals", lines: ["Aisle:", "Arch:", "Reserved rows:", "Repurpose plan:"] },
      { title: "Reception florals", lines: ["Centerpieces:", "Bud vases:", "Candles:", "Head table:"] },
      { title: "Color palette", lines: ["Main:", "Secondary:", "Accent:", "Avoid:"] },
      { title: "Rental details", lines: ["Linens:", "Napkins:", "Chairs:", "Table numbers:"] },
    ],
  },
  {
    kind: "checklist",
    section: "Paper details",
    title: "Stationery And\nSignage Checklist",
    subtitle: "A single page for the printed and digital pieces guests interact with.",
    items: [
      "Save-the-date cards or announcement email.",
      "Invitation, RSVP wording, details card, and envelope plan.",
      "Wedding website or information page updated with final logistics.",
      "Welcome sign, unplugged ceremony sign, bar sign, and guest book sign.",
      "Seating chart, escort cards, place cards, or table assignment display.",
      "Menus, programs, thank-you cards, and table numbers.",
      "Reserved seat signs, memorial table sign, and favor tags if needed.",
      "Print deadlines, proof approvals, and pickup or shipping dates.",
      "Backup copies packed with the final week items.",
    ],
  },
  {
    kind: "cards",
    section: "Attire",
    title: "Attire And\nBeauty Planner",
    subtitle: "Track outfits, accessories, appointments, and the small pieces that are easy to forget.",
    cards: [
      { title: "Bride or primary outfit", lines: ["Fitting:", "Pickup:", "Accessories:", "Alterations:"] },
      { title: "Partner outfit", lines: ["Fitting:", "Pickup:", "Shoes:", "Alterations:"] },
      { title: "Beauty schedule", lines: ["Hair:", "Makeup:", "Trial:", "Touch-up kit:"] },
      { title: "Wedding party", lines: ["Deadline:", "Color:", "Shoes:", "Notes:"] },
    ],
  },
  {
    kind: "table",
    section: "Wedding party",
    title: "Wedding Party\nContacts",
    subtitle: "Use for arrival times, phone numbers, responsibilities, and outfit notes.",
    columns: ["Name", "Role", "Phone", "Arrival", "Responsibility", "Notes"],
    rows: 15,
  },
  {
    kind: "table",
    section: "Gifts",
    title: "Gift Registry\nTracker",
    subtitle: "Track gifts and thank-you notes without losing names or mailing details.",
    columns: ["Gift", "From", "Address", "Received", "Thank-you sent", "Notes"],
    rows: 15,
  },
  {
    kind: "checklist",
    section: "Packing",
    title: "Wedding Day\nPacking List",
    subtitle: "Put items in labeled bags or boxes so someone else can find them quickly.",
    items: [
      "Marriage license, rings, vows, printed timeline, and vendor contact list.",
      "Attire, shoes, accessories, garment bags, hangers, and backup undergarments.",
      "Beauty touch-up kit, stain remover, sewing kit, tissues, mints, and pain reliever.",
      "Flat lay detail items for photos, including invitation suite and ring box.",
      "Ceremony items, signage, guest book, card box, favors, and table numbers.",
      "Snacks, water, straws, charger, cash tips, and emergency payment method.",
      "Overnight bag, honeymoon documents, IDs, passports, and travel confirmations.",
      "Return plan for rentals, borrowed items, florals, gifts, and personal items.",
      "A final labeled box for anything that must go home with you.",
    ],
  },
  {
    kind: "checklist",
    section: "Emergency kit",
    title: "Emergency Kit\nChecklist",
    subtitle: "A practical kit for tiny problems that feel huge if nobody has the fix nearby.",
    items: [
      "Mini sewing kit, safety pins, fashion tape, lint roller, and stain remover pen.",
      "Bandages, blister pads, pain reliever, allergy medication, and antacid.",
      "Phone charger, portable battery, extension cord, scissors, and tape.",
      "Tissues, wipes, hand sanitizer, deodorant, floss, and breath mints.",
      "Clear nail polish, nail file, tweezers, makeup touch-ups, and blotting papers.",
      "Snacks, water, straws, electrolyte packets, and any personal medication.",
      "Copy of timeline, contact list, transportation details, and venue map.",
      "Umbrella, shawl, heel protectors, sunscreen, or weather-specific backup.",
      "Small cash bills for unexpected tips, parking, or last-minute errands.",
    ],
  },
  {
    kind: "cards",
    section: "Travel",
    title: "Honeymoon\nSnapshot",
    subtitle: "A clean page for travel details so post-wedding logistics do not get buried.",
    cards: [
      { title: "Departure", lines: ["Date:", "Time:", "Airport or station:", "Confirmation:"] },
      { title: "Stay", lines: ["Hotel:", "Address:", "Check-in:", "Contact:"] },
      { title: "Documents", lines: ["IDs:", "Passports:", "Insurance:", "Reservations:"] },
      { title: "Packing reminders", lines: ["", "", "", ""] },
    ],
  },
  {
    kind: "table",
    section: "Thank-you notes",
    title: "Thank-You\nTracker",
    subtitle: "Keep this page after the wedding so every gift and act of help gets acknowledged.",
    columns: ["Name", "Gift or help", "Address", "Card written", "Card sent", "Notes"],
    rows: 16,
  },
  {
    kind: "cards",
    section: "Final week",
    title: "Final Week\nDashboard",
    subtitle: "Your last-page command center for the details that need the most visibility.",
    cards: [
      { title: "Final payments", lines: ["", "", ""] },
      { title: "Weather plan", lines: ["", "", ""] },
      { title: "Point person", lines: ["Name:", "Phone:", "Scope:"] },
      { title: "Must bring", lines: ["", "", ""] },
      { title: "Must confirm", lines: ["", "", ""] },
      { title: "After-party or exit", lines: ["", "", ""] },
    ],
  },
  {
    kind: "notes",
    section: "Notes",
    title: "Wedding\nNotes",
    subtitle: "Extra space for ideas, reminders, quotes, and anything that does not fit neatly elsewhere.",
  },
];

function pageSizePx(size: SizeSpec): { width: number; height: number } {
  return { width: Math.round(size.widthIn * DPI), height: Math.round(size.heightIn * DPI) };
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number): string[] {
  return text.split("\n").flatMap((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  });
}

function textBlock(input: {
  text: string;
  x: number;
  y: number;
  size: number;
  maxChars?: number;
  lineHeight?: number;
  fill?: string;
  family?: string;
  weight?: number | string;
  anchor?: "start" | "middle" | "end";
  letterSpacing?: number;
  uppercase?: boolean;
}): string {
  const lines = input.maxChars ? wrapText(input.uppercase ? input.text.toUpperCase() : input.text, input.maxChars) : (input.uppercase ? input.text.toUpperCase() : input.text).split("\n");
  const lineHeight = input.lineHeight ?? Math.round(input.size * 1.22);
  const attrs = [
    `x="${input.x}"`,
    `y="${input.y}"`,
    `font-family="${input.family ?? SANS}"`,
    `font-size="${input.size}"`,
    `fill="${input.fill ?? COLORS.ink}"`,
    `text-anchor="${input.anchor ?? "start"}"`,
    `font-weight="${input.weight ?? 400}"`,
  ];
  if (input.letterSpacing) attrs.push(`letter-spacing="${input.letterSpacing}"`);
  return `<text ${attrs.join(" ")}>${lines
    .map((line, index) => `<tspan x="${input.x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`)
    .join("")}</text>`;
}

function botanicalSprig(x: number, y: number, scale: number, rotate = 0): string {
  const leaves = [
    [22, 32, -35],
    [48, 58, 30],
    [72, 92, -28],
    [94, 126, 35],
    [116, 168, -32],
    [137, 205, 25],
  ];
  return `<g transform="translate(${x} ${y}) rotate(${rotate}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M0 235 C30 185 45 135 50 78 C54 44 66 22 96 0" stroke="${COLORS.sageDark}" stroke-width="7"/>
    ${leaves
      .map(
        ([cx, cy, r]) =>
          `<ellipse cx="${cx}" cy="${cy}" rx="18" ry="38" transform="rotate(${r} ${cx} ${cy})" fill="${COLORS.sageLight}" stroke="${COLORS.sage}" stroke-width="4"/>`,
      )
      .join("")}
    <circle cx="72" cy="95" r="10" fill="${COLORS.terracotta}" stroke="none"/>
    <circle cx="118" cy="164" r="8" fill="${COLORS.blush}" stroke="none"/>
  </g>`;
}

function shellStart(size: SizeSpec, page: PageSpec, pageNumber: number): { w: number; h: number; scale: number; top: number; left: number; bodyW: number; svg: string } {
  const { width: w, height: h } = pageSizePx(size);
  const scale = w / 2550;
  const left = Math.round(190 * scale);
  const top = Math.round(210 * scale);
  const bodyW = w - left * 2;
  const border = Math.round(22 * scale);
  const headerY = Math.round(118 * scale);
  const pageNoY = h - Math.round(92 * scale);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.ivory}"/>
    <rect x="${border}" y="${border}" width="${w - border * 2}" height="${h - border * 2}" fill="none" stroke="${COLORS.line}" stroke-width="${Math.round(5 * scale)}"/>
    <rect x="${border}" y="${border}" width="${w - border * 2}" height="${Math.round(155 * scale)}" fill="${COLORS.sageDark}"/>
    ${botanicalSprig(Math.round(54 * scale), Math.round(46 * scale), scale * 0.92, -12)}
    ${botanicalSprig(w - Math.round(56 * scale), h - Math.round(42 * scale), scale * 0.92, 170)}
    ${textBlock({ text: page.section, x: left, y: headerY, size: Math.round(28 * scale), fill: COLORS.paper, family: SANS, weight: 700, letterSpacing: Math.round(4 * scale), uppercase: true })}
    ${textBlock({ text: BRAND_NAME, x: w - left, y: headerY, size: Math.round(28 * scale), fill: COLORS.gold, family: SANS, weight: 700, anchor: "end", letterSpacing: Math.round(3 * scale), uppercase: true })}
    <line x1="${left}" y1="${Math.round(152 * scale)}" x2="${w - left}" y2="${Math.round(152 * scale)}" stroke="${COLORS.gold}" stroke-width="${Math.round(3 * scale)}" opacity="0.72"/>
    ${textBlock({ text: String(pageNumber).padStart(2, "0"), x: w - left, y: pageNoY, size: Math.round(34 * scale), fill: COLORS.muted, family: SANS, weight: 700, anchor: "end" })}
  `;
  return { w, h, scale, top, left, bodyW, svg };
}

function titleBlock(page: PageSpec, ctx: ReturnType<typeof shellStart>): string {
  const titleSize = Math.round(116 * ctx.scale);
  const titleY = ctx.top + Math.round(132 * ctx.scale);
  const subtitleY = titleY + Math.round((page.title.split("\n").length - 1) * titleSize * 1.05 + 82 * ctx.scale);
  return `${textBlock({ text: page.title, x: ctx.left, y: titleY, size: titleSize, fill: COLORS.ink, family: SERIF, lineHeight: Math.round(titleSize * 1.06) })}
    ${textBlock({ text: page.subtitle, x: ctx.left, y: subtitleY, size: Math.round(36 * ctx.scale), fill: COLORS.muted, family: SANS, maxChars: 88, lineHeight: Math.round(50 * ctx.scale) })}`;
}

function renderCoverPage(size: SizeSpec, page: PageSpec): string {
  const { width: w, height: h } = pageSizePx(size);
  const scale = w / 2550;
  const left = Math.round(215 * scale);
  const right = w - left;
  const center = Math.round(w / 2);
  const titleY = Math.round(920 * scale);
  const featureY = Math.round(2135 * scale);
  const chips = ["34 planner pages", "US Letter + A4", "Instant download", "Garden wedding style"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.ivory}"/>
    <rect x="${Math.round(80 * scale)}" y="${Math.round(80 * scale)}" width="${w - Math.round(160 * scale)}" height="${h - Math.round(160 * scale)}" rx="${Math.round(34 * scale)}" fill="${COLORS.paper}" stroke="${COLORS.line}" stroke-width="${Math.round(5 * scale)}"/>
    ${botanicalSprig(Math.round(120 * scale), Math.round(118 * scale), scale * 1.18, -18)}
    ${botanicalSprig(w - Math.round(122 * scale), h - Math.round(128 * scale), scale * 1.18, 162)}
    <circle cx="${right - Math.round(170 * scale)}" cy="${Math.round(460 * scale)}" r="${Math.round(120 * scale)}" fill="${COLORS.blush}" opacity="0.52"/>
    <circle cx="${left + Math.round(120 * scale)}" cy="${h - Math.round(470 * scale)}" r="${Math.round(105 * scale)}" fill="${COLORS.sageLight}" opacity="0.7"/>
    ${textBlock({ text: "PRINTABLE PLANNING BUNDLE", x: center, y: Math.round(520 * scale), size: Math.round(34 * scale), fill: COLORS.terracotta, family: SANS, weight: 800, anchor: "middle", letterSpacing: Math.round(6 * scale) })}
    ${textBlock({ text: page.title, x: center, y: titleY, size: Math.round(164 * scale), fill: COLORS.ink, family: SERIF, anchor: "middle", lineHeight: Math.round(178 * scale) })}
    ${textBlock({ text: "Wedding budget, guest list, RSVP, vendors, seating, timeline, signage, packing, emergency kit, and thank-you tracker.", x: center, y: titleY + Math.round(430 * scale), size: Math.round(46 * scale), fill: COLORS.muted, family: SANS, anchor: "middle", maxChars: 66, lineHeight: Math.round(62 * scale) })}
    <path d="M${left} ${Math.round(1850 * scale)} C${left + Math.round(530 * scale)} ${Math.round(1780 * scale)} ${right - Math.round(530 * scale)} ${Math.round(1780 * scale)} ${right} ${Math.round(1850 * scale)}" stroke="${COLORS.sage}" stroke-width="${Math.round(5 * scale)}" fill="none"/>
    ${chips
      .map((chip, index) => {
        const chipW = Math.round([380, 360, 390, 470][index]! * scale);
        const gap = Math.round(32 * scale);
        const total = Math.round((380 + 360 + 390 + 470) * scale + gap * 3);
        const x = center - Math.round(total / 2) + [0, Math.round((380 * scale + gap)), Math.round(((380 + 360) * scale + gap * 2)), Math.round(((380 + 360 + 390) * scale + gap * 3))][index]!;
        return `<rect x="${x}" y="${featureY}" width="${chipW}" height="${Math.round(92 * scale)}" rx="${Math.round(46 * scale)}" fill="${index % 2 ? COLORS.sageLight : COLORS.blush}" opacity="0.94"/>
        ${textBlock({ text: chip, x: x + Math.round(chipW / 2), y: featureY + Math.round(58 * scale), size: Math.round(30 * scale), fill: COLORS.ink, family: SANS, weight: 700, anchor: "middle" })}`;
      })
      .join("")}
    ${textBlock({ text: BRAND_NAME, x: center, y: h - Math.round(330 * scale), size: Math.round(38 * scale), fill: COLORS.sageDark, family: SANS, weight: 800, anchor: "middle", letterSpacing: Math.round(5 * scale), uppercase: true })}
  </svg>`;
}

function renderChecklist(page: PageSpec, ctx: ReturnType<typeof shellStart>): string {
  const s = ctx.scale;
  const startY = ctx.top + Math.round(430 * s);
  const rowGap = Math.round(18 * s);
  let y = startY;
  const items = page.items ?? [];
  const rows = items
    .map((item) => {
      const lines = wrapText(item, 92);
      const rowH = Math.max(Math.round(112 * s), Math.round((lines.length * 44 + 44) * s));
      const out = `<rect x="${ctx.left}" y="${y}" width="${ctx.bodyW}" height="${rowH}" rx="${Math.round(18 * s)}" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="${Math.round(3 * s)}"/>
        <rect x="${ctx.left + Math.round(38 * s)}" y="${y + Math.round(37 * s)}" width="${Math.round(42 * s)}" height="${Math.round(42 * s)}" rx="${Math.round(7 * s)}" fill="none" stroke="${COLORS.sage}" stroke-width="${Math.round(4 * s)}"/>
        ${textBlock({ text: item, x: ctx.left + Math.round(118 * s), y: y + Math.round(64 * s), size: Math.round(34 * s), fill: COLORS.ink, family: SANS, maxChars: 92, lineHeight: Math.round(45 * s) })}`;
      y += rowH + rowGap;
      return out;
    })
    .join("");
  return rows;
}

function renderTable(page: PageSpec, ctx: ReturnType<typeof shellStart>, compact = false): string {
  const s = ctx.scale;
  const columns = page.columns ?? [];
  const rows = page.rows ?? 12;
  const tableX = ctx.left;
  const tableY = ctx.top + Math.round(440 * s);
  const tableW = ctx.bodyW;
  const headerH = Math.round(72 * s);
  const rowH = compact ? Math.round(98 * s) : Math.round(112 * s);
  const totalH = headerH + rowH * rows;
  const colW = tableW / columns.length;
  const headers = columns
    .map((col, i) => {
      const x = tableX + colW * i;
      return `<rect x="${x}" y="${tableY}" width="${colW}" height="${headerH}" fill="${COLORS.sageDark}" stroke="${COLORS.sageDark}" stroke-width="${Math.round(2 * s)}"/>
        ${textBlock({ text: col, x: Math.round(x + Math.round(18 * s)), y: tableY + Math.round(47 * s), size: Math.round(26 * s), fill: COLORS.paper, family: SANS, weight: 800, maxChars: Math.max(8, Math.floor(colW / (17 * s))) })}`;
    })
    .join("");
  const bodyRows = Array.from({ length: rows }, (_, r) => {
    const y = tableY + headerH + rowH * r;
    return `<rect x="${tableX}" y="${y}" width="${tableW}" height="${rowH}" fill="${r % 2 ? COLORS.panel : COLORS.paper}" stroke="${COLORS.line}" stroke-width="${Math.round(2 * s)}"/>
      ${columns
        .map((_, c) => {
          const x = tableX + colW * c;
          return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + rowH}" stroke="${COLORS.line}" stroke-width="${Math.round(2 * s)}"/>`;
        })
        .join("")}`;
  }).join("");
  return `<rect x="${tableX}" y="${tableY}" width="${tableW}" height="${totalH}" rx="${Math.round(14 * s)}" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="${Math.round(3 * s)}"/>
    ${headers}
    ${bodyRows}
    <line x1="${tableX + tableW}" y1="${tableY}" x2="${tableX + tableW}" y2="${tableY + totalH}" stroke="${COLORS.line}" stroke-width="${Math.round(2 * s)}"/>`;
}

function renderCards(page: PageSpec, ctx: ReturnType<typeof shellStart>): string {
  const s = ctx.scale;
  const cards = page.cards ?? [];
  const gap = Math.round(34 * s);
  const startY = ctx.top + Math.round(430 * s);
  const colW = Math.round((ctx.bodyW - gap) / 2);
  const rowH = Math.round(cards.length > 4 ? 390 * s : 520 * s);
  return cards
    .map((card, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = ctx.left + col * (colW + gap);
      const y = startY + row * (rowH + gap);
      const lineStart = y + Math.round(150 * s);
      return `<rect x="${x}" y="${y}" width="${colW}" height="${rowH}" rx="${Math.round(24 * s)}" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="${Math.round(3 * s)}"/>
        <rect x="${x}" y="${y}" width="${colW}" height="${Math.round(96 * s)}" rx="${Math.round(24 * s)}" fill="${COLORS.sageLight}"/>
        ${textBlock({ text: card.title, x: x + Math.round(34 * s), y: y + Math.round(61 * s), size: Math.round(31 * s), fill: COLORS.sageDark, family: SANS, weight: 800, maxChars: 26 })}
        ${card.lines
          .map((line, i) => {
            const ly = lineStart + i * Math.round(58 * s);
            return `${textBlock({ text: line || " ", x: x + Math.round(36 * s), y: ly, size: Math.round(27 * s), fill: COLORS.ink, family: SANS, maxChars: 32 })}
              <line x1="${x + Math.round(36 * s)}" y1="${ly + Math.round(18 * s)}" x2="${x + colW - Math.round(36 * s)}" y2="${ly + Math.round(18 * s)}" stroke="${COLORS.line}" stroke-width="${Math.round(3 * s)}"/>`;
          })
          .join("")}`;
    })
    .join("");
}

function renderVision(page: PageSpec, ctx: ReturnType<typeof shellStart>): string {
  const s = ctx.scale;
  const x = ctx.left;
  const y = ctx.top + Math.round(430 * s);
  const imageW = Math.round(ctx.bodyW * 0.58);
  const imageH = Math.round(970 * s);
  const sideX = x + imageW + Math.round(46 * s);
  const sideW = ctx.bodyW - imageW - Math.round(46 * s);
  const inspiration = `<rect x="${x}" y="${y}" width="${imageW}" height="${imageH}" rx="${Math.round(30 * s)}" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="${Math.round(3 * s)}"/>
    <rect x="${x + Math.round(50 * s)}" y="${y + Math.round(58 * s)}" width="${imageW - Math.round(100 * s)}" height="${imageH - Math.round(116 * s)}" rx="${Math.round(24 * s)}" fill="${COLORS.ivory}" stroke="${COLORS.line}" stroke-width="${Math.round(3 * s)}" stroke-dasharray="${Math.round(18 * s)} ${Math.round(16 * s)}"/>
    ${botanicalSprig(x + Math.round(200 * s), y + Math.round(160 * s), s * 1.25, -25)}
    ${botanicalSprig(x + imageW - Math.round(220 * s), y + imageH - Math.round(150 * s), s * 1.15, 150)}
    ${textBlock({ text: "Paste inspiration, fabric swatches, stationery proofs, or a printed mood board here.", x: x + Math.round(130 * s), y: y + Math.round(510 * s), size: Math.round(40 * s), fill: COLORS.muted, family: SANS, maxChars: 38, lineHeight: Math.round(56 * s) })}`;
  const cards = (page.cards ?? [])
    .map((card, index) => {
      const cy = y + index * Math.round(245 * s);
      return `<rect x="${sideX}" y="${cy}" width="${sideW}" height="${Math.round(205 * s)}" rx="${Math.round(22 * s)}" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="${Math.round(3 * s)}"/>
        ${textBlock({ text: card.title, x: sideX + Math.round(32 * s), y: cy + Math.round(57 * s), size: Math.round(31 * s), fill: COLORS.terracotta, family: SANS, weight: 800, uppercase: true })}
        ${textBlock({ text: card.lines.join(" / "), x: sideX + Math.round(32 * s), y: cy + Math.round(118 * s), size: Math.round(31 * s), fill: COLORS.ink, family: SERIF, maxChars: 32, lineHeight: Math.round(42 * s) })}`;
    })
    .join("");
  return inspiration + cards;
}

function renderNotes(ctx: ReturnType<typeof shellStart>): string {
  const s = ctx.scale;
  const startY = ctx.top + Math.round(470 * s);
  const gap = Math.round(102 * s);
  return Array.from({ length: 18 }, (_, i) => {
    const y = startY + i * gap;
    return `<line x1="${ctx.left}" y1="${y}" x2="${ctx.left + ctx.bodyW}" y2="${y}" stroke="${COLORS.line}" stroke-width="${Math.round(4 * s)}"/>`;
  }).join("");
}

function renderPageSvg(size: SizeSpec, page: PageSpec, pageNumber: number): string {
  if (page.kind === "cover") return renderCoverPage(size, page);
  const ctx = shellStart(size, page, pageNumber);
  const title = titleBlock(page, ctx);
  let body = "";
  if (page.kind === "guide" || page.kind === "checklist") body = renderChecklist(page, ctx);
  else if (page.kind === "table") body = renderTable(page, ctx);
  else if (page.kind === "timeline") body = renderTable(page, ctx, true);
  else if (page.kind === "cards") body = renderCards(page, ctx);
  else if (page.kind === "vision") body = renderVision(page, ctx);
  else if (page.kind === "notes") body = renderNotes(ctx);
  return `${ctx.svg}${title}${body}</svg>`;
}

function listingShell(title: string, subtitle: string, body: string, badge?: string): string {
  const w = 2000;
  const h = 2000;
  const badgeWidth = badge ? Math.max(560, badge.length * 30) : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${COLORS.ivory}"/>
    <rect x="54" y="54" width="1892" height="1892" rx="44" fill="${COLORS.paper}" stroke="${COLORS.line}" stroke-width="4"/>
    ${botanicalSprig(104, 94, 0.62, -18)}
    ${botanicalSprig(1896, 1906, 0.62, 162)}
    ${badge ? `<rect x="146" y="138" width="${badgeWidth}" height="70" rx="35" fill="${COLORS.terracotta}"/>${textBlock({ text: badge, x: 178, y: 184, size: 30, fill: COLORS.paper, family: SANS, weight: 800, uppercase: true, letterSpacing: 3 })}` : ""}
    ${textBlock({ text: title, x: 146, y: badge ? 332 : 258, size: 88, fill: COLORS.ink, family: SERIF, maxChars: 30, lineHeight: 96 })}
    ${textBlock({ text: subtitle, x: 148, y: badge ? 540 : 466, size: 38, fill: COLORS.muted, family: SANS, maxChars: 62, lineHeight: 52 })}
    ${body}
  </svg>`;
}

function imgData(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function pageMockup(buffer: Buffer, x: number, y: number, w: number, h: number, rotate = 0): string {
  return `<g transform="rotate(${rotate} ${x + w / 2} ${y + h / 2})">
    <rect x="${x + 28}" y="${y + 34}" width="${w}" height="${h}" rx="18" fill="#000000" opacity="0.12"/>
    <image href="${imgData(buffer)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

function bulletList(items: string[], x: number, y: number, maxChars = 43): string {
  return items
    .map((item, index) => {
      const iy = y + index * 126;
      return `<circle cx="${x}" cy="${iy - 10}" r="18" fill="${COLORS.sage}"/>
        <path d="M${x - 8} ${iy - 12} L${x - 1} ${iy - 3} L${x + 12} ${iy - 20}" fill="none" stroke="${COLORS.paper}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
        ${textBlock({ text: item, x: x + 46, y: iy, size: 38, fill: COLORS.ink, family: SANS, maxChars, lineHeight: 50 })}`;
    })
    .join("");
}

function featureGrid(items: string[], x: number, y: number): string {
  return items
    .map((item, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const gx = x + col * 540;
      const gy = y + row * 170;
      return `<rect x="${gx}" y="${gy}" width="490" height="126" rx="24" fill="${index % 3 === 0 ? COLORS.sageLight : index % 3 === 1 ? COLORS.blush : COLORS.panel}" stroke="${COLORS.line}" stroke-width="3"/>
        ${textBlock({ text: item, x: gx + 34, y: gy + 78, size: 34, fill: COLORS.ink, family: SANS, weight: 800, maxChars: 21 })}`;
    })
    .join("");
}

function renderListingImages(letterPages: Buffer[]): Array<{ name: string; buffer: Buffer }> {
  const cover = letterPages[0]!;
  const checklist = letterPages[5]!;
  const budget = letterPages[11]!;
  const guest = letterPages[17]!;
  const vendor = letterPages[14]!;
  const timeline = letterPages[22]!;
  const packing = letterPages[28]!;
  const finalWeek = letterPages[32]!;

  const svgs = [
    {
      name: "01_cover.png",
      svg: listingShell(
        "Botanical Wedding Planner Binder",
        "A premium printable bundle for couples planning a garden, wildflower, or romantic wedding.",
        `${pageMockup(cover, 1180, 310, 510, 660, 0)}
        <rect x="145" y="1228" width="770" height="92" rx="46" fill="${COLORS.sageDark}"/>
        ${textBlock({ text: "34 printable pages", x: 188, y: 1287, size: 38, fill: COLORS.paper, family: SANS, weight: 800, uppercase: true, letterSpacing: 2 })}
        ${bulletList(["Budget, guests, RSVP, vendors, seating, timeline", "US Letter and A4 PDFs included", "Ready to print instantly after purchase"], 176, 1444, 40)}`,
        "Instant download",
      ),
    },
    {
      name: "02_binder_preview.png",
      svg: listingShell(
        "Looks Like A Real Planning Binder",
        "Clean pages, soft botanical styling, and enough structure to feel complete without overwhelming the bride.",
        `${pageMockup(checklist, 1120, 316, 460, 596, -5)}
        ${pageMockup(budget, 1340, 438, 460, 596, 5)}
        ${pageMockup(guest, 1236, 706, 460, 596, 0)}
        ${bulletList(["Countdown pages for every planning phase", "Trackers for money, people, vendors, and timing", "Polished enough to gift or keep in a wedding folder"], 176, 1280, 42)}`,
        "High perceived value",
      ),
    },
    {
      name: "03_whats_included.png",
      svg: listingShell(
        "What's Included",
        "A full wedding planning system, not a single worksheet.",
        `${featureGrid(
          [
            "Budget",
            "Guest list",
            "RSVP",
            "Seating",
            "Vendors",
            "Venue",
            "Timeline",
            "Photos",
            "Florals",
            "Signage",
            "Packing",
            "Thank-you",
          ],
          148,
          682,
        )}
        <rect x="1260" y="690" width="440" height="440" rx="220" fill="${COLORS.blush}" opacity="0.7"/>
        <rect x="1358" y="800" width="420" height="540" rx="26" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        ${botanicalSprig(1448, 858, 0.85, -18)}
        ${textBlock({ text: "34", x: 1568, y: 1170, size: 164, fill: COLORS.sageDark, family: SERIF, anchor: "middle" })}
        ${textBlock({ text: "pages", x: 1568, y: 1240, size: 46, fill: COLORS.ink, family: SANS, weight: 800, anchor: "middle", uppercase: true })}`,
        "Complete bundle",
      ),
    },
    {
      name: "04_budget_guest_trackers.png",
      svg: listingShell(
        "Budget + Guest Trackers",
        "The pages shoppers expect in a best-selling wedding planner category are built in from the start.",
        `${pageMockup(budget, 1110, 390, 470, 608, -4)}
        ${pageMockup(guest, 1320, 658, 470, 608, 5)}
        ${bulletList(["Master budget overview", "Payment due dates and category tracker", "Guest list, meal notes, RSVP dashboard"], 176, 1230, 42)}`,
        "Buyer-ready pages",
      ),
    },
    {
      name: "05_vendor_venue_pages.png",
      svg: listingShell(
        "Vendor + Venue Decision Pages",
        "Compare quotes, contacts, availability, included items, restrictions, and next steps before booking.",
        `${pageMockup(vendor, 1160, 388, 520, 672, 0)}
        ${bulletList(["Vendor shortlist and final contact sheet", "Venue comparison worksheet", "Clear space for dates, totals, and notes"], 176, 1230, 42)}`,
        "Reduce planning stress",
      ),
    },
    {
      name: "06_timeline_day_of.png",
      svg: listingShell(
        "Timeline + Day-Of Flow",
        "Give your coordinator, photographer, wedding party, or family helper a readable schedule.",
        `${pageMockup(timeline, 1140, 370, 520, 672, 0)}
        ${bulletList(["Ceremony timeline", "Reception flow", "Detailed day-of timeline", "Final week dashboard for key handoffs"], 176, 1210, 42)}`,
        "Day-of helper",
      ),
    },
    {
      name: "07_botanical_style.png",
      svg: listingShell(
        "Botanical Garden Style",
        "Sage, ivory, blush, and terracotta accents make the pages feel wedding-specific, not generic office printables.",
        `<rect x="1110" y="400" width="600" height="760" rx="42" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        ${botanicalSprig(1260, 512, 1.95, -18)}
        ${botanicalSprig(1600, 1030, 1.45, 155)}
        <circle cx="1460" cy="800" r="150" fill="${COLORS.blush}" opacity="0.45"/>
        ${bulletList(["Designed for garden, wildflower, romantic, and botanical wedding searches", "Soft, neutral print palette", "Looks cohesive across every page"], 176, 1210, 42)}`,
        "Trend-aligned",
      ),
    },
    {
      name: "08_files_included.png",
      svg: listingShell(
        "Files Included",
        "Simple delivery for the buyer: download, unzip, print.",
        `${featureGrid(["Letter PDF", "A4 PDF", "Complete ZIP", "Print guide", "Personal license", "Instant files"], 148, 670)}
        <rect x="1210" y="670" width="520" height="540" rx="36" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        ${textBlock({ text: "No physical item", x: 1470, y: 880, size: 54, fill: COLORS.ink, family: SERIF, anchor: "middle", maxChars: 18 })}
        ${textBlock({ text: "Digital download only. Print at home, a copy shop, or an online printer.", x: 1470, y: 1018, size: 34, fill: COLORS.muted, family: SANS, anchor: "middle", maxChars: 28, lineHeight: 46 })}`,
        "Easy download",
      ),
    },
    {
      name: "09_packing_emergency.png",
      svg: listingShell(
        "Details Buyers Forget Until The Last Week",
        "Packing, emergency kit, final payments, weather plan, point person, and take-home items are included.",
        `${pageMockup(packing, 1120, 348, 440, 570, -3)}
        ${pageMockup(finalWeek, 1340, 622, 440, 570, 5)}
        ${bulletList(["Wedding day packing list", "Emergency kit checklist", "Final week dashboard for handoffs"], 176, 1230, 42)}`,
        "Last-week confidence",
      ),
    },
    {
      name: "10_important_info.png",
      svg: listingShell(
        "Important Info",
        "Please read before purchase so expectations are clear.",
        `${bulletList(
          [
            "This is a digital download. Nothing physical will be shipped.",
            "Colors can vary slightly by monitor, printer, ink, and paper.",
            "For personal wedding or event use only.",
            "Download from your Etsy Purchases page after checkout.",
          ],
          186,
          724,
          50,
        )}
        <rect x="1250" y="760" width="430" height="430" rx="215" fill="${COLORS.sageLight}"/>
        ${textBlock({ text: "PDF", x: 1465, y: 990, size: 118, fill: COLORS.sageDark, family: SERIF, anchor: "middle" })}
        ${textBlock({ text: "Letter + A4", x: 1465, y: 1072, size: 39, fill: COLORS.ink, family: SANS, weight: 800, anchor: "middle", uppercase: true })}`,
        "Please note",
      ),
    },
  ];

  return svgs.map(({ name, svg }) => ({ name, buffer: rasterizeSvgToPng(svg) }));
}

function getListingDescription(): string {
  return [
    "A detailed printable wedding planning binder for botanical, garden, wildflower, and romantic weddings.",
    "This instant download is built to feel like a complete planning system, not a one-page checklist. It helps couples organize the decisions that usually create stress near the end: budget, guest list, RSVPs, vendors, seating, timelines, photo priorities, decor, signage, packing, emergency kit, final week handoffs, and thank-you notes.",
    "WHAT IS INCLUDED",
    "- 34 printable planner pages",
    "- US Letter PDF",
    "- A4 PDF",
    "- Complete ZIP bundle with both PDFs, printing guide, and personal-use license",
    "- 10 listing preview images showing the actual product style",
    "PAGE SECTIONS",
    "- How to use this binder",
    "- Wedding vision board",
    "- Priorities and non-negotiables",
    "- 12-month, 9-month, 6-month, 3-month, 1-month, and week-of checklists",
    "- Master budget overview, category tracker, and payment due dates",
    "- Vendor shortlist, vendor contact sheet, and venue comparison",
    "- Guest list, RSVP dashboard, and seating plan worksheet",
    "- Ceremony timeline, reception flow, and day-of timeline",
    "- Photography shot list, floral and decor plan, stationery and signage checklist",
    "- Attire and beauty planner, wedding party contacts, gift registry tracker",
    "- Packing list, emergency kit, honeymoon snapshot, thank-you tracker, final week dashboard, and notes",
    "HOW IT WORKS",
    "Purchase this listing, download the files from Etsy, open the PDF size you prefer, and print at actual size. You can print the full binder or only the sections you need.",
    "IMPORTANT",
    "This is a digital download. No physical product will be shipped. Colors may vary slightly by monitor, printer, ink, and paper. For personal wedding or event use only.",
    buildAiDisclosureText({ usedAiText: true, usedAiImages: false }),
    `Created by ${BRAND_NAME}.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function main() {
  console.log(`Building ${PRODUCT_TITLE} (${PRODUCT_SLUG})`);
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(LISTING_IMAGE_DIR, { recursive: true });
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  await mkdir(QA_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  const technicalIssues: QaIssue[] = [];
  const renderedBySize = new Map<SizeSpec["id"], Buffer[]>();
  const pdfBySize = new Map<SizeSpec["id"], Buffer>();

  for (const size of SIZES) {
    const pagePngs: Buffer[] = [];
    for (const [index, page] of PAGES.entries()) {
      const svg = renderPageSvg(size, page, index + 1);
      const png = rasterizeSvgToPng(svg);
      pagePngs.push(png);
      technicalIssues.push(
        ...(await checkImageTechnical({
          buffer: png,
          expectedWidthIn: size.widthIn,
          expectedHeightIn: size.heightIn,
          label: `${size.id} page ${String(index + 1).padStart(2, "0")} ${page.title.replace(/\n/g, " ")}`,
        })),
      );
    }
    renderedBySize.set(size.id, pagePngs);
    const pdf = await buildPdf(pagePngs.map((png) => ({ pngBuffer: png, widthIn: size.widthIn, heightIn: size.heightIn })));
    pdfBySize.set(size.id, pdf);
    technicalIssues.push(...(await checkPdfValidity(pdf, `${size.label} PDF`)));
  }

  const letterPdf = pdfBySize.get("letter");
  const a4Pdf = pdfBySize.get("a4");
  if (!letterPdf || !a4Pdf) throw new Error("PDF build failed.");

  const instructions = `HOW TO PRINT
${PRODUCT_TITLE}

1. Open the PDF size that matches your printer:
   - US Letter: 8.5 x 11 in
   - A4: 8.27 x 11.69 in
2. Print at actual size or 100 percent scale.
3. Use a binder, discbound notebook, or planning folder.
4. Reprint tracker pages when guest counts, payments, or vendor details change.

This is a digital product. No physical item will be shipped.
`;
  const license = buildLicenseText(PRODUCT_TITLE, BRAND_NAME);
  const zip = await buildZip([
    { filename: `${PRODUCT_SLUG}-letter.pdf`, data: letterPdf },
    { filename: `${PRODUCT_SLUG}-a4.pdf`, data: a4Pdf },
    { filename: "how-to-print.txt", data: Buffer.from(instructions, "utf8") },
    { filename: "license.txt", data: Buffer.from(license, "utf8") },
  ]);
  technicalIssues.push(...(await checkZipValidity(zip, "complete ZIP bundle")));

  const files = [
    { name: `${PRODUCT_SLUG}-letter.pdf`, buffer: letterPdf },
    { name: `${PRODUCT_SLUG}-a4.pdf`, buffer: a4Pdf },
    { name: `${PRODUCT_SLUG}-complete-bundle.zip`, buffer: zip },
  ];
  for (const file of files) {
    if (file.buffer.length > LISTING_LIMITS.maxDigitalFileSizeBytes) {
      throw new Error(`${file.name} is ${(file.buffer.length / 1024 / 1024).toFixed(1)} MB, above Etsy's 20 MB per-file limit.`);
    }
    await writeFile(path.join(DOWNLOAD_DIR, file.name), file.buffer);
  }

  const listingImages = renderListingImages(renderedBySize.get("letter")!);
  if (listingImages.length !== LISTING_LIMITS.maxImages) {
    throw new Error(`Expected ${LISTING_LIMITS.maxImages} listing images, got ${listingImages.length}.`);
  }
  for (const image of listingImages) {
    technicalIssues.push(...(await checkImageTechnical({ buffer: image.buffer, expectedWidthIn: 1, expectedHeightIn: 1, label: image.name })));
    await writeFile(path.join(LISTING_IMAGE_DIR, image.name), image.buffer);
  }

  const tags = [
    "wedding planner",
    "wedding binder",
    "bridal planner",
    "wedding checklist",
    "wedding budget",
    "guest list",
    "rsvp tracker",
    "seating chart",
    "wedding timeline",
    "vendor tracker",
    "garden wedding",
    "botanical bride",
    "printable pdf",
  ];
  const description = getListingDescription();
  const materials = ["Digital File", "PDF", "ZIP"];
  const attributes = { occasion: "Wedding", style: "Botanical", recipient: "Bride", color: "Sage green" };

  const textToAudit = [
    LISTING_TITLE,
    description,
    PRODUCT_TITLE,
    ...tags,
    ...materials,
    ...PAGES.flatMap((page) => [page.section, page.title, page.subtitle, ...(page.items ?? []), ...(page.columns ?? []), ...(page.cards ?? []).flatMap((card) => [card.title, ...card.lines])]),
  ].join(" | ");
  const ipCheck = checkIpRisk(textToAudit, 10);
  const seoIssues: QaIssue[] = [];
  if (LISTING_TITLE.length > LISTING_LIMITS.maxTitleLength) seoIssues.push({ code: "TITLE_TOO_LONG", severity: "error", message: "Listing title exceeds Etsy title limit." });
  if (tags.length !== LISTING_LIMITS.maxTags) seoIssues.push({ code: "TAG_COUNT", severity: "error", message: `Expected ${LISTING_LIMITS.maxTags} tags.` });
  for (const tag of tags) {
    if (tag.length > LISTING_LIMITS.maxTagLength) seoIssues.push({ code: "TAG_TOO_LONG", severity: "error", message: `Tag "${tag}" exceeds ${LISTING_LIMITS.maxTagLength} chars.` });
  }
  if (description.length < 500) seoIssues.push({ code: "DESCRIPTION_TOO_SHORT", severity: "warning", message: "Description is too short for a premium listing." });

  const policyIssues: QaIssue[] =
    ipCheck.riskScore > 0
      ? [
          {
            code: "IP_RISK",
            severity: ipCheck.decision === "REJECTED" ? "error" : "warning",
            message: `IP risk score ${ipCheck.riskScore} (${ipCheck.riskLevel}); matched: ${ipCheck.matchedTerms.map((m) => m.term).join(", ") || "none"}`,
          },
        ]
      : [];
  const placeholderIssues = checkPlaceholderLeakage(textToAudit, "botanical wedding planner product copy");
  const qaReport = buildQaReport({
    designIssues: [],
    technicalIssues: [...technicalIssues, ...placeholderIssues],
    seoIssues,
    originalityIssues: [],
    policyIssues,
    minPassScore: 95,
  });

  await writeFile(path.join(DATA_DIR, "etsy-title.txt"), LISTING_TITLE, "utf8");
  await writeFile(path.join(DATA_DIR, "etsy-description.txt"), description, "utf8");
  await writeFile(path.join(DATA_DIR, "etsy-tags.txt"), tags.join("\n"), "utf8");
  await writeFile(path.join(DATA_DIR, "etsy-price.txt"), `${PRICE_USD.toFixed(2)} USD base price before shop-currency conversion\n`, "utf8");
  await writeFile(path.join(DATA_DIR, "etsy-attributes.json"), JSON.stringify({ ...attributes, materials, type: "download", quantity: 999, should_auto_renew: true }, null, 2), "utf8");
  await writeFile(
    path.join(QA_DIR, "qa-report.json"),
    JSON.stringify(
      {
        productSlug: PRODUCT_SLUG,
        title: LISTING_TITLE,
        priceUsd: PRICE_USD,
        pageCount: PAGES.length,
        listingImageCount: listingImages.length,
        downloadableFiles: files.map((file) => ({ name: file.name, sizeMb: Number((file.buffer.length / 1024 / 1024).toFixed(2)) })),
        qaReport,
        ipCheck,
        feeScheduleMeta: getFeeScheduleMeta(),
      },
      null,
      2,
    ),
    "utf8",
  );

  if (!qaReport.passed || ipCheck.riskScore >= 10) {
    console.error(JSON.stringify({ qaReport, ipCheck }, null, 2));
    throw new Error("QA failed; refusing to prepare publish assets.");
  }

  console.log(
    JSON.stringify(
      {
        slug: PRODUCT_SLUG,
        pageCount: PAGES.length,
        listingImageCount: listingImages.length,
        files: files.map((file) => ({ name: file.name, sizeMb: Number((file.buffer.length / 1024 / 1024).toFixed(2)) })),
        qaScore: qaReport.overallScore,
        ipRiskScore: ipCheck.riskScore,
        output: path.relative(REPO_ROOT, OUT_DIR),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
