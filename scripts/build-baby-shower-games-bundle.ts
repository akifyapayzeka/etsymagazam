#!/usr/bin/env tsx
/**
 * Builds a premium printable baby shower games bundle for direct manual Etsy publishing.
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
const PRODUCT_SLUG = "modern-neutral-baby-shower-games-bundle-v1";
const PRODUCT_TITLE = "Modern Neutral Baby Shower Games Bundle Printable";
const LISTING_TITLE = "Modern Neutral Baby Shower Games Bundle Printable | 18 Baby Shower Games, Signs & Activities PDF";
const PRICE_USD = 7.99;
const DPI = 300;

const CARD_WIDTH_IN = 5;
const CARD_HEIGHT_IN = 7;
const CARD_WIDTH_PX = CARD_WIDTH_IN * DPI;
const CARD_HEIGHT_PX = CARD_HEIGHT_IN * DPI;
const LISTING_SIZE_PX = 2000;

const OUT_DIR = path.join(REPO_ROOT, "artifacts", "manual-publish-assets", PRODUCT_SLUG);
const LISTING_IMAGE_DIR = path.join(OUT_DIR, "images", "listing_images");
const DOWNLOAD_DIR = path.join(OUT_DIR, "downloads");
const QA_DIR = path.join(OUT_DIR, "qa-report");
const DATA_DIR = path.join(OUT_DIR, "listing-data");

const COLORS = {
  ivory: "#FBF7EF",
  paper: "#FFFDF8",
  panel: "#FFFFFF",
  ink: "#2B2925",
  muted: "#726A60",
  line: "#E2D7C8",
  lineDark: "#BFB19E",
  sage: "#7C8A71",
  sageDark: "#4D5B45",
  sageLight: "#E3EBDD",
  clay: "#B97958",
  clayLight: "#EDD3C6",
  blush: "#EBC8BF",
  blue: "#CEDBE4",
  butter: "#EFE2B7",
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

interface PrintSize {
  id: "letter-2up" | "a4-2up";
  label: string;
  widthIn: number;
  heightIn: number;
}

const PRINT_SIZES: PrintSize[] = [
  { id: "letter-2up", label: "US Letter 2-up", widthIn: 11, heightIn: 8.5 },
  { id: "a4-2up", label: "A4 2-up", widthIn: 11.69, heightIn: 8.27 },
];

type CardType = "guide" | "bingo" | "fields" | "scramble" | "answerKey" | "alphabet" | "trivia" | "price" | "points" | "sign" | "tickets" | "tracker" | "address";

interface GameCard {
  id: string;
  group: "Games" | "Keepsakes" | "Signs" | "Host Tools" | "Bonus";
  title: string;
  subtitle: string;
  type: CardType;
  items?: string[];
  fields?: string[];
  answers?: Array<{ prompt: string; answer: string }>;
  callout?: string;
}

const SCRAMBLE_ITEMS = [
  { prompt: "tbotle", answer: "bottle" },
  { prompt: "ripaed", answer: "diaper" },
  { prompt: "lanketb", answer: "blanket" },
  { prompt: "esonie", answer: "onesie" },
  { prompt: "rieficap", answer: "pacifier" },
  { prompt: "ttreal", answer: "rattle" },
  { prompt: "bric", answer: "crib" },
  { prompt: "rolstler", answer: "stroller" },
  { prompt: "dleswad", answer: "swaddle" },
  { prompt: "yballul", answer: "lullaby" },
];

const TRIVIA_ITEMS = [
  { prompt: "What do guests usually bring for a diaper raffle?", answer: "Diapers" },
  { prompt: "What is a shower for a second or later baby often called?", answer: "Baby sprinkle" },
  { prompt: "What card helps collect hopes and dreams for the baby?", answer: "Wishes for Baby" },
  { prompt: "What list helps the host write thank-you notes after gifts?", answer: "Gift log" },
  { prompt: "What word should guests avoid in the classic clothespin game?", answer: "Baby" },
  { prompt: "What game uses a 5 by 5 grid of gifts or baby words?", answer: "Baby Bingo" },
  { prompt: "What short note can make midnight diaper changes more fun?", answer: "Late night diaper note" },
  { prompt: "What game asks guests to guess common baby item costs?", answer: "Guess the Price" },
];

const CARDS: GameCard[] = [
  {
    id: "host-guide",
    group: "Host Tools",
    title: "Host Guide",
    subtitle: "A simple setup page for a relaxed, polished shower.",
    type: "guide",
    items: [
      "Print the card size or 2-up PDF.",
      "Set games near pens before guests arrive.",
      "Choose 3 to 5 games for a short shower.",
      "Keep answer keys with the host.",
      "Use signs and trackers only where helpful.",
      "Save keepsake cards for the parents-to-be.",
    ],
  },
  {
    id: "baby-bingo",
    group: "Games",
    title: "Baby Bingo",
    subtitle: "Fill each square with gifts or baby words, then mark them as they appear.",
    type: "bingo",
    callout: "Free center",
  },
  {
    id: "predictions-advice",
    group: "Keepsakes",
    title: "Predictions & Advice",
    subtitle: "A keepsake card guests can fill in for the parents-to-be.",
    type: "fields",
    fields: ["Arrival date", "Time", "Weight", "Length", "Hair", "Eyes", "My best advice", "A little note for baby"],
  },
  {
    id: "wishes-for-baby",
    group: "Keepsakes",
    title: "Wishes For Baby",
    subtitle: "Soft prompts that become a meaningful keepsake after the party.",
    type: "fields",
    fields: ["I hope you learn", "I hope you love", "I hope you laugh at", "I hope you always remember", "I hope you become", "With love from"],
  },
  {
    id: "word-scramble",
    group: "Games",
    title: "Baby Word Scramble",
    subtitle: "Unscramble each baby shower word before the timer ends.",
    type: "scramble",
    answers: SCRAMBLE_ITEMS,
  },
  {
    id: "word-scramble-key",
    group: "Host Tools",
    title: "Word Scramble Key",
    subtitle: "Keep this answer page with the host.",
    type: "answerKey",
    answers: SCRAMBLE_ITEMS,
  },
  {
    id: "baby-name-race",
    group: "Games",
    title: "Baby Name Race",
    subtitle: "Write one baby name for as many letters as possible.",
    type: "alphabet",
    callout: "3 minute game",
  },
  {
    id: "baby-shower-trivia",
    group: "Games",
    title: "Baby Shower Trivia",
    subtitle: "A light, host-friendly trivia card for guests to complete.",
    type: "trivia",
    answers: TRIVIA_ITEMS,
  },
  {
    id: "trivia-key",
    group: "Host Tools",
    title: "Trivia Answer Key",
    subtitle: "Simple answers for checking the trivia game.",
    type: "answerKey",
    answers: TRIVIA_ITEMS,
  },
  {
    id: "guess-the-price",
    group: "Games",
    title: "Guess The Price",
    subtitle: "Guess the price of everyday baby items. Closest total wins.",
    type: "price",
    items: ["Diapers", "Wipes", "Bottle", "Pacifier", "Blanket", "Onesie", "Baby wash", "Lotion", "Teether", "Burp cloth"],
  },
  {
    id: "whats-in-your-bag",
    group: "Games",
    title: "What's In Your Bag?",
    subtitle: "Give yourself points for each item you already have with you.",
    type: "points",
    items: ["Lip balm", "Receipt", "Pen", "Mint or gum", "Hair tie", "Baby photo", "Tissue", "Hand sanitizer", "Keychain", "Snack"],
  },
  {
    id: "parent-quiz",
    group: "Games",
    title: "Parent-To-Be Quiz",
    subtitle: "How well do guests know the parents-to-be?",
    type: "fields",
    fields: ["Favorite comfort food", "First baby item bought", "Most likely to sing lullabies", "Favorite childhood book", "Go-to coffee order", "Dream family day", "Best parenting superpower", "Tie-breaker answer"],
  },
  {
    id: "dont-say-baby",
    group: "Signs",
    title: "Don't Say Baby",
    subtitle: "Take a pin when you arrive. If someone says the word, you can take their pin.",
    type: "sign",
    callout: "Most pins wins",
  },
  {
    id: "diaper-raffle-sign",
    group: "Signs",
    title: "Diaper Raffle",
    subtitle: "Bring a pack of diapers and fill out a ticket for a chance to win.",
    type: "sign",
    callout: "Host favorite",
  },
  {
    id: "diaper-raffle-tickets",
    group: "Bonus",
    title: "Diaper Raffle Tickets",
    subtitle: "Four clean raffle tickets on one card page.",
    type: "tickets",
  },
  {
    id: "late-night-notes",
    group: "Keepsakes",
    title: "Late Night Diaper Notes",
    subtitle: "Write a tiny note to make a late-night change feel lighter.",
    type: "fields",
    fields: ["Dear parents", "When it is 2 AM, remember", "One thing you are already great at", "Love from"],
  },
  {
    id: "gift-log",
    group: "Host Tools",
    title: "Gift Log",
    subtitle: "Track gifts and notes for easy thank-you cards after the shower.",
    type: "tracker",
    items: ["Guest", "Gift", "Thank-you sent"],
  },
  {
    id: "thank-you-address",
    group: "Bonus",
    title: "Thank You Address Cards",
    subtitle: "Collect mailing details while everyone is already together.",
    type: "address",
  },
];

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number): string[] {
  const forced = text.split("\n");
  return forced.flatMap((line) => {
    const words = line.split(/\s+/).filter(Boolean);
    const result: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        result.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) result.push(current);
    return result.length ? result : [""];
  });
}

function textBlock(input: {
  text: string;
  x: number;
  y: number;
  size: number;
  fill?: string;
  family?: string;
  weight?: number | string;
  anchor?: "start" | "middle" | "end";
  maxChars?: number;
  lineHeight?: number;
  uppercase?: boolean;
  letterSpacing?: number;
}): string {
  const text = input.uppercase ? input.text.toUpperCase() : input.text;
  const lines = input.maxChars ? wrapText(text, input.maxChars) : text.split("\n");
  const lineHeight = input.lineHeight ?? Math.round(input.size * 1.22);
  return lines
    .map(
      (line, index) =>
        `<text x="${input.x}" y="${input.y + index * lineHeight}" font-family="${input.family ?? SANS}" font-size="${input.size}" font-weight="${input.weight ?? 400}" fill="${
          input.fill ?? COLORS.ink
        }" text-anchor="${input.anchor ?? "start"}" letter-spacing="${input.letterSpacing ?? 0}">${esc(line)}</text>`,
    )
    .join("");
}

function subtlePattern(): string {
  return Array.from({ length: 9 })
    .map((_, index) => {
      const x = 120 + index * 160;
      return `<circle cx="${x}" cy="1860" r="${index % 2 === 0 ? 7 : 5}" fill="${COLORS.sage}" opacity="0.22"/>`;
    })
    .join("");
}

function cardHeader(card: GameCard): string {
  return `<rect x="74" y="74" width="1352" height="1952" rx="46" fill="${COLORS.paper}" stroke="${COLORS.line}" stroke-width="5"/>
    <rect x="116" y="116" width="1268" height="1868" rx="34" fill="none" stroke="${COLORS.line}" stroke-width="2"/>
    <path d="M116 395 C240 320 344 320 472 395 C594 466 710 468 832 395 C956 321 1090 323 1220 396 C1282 432 1333 439 1384 423" fill="none" stroke="${COLORS.sage}" stroke-width="5" opacity="0.42"/>
    <circle cx="238" cy="240" r="54" fill="${COLORS.clayLight}"/>
    <circle cx="320" cy="240" r="18" fill="${COLORS.sageLight}"/>
    <rect x="1038" y="178" width="236" height="62" rx="31" fill="${COLORS.sageLight}" stroke="${COLORS.line}" stroke-width="2"/>
    ${textBlock({ text: card.group, x: 1156, y: 219, size: 25, fill: COLORS.sageDark, family: SANS, weight: 800, anchor: "middle", uppercase: true })}
    ${textBlock({ text: "Modern Baby Shower Games", x: 750, y: 292, size: 32, fill: COLORS.muted, family: SANS, weight: 800, anchor: "middle", uppercase: true })}
    ${textBlock({ text: card.title, x: 750, y: 448, size: 82, fill: COLORS.ink, family: SERIF, weight: 700, anchor: "middle", maxChars: 21, lineHeight: 90 })}
    ${textBlock({ text: card.subtitle, x: 750, y: 620, size: 35, fill: COLORS.muted, family: SANS, anchor: "middle", maxChars: 48, lineHeight: 48 })}
    <line x1="250" y1="746" x2="1250" y2="746" stroke="${COLORS.lineDark}" stroke-width="3"/>
    ${subtlePattern()}`;
}

function checkboxList(items: string[], x: number, y: number, gap = 136): string {
  return items
    .map((item, index) => {
      const cy = y + index * gap;
      return `<rect x="${x}" y="${cy - 42}" width="52" height="52" rx="8" fill="${COLORS.panel}" stroke="${COLORS.sageDark}" stroke-width="4"/>
        ${textBlock({ text: item, x: x + 82, y: cy, size: 37, fill: COLORS.ink, family: SANS, weight: 700, maxChars: 42, lineHeight: 48 })}`;
    })
    .join("");
}

function fieldLines(fields: string[]): string {
  return fields
    .map((field, index) => {
      const x = index % 2 === 0 ? 170 : 790;
      const y = 870 + Math.floor(index / 2) * 235;
      const width = index % 2 === 0 ? 500 : 540;
      return `<text x="${x}" y="${y}" font-family="${SANS}" font-size="31" font-weight="800" fill="${COLORS.muted}" letter-spacing="0">${esc(field)}</text>
        <line x1="${x}" y1="${y + 80}" x2="${x + width}" y2="${y + 80}" stroke="${COLORS.lineDark}" stroke-width="4"/>
        <line x1="${x}" y1="${y + 146}" x2="${x + width}" y2="${y + 146}" stroke="${COLORS.line}" stroke-width="3"/>`;
    })
    .join("");
}

function bingoGrid(): string {
  const startX = 190;
  const startY = 860;
  const cell = 224;
  let grid = "";
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const isFree = row === 2 && col === 2;
      grid += `<rect x="${startX + col * cell}" y="${startY + row * cell}" width="${cell}" height="${cell}" fill="${isFree ? COLORS.sageLight : COLORS.panel}" stroke="${COLORS.lineDark}" stroke-width="3"/>
        ${
          isFree
            ? textBlock({ text: "FREE", x: startX + col * cell + cell / 2, y: startY + row * cell + 122, size: 36, fill: COLORS.sageDark, family: SANS, weight: 900, anchor: "middle" })
            : ""
        }`;
    }
  }
  return grid;
}

function numberedList(items: Array<{ prompt: string; answer?: string }>, x: number, y: number, gap = 114, withAnswers = false): string {
  return items
    .map((item, index) => {
      const cy = y + index * gap;
      const text = withAnswers ? `${item.prompt} - ${item.answer ?? ""}` : item.prompt;
      return `<circle cx="${x + 24}" cy="${cy - 12}" r="27" fill="${index % 2 === 0 ? COLORS.sageLight : COLORS.clayLight}" stroke="${COLORS.line}" stroke-width="2"/>
        ${textBlock({ text: `${index + 1}`, x: x + 24, y: cy - 2, size: 26, fill: COLORS.ink, family: SANS, weight: 900, anchor: "middle" })}
        ${textBlock({ text, x: x + 70, y: cy, size: withAnswers ? 30 : 35, fill: COLORS.ink, family: SANS, weight: 700, maxChars: withAnswers ? 43 : 45, lineHeight: withAnswers ? 39 : 43 })}
        ${withAnswers ? "" : `<line x1="${x + 70}" y1="${cy + 54}" x2="${x + 1040}" y2="${cy + 54}" stroke="${COLORS.line}" stroke-width="3"/>`}`;
    })
    .join("");
}

function alphabetRace(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return letters
    .map((letter, index) => {
      const col = index < 13 ? 0 : 1;
      const row = index % 13;
      const x = col === 0 ? 190 : 790;
      const y = 845 + row * 72;
      return `<text x="${x}" y="${y}" font-family="${SANS}" font-size="31" font-weight="900" fill="${COLORS.sageDark}" letter-spacing="0">${letter}</text>
        <line x1="${x + 58}" y1="${y - 8}" x2="${x + 460}" y2="${y - 8}" stroke="${COLORS.lineDark}" stroke-width="3"/>`;
    })
    .join("");
}

function priceTable(items: string[]): string {
  const header = `<rect x="150" y="815" width="1200" height="82" rx="16" fill="${COLORS.sageDark}"/>
    ${textBlock({ text: "Item", x: 210, y: 868, size: 29, fill: COLORS.paper, family: SANS, weight: 900 })}
    ${textBlock({ text: "Your Guess", x: 720, y: 868, size: 29, fill: COLORS.paper, family: SANS, weight: 900 })}
    ${textBlock({ text: "Actual", x: 1090, y: 868, size: 29, fill: COLORS.paper, family: SANS, weight: 900 })}`;
  const rows = items
    .map((item, index) => {
      const y = 897 + index * 88;
      return `<rect x="150" y="${y}" width="1200" height="88" fill="${index % 2 === 0 ? COLORS.panel : COLORS.ivory}" stroke="${COLORS.line}" stroke-width="2"/>
        ${textBlock({ text: item, x: 210, y: y + 55, size: 29, fill: COLORS.ink, family: SANS, weight: 700 })}
        <line x1="710" y1="${y + 54}" x2="960" y2="${y + 54}" stroke="${COLORS.lineDark}" stroke-width="3"/>
        <line x1="1080" y1="${y + 54}" x2="1310" y2="${y + 54}" stroke="${COLORS.lineDark}" stroke-width="3"/>`;
    })
    .join("");
  return header + rows + `<line x1="710" y1="1815" x2="1310" y2="1815" stroke="${COLORS.sageDark}" stroke-width="4"/>
    ${textBlock({ text: "Total closest wins", x: 1000, y: 1880, size: 32, fill: COLORS.sageDark, family: SANS, weight: 900, anchor: "middle" })}`;
}

function pointsList(items: string[]): string {
  return items
    .map((item, index) => {
      const y = 850 + index * 98;
      const points = index % 4 === 0 ? 5 : index % 4 === 1 ? 3 : index % 4 === 2 ? 2 : 1;
      return `<rect x="170" y="${y - 46}" width="1160" height="72" rx="16" fill="${index % 2 === 0 ? COLORS.panel : COLORS.ivory}" stroke="${COLORS.line}" stroke-width="2"/>
        <rect x="205" y="${y - 25}" width="34" height="34" rx="6" fill="${COLORS.panel}" stroke="${COLORS.sageDark}" stroke-width="3"/>
        ${textBlock({ text: item, x: 275, y, size: 31, fill: COLORS.ink, family: SANS, weight: 700 })}
        ${textBlock({ text: `${points} pts`, x: 1220, y, size: 30, fill: COLORS.clay, family: SANS, weight: 900, anchor: "end" })}`;
    })
    .join("");
}

function signBody(card: GameCard): string {
  return `<rect x="205" y="875" width="1090" height="640" rx="38" fill="${COLORS.ivory}" stroke="${COLORS.lineDark}" stroke-width="4"/>
    ${textBlock({ text: card.callout ?? "Party game", x: 750, y: 1006, size: 52, fill: COLORS.clay, family: SERIF, weight: 700, anchor: "middle", maxChars: 18 })}
    ${textBlock({ text: card.subtitle, x: 750, y: 1195, size: 48, fill: COLORS.ink, family: SANS, weight: 800, anchor: "middle", maxChars: 31, lineHeight: 64 })}
    <path d="M510 1415 C595 1370 668 1372 748 1415 C822 1455 905 1455 990 1415" fill="none" stroke="${COLORS.sage}" stroke-width="6" stroke-linecap="round"/>`;
}

function ticketBlocks(): string {
  return Array.from({ length: 4 })
    .map((_, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 160 + col * 620;
      const y = 860 + row * 420;
      return `<rect x="${x}" y="${y}" width="560" height="330" rx="24" fill="${COLORS.panel}" stroke="${COLORS.lineDark}" stroke-width="4"/>
        ${textBlock({ text: "Diaper Raffle", x: x + 280, y: y + 76, size: 42, fill: COLORS.ink, family: SERIF, weight: 700, anchor: "middle" })}
        ${textBlock({ text: "Name", x: x + 58, y: y + 156, size: 28, fill: COLORS.muted, family: SANS, weight: 800 })}
        <line x1="${x + 150}" y1="${y + 149}" x2="${x + 502}" y2="${y + 149}" stroke="${COLORS.lineDark}" stroke-width="3"/>
        ${textBlock({ text: "Phone", x: x + 58, y: y + 226, size: 28, fill: COLORS.muted, family: SANS, weight: 800 })}
        <line x1="${x + 160}" y1="${y + 219}" x2="${x + 502}" y2="${y + 219}" stroke="${COLORS.lineDark}" stroke-width="3"/>
        <circle cx="${x + 90}" cy="${y + 278}" r="12" fill="${COLORS.sageLight}"/>
        <circle cx="${x + 130}" cy="${y + 278}" r="12" fill="${COLORS.clayLight}"/>
        <circle cx="${x + 170}" cy="${y + 278}" r="12" fill="${COLORS.blue}"/>`;
    })
    .join("");
}

function trackerTable(): string {
  const rows = Array.from({ length: 10 });
  const header = `<rect x="150" y="825" width="1200" height="82" rx="14" fill="${COLORS.sageDark}"/>
    ${textBlock({ text: "Guest", x: 205, y: 878, size: 28, fill: COLORS.paper, family: SANS, weight: 900 })}
    ${textBlock({ text: "Gift", x: 602, y: 878, size: 28, fill: COLORS.paper, family: SANS, weight: 900 })}
    ${textBlock({ text: "Sent", x: 1130, y: 878, size: 28, fill: COLORS.paper, family: SANS, weight: 900 })}`;
  return (
    header +
    rows
      .map((_, index) => {
        const y = 907 + index * 94;
        return `<rect x="150" y="${y}" width="1200" height="94" fill="${index % 2 === 0 ? COLORS.panel : COLORS.ivory}" stroke="${COLORS.line}" stroke-width="2"/>
          <line x1="540" y1="${y}" x2="540" y2="${y + 94}" stroke="${COLORS.line}" stroke-width="2"/>
          <line x1="1070" y1="${y}" x2="1070" y2="${y + 94}" stroke="${COLORS.line}" stroke-width="2"/>
          <rect x="1160" y="${y + 29}" width="34" height="34" rx="6" fill="${COLORS.panel}" stroke="${COLORS.lineDark}" stroke-width="3"/>`;
      })
      .join("")
  );
}

function addressCards(): string {
  return Array.from({ length: 4 })
    .map((_, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const x = 160 + col * 620;
      const y = 850 + row * 440;
      return `<rect x="${x}" y="${y}" width="560" height="350" rx="28" fill="${COLORS.panel}" stroke="${COLORS.lineDark}" stroke-width="4"/>
        ${textBlock({ text: "Thank You Address", x: x + 280, y: y + 76, size: 34, fill: COLORS.ink, family: SERIF, weight: 700, anchor: "middle" })}
        ${["Name", "Address", "City / State", "Email"].map((label, fieldIndex) => {
          const lineY = y + 135 + fieldIndex * 58;
          return `${textBlock({ text: label, x: x + 52, y: lineY, size: 23, fill: COLORS.muted, family: SANS, weight: 800 })}
            <line x1="${x + 190}" y1="${lineY - 7}" x2="${x + 505}" y2="${lineY - 7}" stroke="${COLORS.lineDark}" stroke-width="3"/>`;
        }).join("")}`;
    })
    .join("");
}

function renderCardSvg(card: GameCard): string {
  let body = "";
  if (card.type === "guide") body = checkboxList(card.items ?? [], 175, 860, 136);
  if (card.type === "bingo") body = bingoGrid();
  if (card.type === "fields") body = fieldLines(card.fields ?? []);
  if (card.type === "scramble") body = numberedList(card.answers ?? [], 175, 850, 112, false);
  if (card.type === "answerKey") body = numberedList(card.answers ?? [], 175, 850, 101, true);
  if (card.type === "alphabet") body = alphabetRace();
  if (card.type === "trivia") body = numberedList(card.answers ?? [], 175, 830, 124, false);
  if (card.type === "price") body = priceTable(card.items ?? []);
  if (card.type === "points") body = pointsList(card.items ?? []);
  if (card.type === "sign") body = signBody(card);
  if (card.type === "tickets") body = ticketBlocks();
  if (card.type === "tracker") body = trackerTable();
  if (card.type === "address") body = addressCards();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH_PX}" height="${CARD_HEIGHT_PX}" viewBox="0 0 ${CARD_WIDTH_PX} ${CARD_HEIGHT_PX}">
    <rect width="${CARD_WIDTH_PX}" height="${CARD_HEIGHT_PX}" fill="${COLORS.ivory}"/>
    ${cardHeader(card)}
    ${body}
    <text x="750" y="1942" font-family="${SANS}" font-size="24" font-weight="800" fill="${COLORS.muted}" text-anchor="middle" letter-spacing="0">${esc(BRAND_NAME)} | Digital printable</text>
  </svg>`;
}

function imageHref(buffer: Buffer): string {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function cardMockup(buffer: Buffer, x: number, y: number, width: number, height: number, rotate = 0, shadow = true): string {
  const cx = x + width / 2;
  const cy = y + height / 2;
  return `<g transform="rotate(${rotate} ${cx} ${cy})">
    ${shadow ? `<rect x="${x + 24}" y="${y + 26}" width="${width}" height="${height}" rx="28" fill="#000000" opacity="0.12"/>` : ""}
    <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="28" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="3"/>
    <image href="${imageHref(buffer)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}

function listingBase(title: string, subtitle: string, badge?: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LISTING_SIZE_PX}" height="${LISTING_SIZE_PX}" viewBox="0 0 ${LISTING_SIZE_PX} ${LISTING_SIZE_PX}">
    <rect width="${LISTING_SIZE_PX}" height="${LISTING_SIZE_PX}" fill="${COLORS.ivory}"/>
    <rect x="70" y="70" width="1860" height="1860" rx="48" fill="${COLORS.paper}" stroke="${COLORS.line}" stroke-width="4"/>
    <path d="M95 1515 C370 1400 640 1415 910 1532 C1190 1653 1520 1638 1905 1470" fill="none" stroke="${COLORS.sage}" stroke-width="8" opacity="0.18"/>
    <circle cx="180" cy="260" r="18" fill="${COLORS.clay}" opacity="0.55"/>
    <circle cx="228" cy="260" r="18" fill="${COLORS.sage}" opacity="0.52"/>
    <circle cx="276" cy="260" r="18" fill="${COLORS.blue}" opacity="0.7"/>
    ${badge ? `<rect x="1500" y="150" width="270" height="82" rx="41" fill="${COLORS.sageLight}" stroke="${COLORS.line}" stroke-width="3"/>
      ${textBlock({ text: badge, x: 1635, y: 202, size: 28, fill: COLORS.sageDark, family: SANS, weight: 900, anchor: "middle", uppercase: true })}` : ""}
    ${textBlock({ text: title, x: 170, y: 245, size: 74, fill: COLORS.ink, family: SERIF, weight: 700, maxChars: 31, lineHeight: 82 })}
    ${textBlock({ text: subtitle, x: 172, y: 442, size: 34, fill: COLORS.muted, family: SANS, maxChars: 58, lineHeight: 46 })}`;
}

function closeSvg(): string {
  return "</svg>";
}

function featureGrid(items: string[], x: number, y: number, columns = 2): string {
  return items
    .map((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const width = columns === 2 ? 525 : 360;
      const height = columns === 1 ? 70 : 82;
      const rowGap = columns === 1 ? 88 : 116;
      const fontSize = columns === 1 ? 25 : 29;
      const gx = x + col * (width + 44);
      const gy = y + row * rowGap;
      const fill = index % 3 === 0 ? COLORS.sageLight : index % 3 === 1 ? COLORS.clayLight : COLORS.panel;
      return `<rect x="${gx}" y="${gy}" width="${width}" height="${height}" rx="20" fill="${fill}" stroke="${COLORS.line}" stroke-width="3"/>
        ${textBlock({ text: item, x: gx + width / 2, y: gy + (columns === 1 ? 45 : 53), size: fontSize, fill: COLORS.ink, family: SANS, weight: 900, anchor: "middle", maxChars: columns === 2 ? 20 : 13 })}`;
    })
    .join("");
}

function miniStep(number: number, label: string, detail: string, x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="58" fill="${COLORS.sageDark}"/>
    ${textBlock({ text: `${number}`, x, y: y + 16, size: 46, fill: COLORS.paper, family: SERIF, weight: 700, anchor: "middle" })}
    ${textBlock({ text: label, x: x + 105, y: y - 12, size: 38, fill: COLORS.ink, family: SANS, weight: 900 })}
    ${textBlock({ text: detail, x: x + 105, y: y + 40, size: 28, fill: COLORS.muted, family: SANS, maxChars: 33, lineHeight: 36 })}`;
}

function renderListingImages(cardPngs: Buffer[]): Array<{ name: string; buffer: Buffer }> {
  const [guide, bingo, predictions, wishes, scramble, key, nameRace, trivia, triviaKey, price, bag, parentQuiz, dontSay, raffleSign, raffleTickets, notes, giftLog, addresses] =
    cardPngs;
  if (!guide || !bingo || !predictions || !wishes || !scramble || !key || !nameRace || !trivia || !triviaKey || !price || !bag || !parentQuiz || !dontSay || !raffleSign || !raffleTickets || !notes || !giftLog || !addresses) {
    throw new Error("Missing rendered card pages for listing images.");
  }

  const svgs = [
    {
      name: "01_main_showcase.png",
      svg:
        listingBase("Modern Baby Shower Games Bundle", "18 printable games, signs and activity cards for a polished neutral shower.", "Instant PDF") +
        `<rect x="905" y="485" width="720" height="1000" rx="42" fill="${COLORS.sageLight}" opacity="0.82"/>
        ${cardMockup(scramble, 950, 470, 438, 613, -8)}
        ${cardMockup(bingo, 1175, 580, 438, 613, 7)}
        ${cardMockup(predictions, 1055, 775, 438, 613, 0)}
        <rect x="178" y="1470" width="560" height="105" rx="52" fill="${COLORS.clayLight}" stroke="${COLORS.line}" stroke-width="3"/>
        ${textBlock({ text: "Letter + A4 + 5x7", x: 458, y: 1536, size: 34, fill: COLORS.ink, family: SANS, weight: 900, anchor: "middle" })}
        ${closeSvg()}`,
    },
    {
      name: "02_overview.png",
      svg:
        listingBase("Full Game Night Overview", "A cohesive printable set with real pages shown from the bundle.", "18 cards") +
        `${cardMockup(bingo, 188, 650, 350, 490, -9)}
        ${cardMockup(scramble, 512, 608, 350, 490, 5)}
        ${cardMockup(trivia, 846, 682, 350, 490, -3)}
        ${cardMockup(price, 1185, 614, 350, 490, 6)}
        ${cardMockup(raffleSign, 412, 1040, 350, 490, -6)}
        ${cardMockup(giftLog, 752, 1088, 350, 490, 4)}
        ${cardMockup(addresses, 1090, 1030, 350, 490, -3)}
        ${closeSvg()}`,
    },
    {
      name: "03_whats_included.png",
      svg:
        listingBase("What's Included", "A buyer can see exactly what is inside before downloading.", "Bundle") +
        `${featureGrid(["18 card pages", "5x7 PDF", "Letter 2-up PDF", "A4 2-up PDF", "Answer keys", "Host guide", "Bonus signs", "Complete ZIP"], 170, 650, 2)}
        <rect x="1260" y="1110" width="430" height="430" rx="215" fill="${COLORS.sageLight}" stroke="${COLORS.line}" stroke-width="4"/>
        ${textBlock({ text: "18", x: 1475, y: 1310, size: 142, fill: COLORS.sageDark, family: SERIF, weight: 700, anchor: "middle" })}
        ${textBlock({ text: "real pages", x: 1475, y: 1398, size: 38, fill: COLORS.ink, family: SANS, weight: 900, anchor: "middle", uppercase: true })}
        ${cardMockup(guide, 1180, 650, 292, 409, -5)}
        ${cardMockup(key, 1428, 708, 292, 409, 5)}
        ${closeSvg()}`,
    },
    {
      name: "04_how_to_use.png",
      svg:
        listingBase("Print, Cut And Play", "Made for simple party prep with no app, login or editing software required.", "Easy use") +
        `${miniStep(1, "Purchase", "Buy once and download from Etsy.", 245, 705)}
        ${miniStep(2, "Print", "Choose 5x7, Letter 2-up or A4 2-up.", 245, 925)}
        ${miniStep(3, "Cut", "Use the built-in card layout.", 245, 1145)}
        ${miniStep(4, "Play", "Set out the cards with pens.", 245, 1365)}
        ${cardMockup(nameRace, 1215, 620, 400, 560, -3)}
        ${cardMockup(raffleTickets, 1000, 930, 400, 560, 5)}
        ${closeSvg()}`,
    },
    {
      name: "05_closeup_details.png",
      svg:
        listingBase("Clean Close-Up Details", "Readable boxes, prompts and answer areas built for real party use.", "Details") +
        `${cardMockup(scramble, 195, 690, 440, 616, -2)}
        ${cardMockup(predictions, 700, 615, 440, 616, 2)}
        ${cardMockup(bingo, 1205, 690, 440, 616, -2)}
        <rect x="282" y="1495" width="1290" height="92" rx="46" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="3"/>
        ${textBlock({ text: "Real exported pages, not fake preview content", x: 927, y: 1554, size: 34, fill: COLORS.sageDark, family: SANS, weight: 900, anchor: "middle" })}
        ${closeSvg()}`,
    },
    {
      name: "06_content_structure.png",
      svg:
        listingBase("Built Like A Complete Party Kit", "The set covers games, keepsakes, signs and host tools.", "System") +
        `<rect x="170" y="640" width="520" height="830" rx="34" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        ${textBlock({ text: "Games", x: 430, y: 735, size: 56, fill: COLORS.ink, family: SERIF, weight: 700, anchor: "middle" })}
        ${featureGrid(["Bingo", "Scramble", "Trivia", "Name race", "Price guess", "Bag game", "Parent quiz"], 218, 820, 1)}
        <rect x="740" y="640" width="520" height="830" rx="34" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        ${textBlock({ text: "Keepsakes", x: 1000, y: 735, size: 56, fill: COLORS.ink, family: SERIF, weight: 700, anchor: "middle" })}
        ${featureGrid(["Predictions", "Advice", "Wishes", "Diaper notes", "Addresses"], 788, 820, 1)}
        <rect x="1310" y="640" width="520" height="830" rx="34" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        ${textBlock({ text: "Host Tools", x: 1570, y: 735, size: 56, fill: COLORS.ink, family: SERIF, weight: 700, anchor: "middle" })}
        ${featureGrid(["Host guide", "Answer keys", "Raffle sign", "Tickets", "Gift log"], 1358, 820, 1)}
        ${closeSvg()}`,
    },
    {
      name: "07_fill_in_fields.png",
      svg:
        listingBase("Fill-In Printable Design", "Blank lines and grids make each card easy to personalize by hand.", "Write in") +
        `${cardMockup(wishes, 230, 650, 430, 602, -4)}
        ${cardMockup(parentQuiz, 650, 750, 430, 602, 4)}
        ${cardMockup(notes, 1080, 650, 430, 602, -2)}
        <rect x="290" y="1470" width="1270" height="110" rx="55" fill="${COLORS.sageLight}" stroke="${COLORS.line}" stroke-width="3"/>
        ${textBlock({ text: "Print and write in. No software editing required.", x: 925, y: 1538, size: 34, fill: COLORS.sageDark, family: SANS, weight: 900, anchor: "middle" })}
        ${closeSvg()}`,
    },
    {
      name: "08_bonus_pages.png",
      svg:
        listingBase("Bonus Host Pages", "Useful extras are included as real pages inside the download.", "Bonus") +
        `${cardMockup(raffleSign, 250, 680, 370, 518, -4)}
        ${cardMockup(raffleTickets, 602, 820, 370, 518, 5)}
        ${cardMockup(giftLog, 955, 680, 370, 518, -3)}
        ${cardMockup(addresses, 1308, 820, 370, 518, 4)}
        <rect x="260" y="1525" width="1215" height="88" rx="44" fill="${COLORS.clayLight}" stroke="${COLORS.line}" stroke-width="3"/>
        ${textBlock({ text: "Diaper raffle, gift log and address cards included", x: 868, y: 1582, size: 31, fill: COLORS.ink, family: SANS, weight: 900, anchor: "middle" })}
        ${closeSvg()}`,
    },
    {
      name: "09_download_process.png",
      svg:
        listingBase("How It Works", "A straightforward digital download for fast shower prep.", "Digital") +
        `<rect x="250" y="680" width="1500" height="790" rx="44" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        ${miniStep(1, "Purchase", "Complete checkout on Etsy.", 410, 850)}
        ${miniStep(2, "Download", "Open your Etsy Purchases page.", 410, 1050)}
        ${miniStep(3, "Print", "Use Letter, A4 or 5x7 files.", 410, 1250)}
        ${miniStep(4, "Play", "Cut cards and set them out.", 410, 1450)}
        ${cardMockup(triviaKey, 1270, 850, 330, 462, 3)}
        ${closeSvg()}`,
    },
    {
      name: "10_final_mockup.png",
      svg:
        listingBase("Neutral Shower Table Look", "A warm, minimal final preview using only real product pages.", "Final look") +
        `<rect x="220" y="630" width="1500" height="960" rx="52" fill="${COLORS.panel}" stroke="${COLORS.line}" stroke-width="4"/>
        <rect x="320" y="740" width="500" height="700" rx="36" fill="${COLORS.sageLight}" opacity="0.7"/>
        ${cardMockup(bingo, 360, 700, 380, 532, -5)}
        ${cardMockup(price, 735, 820, 380, 532, 4)}
        ${cardMockup(predictions, 1110, 705, 380, 532, -2)}
        <line x1="335" y1="1500" x2="1580" y2="1500" stroke="${COLORS.lineDark}" stroke-width="5"/>
        ${textBlock({ text: "Cohesive, printable, ready for the party table", x: 970, y: 1562, size: 34, fill: COLORS.sageDark, family: SANS, weight: 900, anchor: "middle" })}
        ${closeSvg()}`,
    },
  ];

  return svgs.map(({ name, svg }) => ({ name, buffer: rasterizeSvgToPng(svg) }));
}

function renderTwoUpSvg(size: PrintSize, first: Buffer, second: Buffer): string {
  const widthPx = Math.round(size.widthIn * DPI);
  const heightPx = Math.round(size.heightIn * DPI);
  const gap = 120;
  const x1 = Math.round((widthPx - CARD_WIDTH_PX * 2 - gap) / 2);
  const x2 = x1 + CARD_WIDTH_PX + gap;
  const y = Math.round((heightPx - CARD_HEIGHT_PX) / 2);
  const guideColor = COLORS.lineDark;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">
    <rect width="${widthPx}" height="${heightPx}" fill="${COLORS.paper}"/>
    <line x1="${x1 - 34}" y1="${y - 34}" x2="${x1 + CARD_WIDTH_PX + 34}" y2="${y - 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <line x1="${x1 - 34}" y1="${y + CARD_HEIGHT_PX + 34}" x2="${x1 + CARD_WIDTH_PX + 34}" y2="${y + CARD_HEIGHT_PX + 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <line x1="${x1 - 34}" y1="${y - 34}" x2="${x1 - 34}" y2="${y + CARD_HEIGHT_PX + 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <line x1="${x1 + CARD_WIDTH_PX + 34}" y1="${y - 34}" x2="${x1 + CARD_WIDTH_PX + 34}" y2="${y + CARD_HEIGHT_PX + 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <line x1="${x2 - 34}" y1="${y - 34}" x2="${x2 + CARD_WIDTH_PX + 34}" y2="${y - 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <line x1="${x2 - 34}" y1="${y + CARD_HEIGHT_PX + 34}" x2="${x2 + CARD_WIDTH_PX + 34}" y2="${y + CARD_HEIGHT_PX + 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <line x1="${x2 - 34}" y1="${y - 34}" x2="${x2 - 34}" y2="${y + CARD_HEIGHT_PX + 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <line x1="${x2 + CARD_WIDTH_PX + 34}" y1="${y - 34}" x2="${x2 + CARD_WIDTH_PX + 34}" y2="${y + CARD_HEIGHT_PX + 34}" stroke="${guideColor}" stroke-width="2" stroke-dasharray="18 16"/>
    <image href="${imageHref(first)}" x="${x1}" y="${y}" width="${CARD_WIDTH_PX}" height="${CARD_HEIGHT_PX}" preserveAspectRatio="xMidYMid meet"/>
    <image href="${imageHref(second)}" x="${x2}" y="${y}" width="${CARD_WIDTH_PX}" height="${CARD_HEIGHT_PX}" preserveAspectRatio="xMidYMid meet"/>
  </svg>`;
}

function getListingDescription(): string {
  return [
    "A polished printable baby shower games bundle in a warm neutral style. This instant download is built as a complete party kit, not a single worksheet, so the host can print a cohesive set of games, signs, keepsakes, answer keys, and simple party tools.",
    "WHAT IS INCLUDED",
    "- 18 real printable card pages",
    "- 5x7 card PDF",
    "- US Letter 2-up PDF",
    "- A4 2-up PDF",
    "- Complete ZIP bundle",
    "- How-to-print instructions",
    "- Personal-use license",
    "INSIDE THE BUNDLE",
    "- Host Guide",
    "- Baby Bingo",
    "- Predictions & Advice",
    "- Wishes For Baby",
    "- Baby Word Scramble",
    "- Word Scramble Answer Key",
    "- Baby Name Race",
    "- Baby Shower Trivia",
    "- Trivia Answer Key",
    "- Guess The Price",
    "- What's In Your Bag?",
    "- Parent-To-Be Quiz",
    "- Don't Say Baby sign",
    "- Diaper Raffle sign",
    "- Diaper Raffle Tickets",
    "- Late Night Diaper Notes",
    "- Gift Log",
    "- Thank You Address Cards",
    "HOW IT WORKS",
    "Purchase this listing, download the files from Etsy, open the PDF size you prefer, print, cut if needed, and set the cards out with pens. No app, login, or design software is required.",
    "STYLE",
    "The design uses a clean neutral palette with sage, clay, ivory, soft blush, and simple typography so the bundle feels modern, calm, and easy to use at a baby shower table.",
    "IMPORTANT",
    "This is a digital download. No physical product will be shipped. Colors may vary slightly by monitor, printer, ink, and paper. For personal baby shower or event use only.",
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
  const cardPngs: Buffer[] = [];
  for (const [index, card] of CARDS.entries()) {
    const png = rasterizeSvgToPng(renderCardSvg(card));
    cardPngs.push(png);
    technicalIssues.push(
      ...(await checkImageTechnical({
        buffer: png,
        expectedWidthIn: CARD_WIDTH_IN,
        expectedHeightIn: CARD_HEIGHT_IN,
        label: `5x7 card ${String(index + 1).padStart(2, "0")} ${card.title}`,
      })),
    );
  }

  const cardsPdf = await buildPdf(cardPngs.map((png) => ({ pngBuffer: png, widthIn: CARD_WIDTH_IN, heightIn: CARD_HEIGHT_IN })));
  technicalIssues.push(...(await checkPdfValidity(cardsPdf, "5x7 cards PDF")));

  const twoUpPdfs = new Map<PrintSize["id"], Buffer>();
  for (const size of PRINT_SIZES) {
    const pages: Buffer[] = [];
    for (let index = 0; index < cardPngs.length; index += 2) {
      const first = cardPngs[index];
      const second = cardPngs[index + 1];
      if (!first || !second) throw new Error("Expected an even number of card pages for 2-up printing.");
      const pagePng = rasterizeSvgToPng(renderTwoUpSvg(size, first, second));
      pages.push(pagePng);
      technicalIssues.push(
        ...(await checkImageTechnical({
          buffer: pagePng,
          expectedWidthIn: size.widthIn,
          expectedHeightIn: size.heightIn,
          label: `${size.label} page ${String(index / 2 + 1).padStart(2, "0")}`,
        })),
      );
    }
    const pdf = await buildPdf(pages.map((png) => ({ pngBuffer: png, widthIn: size.widthIn, heightIn: size.heightIn })));
    twoUpPdfs.set(size.id, pdf);
    technicalIssues.push(...(await checkPdfValidity(pdf, `${size.label} PDF`)));
  }

  const letterPdf = twoUpPdfs.get("letter-2up");
  const a4Pdf = twoUpPdfs.get("a4-2up");
  if (!letterPdf || !a4Pdf) throw new Error("2-up PDF build failed.");

  const instructions = `HOW TO PRINT
${PRODUCT_TITLE}

Files included:
- 5x7 card PDF: one card per page
- US Letter 2-up PDF: two 5x7 cards per landscape page
- A4 2-up PDF: two 5x7 cards per landscape page

Printing steps:
1. Open the PDF size that matches your printer.
2. Print at actual size or 100 percent scale.
3. Use white cardstock or heavyweight matte paper for a premium feel.
4. Cut along the outside of each 5x7 card if using the 2-up files.
5. Set out the cards with pens before guests arrive.

This is a digital product. No physical item will be shipped.
`;
  const license = buildLicenseText(PRODUCT_TITLE, BRAND_NAME);
  const zip = await buildZip([
    { filename: `${PRODUCT_SLUG}-5x7-cards.pdf`, data: cardsPdf },
    { filename: `${PRODUCT_SLUG}-letter-2up.pdf`, data: letterPdf },
    { filename: `${PRODUCT_SLUG}-a4-2up.pdf`, data: a4Pdf },
    { filename: "how-to-print.txt", data: Buffer.from(instructions, "utf8") },
    { filename: "license.txt", data: Buffer.from(license, "utf8") },
  ]);
  technicalIssues.push(...(await checkZipValidity(zip, "complete ZIP bundle")));

  const files = [
    { name: `${PRODUCT_SLUG}-5x7-cards.pdf`, buffer: cardsPdf },
    { name: `${PRODUCT_SLUG}-letter-2up.pdf`, buffer: letterPdf },
    { name: `${PRODUCT_SLUG}-a4-2up.pdf`, buffer: a4Pdf },
    { name: `${PRODUCT_SLUG}-complete-bundle.zip`, buffer: zip },
  ];
  for (const file of files) {
    if (file.buffer.length > LISTING_LIMITS.maxDigitalFileSizeBytes) {
      throw new Error(`${file.name} is ${(file.buffer.length / 1024 / 1024).toFixed(1)} MB, above Etsy's 20 MB per-file limit.`);
    }
    await writeFile(path.join(DOWNLOAD_DIR, file.name), file.buffer);
  }

  const listingImages = renderListingImages(cardPngs);
  if (listingImages.length !== LISTING_LIMITS.maxImages) {
    throw new Error(`Expected ${LISTING_LIMITS.maxImages} listing images, got ${listingImages.length}.`);
  }
  for (const image of listingImages) {
    technicalIssues.push(...(await checkImageTechnical({ buffer: image.buffer, expectedWidthIn: 1, expectedHeightIn: 1, label: image.name })));
    await writeFile(path.join(LISTING_IMAGE_DIR, image.name), image.buffer);
  }

  const tags = [
    "baby shower games",
    "baby shower pdf",
    "printable games",
    "baby games",
    "party games pdf",
    "gender neutral",
    "baby bingo",
    "baby predictions",
    "word scramble",
    "diaper raffle",
    "shower bundle",
    "instant download",
    "neutral baby",
  ];
  const description = getListingDescription();
  const materials = ["Digital File", "PDF", "ZIP"];
  const attributes = { occasion: "Baby shower", style: "Minimalist", recipient: "Parent-to-be", color: "Neutral" };

  const textToAudit = [
    LISTING_TITLE,
    description,
    PRODUCT_TITLE,
    ...tags,
    ...materials,
    ...CARDS.flatMap((card) => [card.group, card.title, card.subtitle, ...(card.items ?? []), ...(card.fields ?? []), ...(card.answers ?? []).flatMap((answer) => [answer.prompt, answer.answer]), card.callout ?? ""]),
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
  const placeholderIssues = checkPlaceholderLeakage(textToAudit, "baby shower games bundle product copy");
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
        cardPageCount: CARDS.length,
        twoUpPageCount: cardPngs.length / 2,
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
        cardPageCount: CARDS.length,
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
