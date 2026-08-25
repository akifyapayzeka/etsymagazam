import { h, type SatoriNode } from "../render/element.js";
import type { Palette } from "../design/palette.js";

export interface InfoCardSpec {
  badge?: string; // small top label, e.g. "INSTANT DOWNLOAD"
  title: string;
  bullets: string[];
  palette: Palette;
}

/**
 * Generic heading + bullet-list listing image card. Reused, with different
 * copy, for several Etsy listing image roles: how-it-works, printing guide,
 * instant-download explainer, bundle overview, and general info.
 */
export function buildInfoCardNode(spec: InfoCardSpec, widthPx: number, heightPx: number): SatoriNode {
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
    spec.badge
      ? h(
          "div",
          {
            style: {
              display: "flex",
              alignSelf: "flex-start",
              backgroundColor: p.accent,
              color: p.surface,
              fontSize: `${Math.round(widthPx * 0.022)}px`,
              letterSpacing: "3px",
              padding: `${Math.round(widthPx * 0.014)}px ${Math.round(widthPx * 0.024)}px`,
              marginBottom: `${Math.round(heightPx * 0.04)}px`,
            },
          },
          spec.badge.toUpperCase(),
        )
      : null,
    h(
      "div",
      {
        style: {
          fontFamily: p.headingFont,
          fontSize: `${Math.round(widthPx * 0.065)}px`,
          color: p.ink,
          display: "flex",
          marginBottom: `${Math.round(heightPx * 0.05)}px`,
        },
      },
      spec.title,
    ),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      ...spec.bullets.map((bullet, i) =>
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "flex-start",
              marginTop: i === 0 ? "0px" : `${Math.round(heightPx * 0.025)}px`,
            },
          },
          h(
            "div",
            {
              style: {
                fontFamily: p.headingFont,
                fontSize: `${Math.round(widthPx * 0.03)}px`,
                color: p.accent,
                marginRight: `${Math.round(widthPx * 0.02)}px`,
                display: "flex",
              },
            },
            String(i + 1).padStart(2, "0"),
          ),
          h(
            "div",
            {
              style: {
                fontFamily: p.bodyFont,
                fontSize: `${Math.round(widthPx * 0.028)}px`,
                color: p.ink,
                display: "flex",
                maxWidth: `${Math.round(widthPx * 0.75)}px`,
              },
            },
            bullet,
          ),
        ),
      ),
    ),
  );
}
