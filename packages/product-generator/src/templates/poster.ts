import { h, type SatoriNode } from "../render/element.js";
import type { Palette } from "../design/palette.js";

export interface PosterSpec {
  eyebrow?: string; // small label above the title, e.g. "WELCOME TO THE WEDDING OF"
  title: string; // e.g. "Sarah & James"
  subtitle?: string; // e.g. "June 14, 2026 · Willow Creek Barn"
  bodyLines?: string[]; // additional lines, e.g. venue details or a short verse
  footer?: string; // small closing line
  palette: Palette;
}

/** A centered typographic poster — the deterministic base template for wedding signs, wall art, and quote prints. */
export function buildPosterNode(spec: PosterSpec, widthPx: number, heightPx: number): SatoriNode {
  const p = spec.palette;
  const pad = Math.round(widthPx * 0.1);

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
        backgroundColor: p.background,
        padding: `${pad}px`,
        fontFamily: p.bodyFont,
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          border: `${Math.round(widthPx * 0.004)}px solid ${p.accent}`,
          padding: `${Math.round(widthPx * 0.06)}px`,
        },
      },
      spec.eyebrow
        ? h(
            "div",
            {
              style: {
                fontFamily: p.bodyFont,
                fontSize: `${Math.round(widthPx * 0.028)}px`,
                letterSpacing: "8px",
                color: p.inkMuted,
                marginBottom: `${Math.round(heightPx * 0.03)}px`,
                textTransform: "uppercase",
                display: "flex",
              },
            },
            spec.eyebrow,
          )
        : null,
      h(
        "div",
        {
          style: {
            fontFamily: p.headingFont,
            fontSize: `${Math.round(widthPx * 0.13)}px`,
            color: p.ink,
            textAlign: "center",
            lineHeight: 1.1,
            display: "flex",
          },
        },
        spec.title,
      ),
      spec.subtitle
        ? h(
            "div",
            {
              style: {
                fontFamily: p.bodyFont,
                fontSize: `${Math.round(widthPx * 0.032)}px`,
                color: p.accent,
                marginTop: `${Math.round(heightPx * 0.035)}px`,
                letterSpacing: "2px",
                display: "flex",
              },
            },
            spec.subtitle,
          )
        : null,
      ...(spec.bodyLines ?? []).map((line, i) =>
        h(
          "div",
          {
            style: {
              fontFamily: p.bodyFont,
              fontSize: `${Math.round(widthPx * 0.024)}px`,
              color: p.inkMuted,
              marginTop: i === 0 ? `${Math.round(heightPx * 0.05)}px` : `${Math.round(heightPx * 0.012)}px`,
              display: "flex",
            },
          },
          line,
        ),
      ),
      spec.footer
        ? h(
            "div",
            {
              style: {
                fontFamily: p.bodyFont,
                fontSize: `${Math.round(widthPx * 0.02)}px`,
                color: p.inkMuted,
                marginTop: `${Math.round(heightPx * 0.06)}px`,
                letterSpacing: "3px",
                textTransform: "uppercase",
                display: "flex",
              },
            },
            spec.footer,
          )
        : null,
    ),
  );
}
