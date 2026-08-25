import { PDFDocument } from "pdf-lib";

export interface PdfPageSpec {
  pngBuffer: Buffer;
  widthIn: number;
  heightIn: number;
}

const POINTS_PER_INCH = 72;

/** Assembles one or more print-ready PNG pages into a single print-safe PDF (physical page size derived from inches, not pixels). */
export async function buildPdf(pages: PdfPageSpec[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  for (const page of pages) {
    const img = await pdfDoc.embedPng(page.pngBuffer);
    const widthPt = page.widthIn * POINTS_PER_INCH;
    const heightPt = page.heightIn * POINTS_PER_INCH;
    const pdfPage = pdfDoc.addPage([widthPt, heightPt]);
    pdfPage.drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
  }
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

/** Validates that a buffer is a structurally valid, loadable PDF (used by the QA agent). */
export async function isValidPdf(buffer: Buffer): Promise<boolean> {
  try {
    await PDFDocument.load(buffer);
    return true;
  } catch {
    return false;
  }
}
