import { h, type SatoriNode } from "../render/element.js";
import type { Palette } from "../design/palette.js";

export interface CoverSpec {
  designPngBase64: string; // the already-rendered design (poster/checklist) as base64 PNG
  designAspect: number; // widthPx / heightPx of the source design
  badge: string; // e.g. "INSTANT DOWNLOAD" or "PRINTABLE BUNDLE"
  palette: Palette;
}

/**
 * Composes a listing "cover" or "mockup" image: the rendered design shown
 * on a matted background with a small corner badge. This is the primary
 * click-through-rate driver, so it stays clean and high-contrast.
 */
export function buildCoverNode(spec: CoverSpec, widthPx: number, heightPx: number): SatoriNode {
  const p = spec.palette;
  const matPad = Math.round(widthPx * 0.08);
  const availW = widthPx - matPad * 2;
  const availH = heightPx - matPad * 2 - Math.round(heightPx * 0.1);

  let imgW = availW;
  let imgH = Math.round(imgW / spec.designAspect);
  if (imgH > availH) {
    imgH = availH;
    imgW = Math.round(imgH * spec.designAspect);
  }

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        backgroundColor: p.surface,
        padding: `${matPad}px`,
        fontFamily: p.bodyFont,
      },
    },
    h("img", {
      src: `data:image/png;base64,${spec.designPngBase64}`,
      width: imgW,
      height: imgH,
      style: {
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        display: "flex",
      },
    }),
    h(
      "div",
      {
        style: {
          display: "flex",
          marginTop: `${Math.round(heightPx * 0.045)}px`,
          backgroundColor: p.accent,
          color: p.surface,
          fontSize: `${Math.round(widthPx * 0.026)}px`,
          letterSpacing: "4px",
          padding: `${Math.round(widthPx * 0.016)}px ${Math.round(widthPx * 0.03)}px`,
        },
      },
      spec.badge.toUpperCase(),
    ),
  );
}
