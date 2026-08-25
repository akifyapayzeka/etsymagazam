import { h, type SatoriNode } from "../render/element.js";
import type { Palette } from "../design/palette.js";

export interface ChecklistSpec {
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
          color: p.ink,
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
              fontSize: `${Math.round(widthPx * 0.026)}px`,
              color: p.inkMuted,
              marginTop: `${Math.round(heightPx * 0.012)}px`,
              display: "flex",
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
