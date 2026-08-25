import { h, type SatoriNode } from "../render/element.js";
import type { Palette } from "../design/palette.js";

export interface ChecklistSpec {
  /**
   * Keep this short enough to fit one line at this template's large title
   * size (~7.5% of page width), or break it yourself with an explicit
   * `\n` at a sensible point. Satori's automatic word-wrap for this title
   * does not reserve correct height for the wrapped line — the next
   * sibling (subtitle/items) renders overlapping the second line. An
   * explicit `\n` (as buildPosterNode's title already relies on) lays out
   * correctly; letting a long title auto-wrap does not. Discovered via a
   * real product build — see scripts/build-first-listing.ts.
   */
  title: string;
  subtitle?: string;
  items: string[];
  palette: Palette;
  showCheckbox?: boolean;
}

/** A title + checkbox list layout — the deterministic base template for checklists, planners, and worksheets. */
export function buildChecklistNode(spec: ChecklistSpec, widthPx: number, heightPx: number): SatoriNode {
  const p = spec.palette;
  const pad = Math.round(widthPx * 0.08);
  const showCheckbox = spec.showCheckbox ?? true;

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
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
          fontFamily: p.headingFont,
          fontSize: `${Math.round(widthPx * 0.075)}px`,
          lineHeight: 1.15,
          color: p.ink,
          display: "flex",
          flexShrink: 0,
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
              fontSize: `${Math.round(widthPx * 0.026)}px`,
              lineHeight: 1.3,
              color: p.inkMuted,
              marginTop: `${Math.round(heightPx * 0.012)}px`,
              display: "flex",
              flexShrink: 0,
            },
          },
          spec.subtitle,
        )
      : null,
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          marginTop: `${Math.round(heightPx * 0.045)}px`,
          borderTop: `2px solid ${p.accent}`,
        },
      },
      ...spec.items.map((item) =>
        h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              flexShrink: 0,
              padding: `${Math.round(heightPx * 0.018)}px 0`,
              borderBottom: `1px solid ${p.surface}`,
            },
          },
          showCheckbox
            ? h("div", {
                style: {
                  width: `${Math.round(widthPx * 0.035)}px`,
                  height: `${Math.round(widthPx * 0.035)}px`,
                  border: `${Math.round(widthPx * 0.003)}px solid ${p.accent}`,
                  marginRight: `${Math.round(widthPx * 0.03)}px`,
                  display: "flex",
                  flexShrink: 0,
                },
              })
            : null,
          h(
            "div",
            {
              style: {
                fontFamily: p.bodyFont,
                fontSize: `${Math.round(widthPx * 0.026)}px`,
                color: p.ink,
                display: "flex",
              },
            },
            item,
          ),
        ),
      ),
    ),
  );
}
