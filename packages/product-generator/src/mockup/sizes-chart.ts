import { h, type SatoriNode } from "../render/element.js";
import type { Palette } from "../design/palette.js";

export interface SizesChartSpec {
  title: string;
  sizeLabels: string[]; // e.g. ["8x10 in", "11x14 in", "16x20 in", "A4", "24x36 in"]
  fileFormats: string[]; // e.g. ["PDF", "PNG", "JPG"]
  palette: Palette;
}

export function buildSizesChartNode(spec: SizesChartSpec, widthPx: number, heightPx: number): SatoriNode {
  const p = spec.palette;
  const pad = Math.round(widthPx * 0.09);

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        backgroundColor: p.surface,
        padding: `${pad}px`,
        fontFamily: p.bodyFont,
      },
    },
    h(
      "div",
      {
        style: {
          fontFamily: p.headingFont,
          fontSize: `${Math.round(widthPx * 0.06)}px`,
          color: p.ink,
          display: "flex",
          marginBottom: `${Math.round(heightPx * 0.05)}px`,
        },
      },
      spec.title,
    ),
    h(
      "div",
      {
        style: {
          fontFamily: p.bodyFont,
          fontSize: `${Math.round(widthPx * 0.024)}px`,
          color: p.inkMuted,
          letterSpacing: "2px",
          textTransform: "uppercase",
          display: "flex",
          marginBottom: `${Math.round(heightPx * 0.02)}px`,
        },
      },
      "Included sizes",
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "row", flexWrap: "wrap" } },
      ...spec.sizeLabels.map((label) =>
        h(
          "div",
          {
            style: {
              display: "flex",
              border: `${Math.round(widthPx * 0.003)}px solid ${p.accent}`,
              color: p.ink,
              fontSize: `${Math.round(widthPx * 0.026)}px`,
              padding: `${Math.round(widthPx * 0.016)}px ${Math.round(widthPx * 0.024)}px`,
              marginRight: `${Math.round(widthPx * 0.016)}px`,
              marginBottom: `${Math.round(widthPx * 0.016)}px`,
            },
          },
          label,
        ),
      ),
    ),
    h(
      "div",
      {
        style: {
          fontFamily: p.bodyFont,
          fontSize: `${Math.round(widthPx * 0.024)}px`,
          color: p.inkMuted,
          letterSpacing: "2px",
          textTransform: "uppercase",
          display: "flex",
          marginTop: `${Math.round(heightPx * 0.05)}px`,
          marginBottom: `${Math.round(heightPx * 0.02)}px`,
        },
      },
      "File formats",
    ),
    h(
      "div",
      {
        style: {
          fontFamily: p.headingFont,
          fontSize: `${Math.round(widthPx * 0.04)}px`,
          color: p.accent,
          display: "flex",
        },
      },
      spec.fileFormats.join("  ·  "),
    ),
  );
}
