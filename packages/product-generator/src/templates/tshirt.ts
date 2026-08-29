import { h, type SatoriNode } from "../render/element.js";
import type { Palette } from "../design/palette.js";

export interface TshirtDesignSpec {
  /** Small uppercase label above the main phrase, e.g. "GROWTH TAKES TIME" — optional. */
  eyebrow?: string;
  /** The main statement — supports \n for manual line breaks. */
  phrase: string;
  /** A short line below the phrase, e.g. "est. 2020" or a tagline — optional. */
  subtitle?: string;
  /** Renders a thin decorative rule between the phrase and subtitle. Off by default. */
  showDivider?: boolean;
  palette: Palette;
}

/**
 * A borderless, transparent-background typographic design for print-on-demand
 * apparel (DTF transfer, heat press, sublimation) — deliberately NOT the
 * bordered/solid-background poster template (packages/product-generator's
 * poster.ts), since a shirt design must not print its own background as a
 * visible rectangle on the fabric. Only the text itself is opaque; every
 * other pixel is fully transparent, so the design works on any shirt color
 * the ink itself remains legible against (see IMPORTANT_INFO_LINES in the
 * build script for the "light-colored fabric" caveat this implies).
 */
export function buildTshirtDesignNode(spec: TshirtDesignSpec, widthPx: number, heightPx: number): SatoriNode {
  const p = spec.palette;
  const pad = Math.round(widthPx * 0.08);

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
        padding: `${pad}px`,
        fontFamily: p.bodyFont,
      },
    },
    spec.eyebrow
      ? h(
          "div",
          {
            style: {
              fontFamily: p.bodyFont,
              fontSize: `${Math.round(widthPx * 0.026)}px`,
              letterSpacing: "10px",
              color: p.accent,
              marginBottom: `${Math.round(heightPx * 0.035)}px`,
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
          fontSize: `${Math.round(widthPx * 0.11)}px`,
          color: p.ink,
          textAlign: "center",
          lineHeight: 1.15,
          display: "flex",
        },
      },
      spec.phrase,
    ),
    spec.showDivider
      ? h("div", {
          style: {
            width: `${Math.round(widthPx * 0.12)}px`,
            height: `${Math.round(widthPx * 0.006)}px`,
            backgroundColor: p.accent,
            marginTop: `${Math.round(heightPx * 0.03)}px`,
            marginBottom: `${Math.round(heightPx * 0.01)}px`,
            display: "flex",
          },
        })
      : null,
    spec.subtitle
      ? h(
          "div",
          {
            style: {
              fontFamily: p.bodyFont,
              fontSize: `${Math.round(widthPx * 0.028)}px`,
              color: p.accent,
              marginTop: `${Math.round(heightPx * 0.03)}px`,
              letterSpacing: "3px",
              textTransform: "uppercase",
              display: "flex",
            },
          },
          spec.subtitle,
        )
      : null,
  );
}
