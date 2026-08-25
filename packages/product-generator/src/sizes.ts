export interface PrintSize {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
}

const DPI = 300;

/** Standard printable digital-download ratios/sizes commonly sold on Etsy. */
export const PRINT_SIZES: Record<string, PrintSize> = {
  "2x3": { id: "2x3", label: "2:3 (4x6, 8x12, 16x24)", widthIn: 8, heightIn: 12 },
  "3x4": { id: "3x4", label: "3:4 (12x16)", widthIn: 12, heightIn: 16 },
  "4x5": { id: "4x5", label: "4:5 (8x10)", widthIn: 8, heightIn: 10 },
  a_series: { id: "a_series", label: "A4", widthIn: 8.27, heightIn: 11.69 },
  "11x14": { id: "11x14", label: "11x14", widthIn: 11, heightIn: 14 },
  "18x24": { id: "18x24", label: "18x24", widthIn: 18, heightIn: 24 },
  "24x36": { id: "24x36", label: "24x36", widthIn: 24, heightIn: 36 },
};

export function pixelDimensions(size: PrintSize, dpi: number = DPI): { widthPx: number; heightPx: number } {
  return {
    widthPx: Math.round(size.widthIn * dpi),
    heightPx: Math.round(size.heightIn * dpi),
  };
}

export const PRINT_DPI = DPI;

/** Etsy listing images (cover, mockups, info slides) — square-ish, web-optimized, not print DPI. */
export const LISTING_IMAGE_SIZE = { widthPx: 2000, heightPx: 2000 };
