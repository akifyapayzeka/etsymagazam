import sharp from "sharp";
import { isValidPdf } from "@etsymagazam/product-generator";
import { isValidZip } from "@etsymagazam/product-generator";
import type { QaIssue } from "./types.js";

export const MIN_PRINT_DPI = 300;
export const ASPECT_RATIO_TOLERANCE = 0.02; // 2%

export interface ImageTechnicalCheckInput {
  buffer: Buffer;
  expectedWidthIn: number;
  expectedHeightIn: number;
  label: string;
}

export async function checkImageTechnical(input: ImageTechnicalCheckInput): Promise<QaIssue[]> {
  const issues: QaIssue[] = [];
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input.buffer).metadata();
  } catch {
    return [{ code: "IMAGE_CORRUPT", severity: "error", message: `${input.label}: file could not be read as an image.`, location: input.label }];
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    issues.push({ code: "IMAGE_NO_DIMENSIONS", severity: "error", message: `${input.label}: image has no readable dimensions.`, location: input.label });
    return issues;
  }

  const dpiWidth = width / input.expectedWidthIn;
  const dpiHeight = height / input.expectedHeightIn;
  const effectiveDpi = Math.min(dpiWidth, dpiHeight);
  if (effectiveDpi < MIN_PRINT_DPI) {
    issues.push({
      code: "LOW_DPI",
      severity: "error",
      message: `${input.label}: effective print resolution is ~${Math.round(effectiveDpi)} DPI, below the ${MIN_PRINT_DPI} DPI minimum.`,
      location: input.label,
    });
  }

  const expectedAspect = input.expectedWidthIn / input.expectedHeightIn;
  const actualAspect = width / height;
  const aspectDelta = Math.abs(actualAspect - expectedAspect) / expectedAspect;
  if (aspectDelta > ASPECT_RATIO_TOLERANCE) {
    issues.push({
      code: "ASPECT_RATIO_MISMATCH",
      severity: "warning",
      message: `${input.label}: aspect ratio ${actualAspect.toFixed(3)} deviates from expected ${expectedAspect.toFixed(3)} by ${(aspectDelta * 100).toFixed(1)}%.`,
      location: input.label,
    });
  }

  const contrastIssue = await checkContrast(input.buffer, input.label);
  if (contrastIssue) issues.push(contrastIssue);

  return issues;
}

/** Cheap-but-real contrast heuristic: flags designs whose overall luminance variance is very low (likely low legibility). */
async function checkContrast(buffer: Buffer, label: string): Promise<QaIssue | null> {
  const stats = await sharp(buffer).grayscale().stats();
  const channel = stats.channels[0];
  if (!channel) return null;
  if (channel.stdev < 18) {
    return {
      code: "LOW_CONTRAST",
      severity: "warning",
      message: `${label}: low tonal variance (stdev ${channel.stdev.toFixed(1)}) — text may be hard to read against the background.`,
      location: label,
    };
  }
  return null;
}

export async function checkPdfValidity(buffer: Buffer, label: string): Promise<QaIssue[]> {
  const valid = await isValidPdf(buffer);
  return valid ? [] : [{ code: "PDF_CORRUPT", severity: "error", message: `${label}: PDF failed to parse/open.`, location: label }];
}

export async function checkZipValidity(buffer: Buffer, label: string): Promise<QaIssue[]> {
  const valid = await isValidZip(buffer);
  return valid ? [] : [{ code: "ZIP_CORRUPT", severity: "error", message: `${label}: ZIP failed to parse/open.`, location: label }];
}

export function checkSvgValidity(svgText: string, label: string): QaIssue[] {
  const trimmed = svgText.trim();
  if (!trimmed.startsWith("<svg") && !trimmed.startsWith("<?xml")) {
    return [{ code: "SVG_INVALID", severity: "error", message: `${label}: does not look like a valid SVG document.`, location: label }];
  }
  if (!trimmed.includes("</svg>")) {
    return [{ code: "SVG_INVALID", severity: "error", message: `${label}: missing closing </svg> tag.`, location: label }];
  }
  return [];
}

const PLACEHOLDER_MARKERS = [
  /lorem ipsum/i,
  /\bjohn doe\b/i,
  /\bjane doe\b/i,
  /\bsample text\b/i,
  /\btodo\b/i,
  /\btbd\b/i,
  /\bxxxx+\b/i,
  /\bplaceholder\b/i,
  /\[insert /i,
];

/** Scans generated text content for leftover placeholder/demo data (e.g. AI forgetting to fill in the real name/date). */
export function checkPlaceholderLeakage(text: string, label: string): QaIssue[] {
  const issues: QaIssue[] = [];
  for (const marker of PLACEHOLDER_MARKERS) {
    if (marker.test(text)) {
      issues.push({
        code: "PLACEHOLDER_TEXT_FOUND",
        severity: "error",
        message: `${label}: appears to contain leftover placeholder/demo text (matched ${marker}).`,
        location: label,
      });
    }
  }
  return issues;
}
