import { describe, expect, it } from "vitest";
import { resolvePalette } from "../design/palette.js";
import { loadDefaultTypeFamily } from "../fonts.js";
import { rasterizeSvgToPng, renderToSvg } from "../render/render.js";
import { pixelDimensions, PRINT_SIZES } from "../sizes.js";
import { buildChecklistNode } from "./checklist.js";

/**
 * Regression test for a real bug found building the first Form & Fern
 * product: a checklist page with a long (2-line) title and a full list of
 * items would either render the title overlapping the subtitle/first item,
 * or crash the native resvg rasterizer outright, because the title/
 * subtitle/item rows had no `flexShrink: 0` — when total content height
 * exceeded the page's fixed pixel height, satori's default flex-shrink
 * compressed their allocated box height without compressing their actual
 * (wrapped) text, corrupting the layout. See scripts/build-first-listing.ts
 * for the real-world repro.
 */
describe("buildChecklistNode overflow safety", () => {
  it("never lets the title, subtitle, or item rows shrink (the actual fix)", () => {
    const palette = resolvePalette("sage");
    const node = buildChecklistNode(
      { title: "A Two Line\nTitle Here", subtitle: "A subtitle", items: ["one", "two", "three"], palette },
      2550,
      3300,
    );

    const children = node.props.children as Array<{
      props: { style?: Record<string, unknown>; children?: unknown };
    }>;
    const [titleNode, subtitleNode, itemsContainerNode] = children;
    if (!titleNode || !subtitleNode || !itemsContainerNode) {
      throw new Error("Expected buildChecklistNode to return title, subtitle, and items container children.");
    }

    expect(titleNode.props.style?.flexShrink).toBe(0);
    expect(subtitleNode.props.style?.flexShrink).toBe(0);
    expect(itemsContainerNode.props.style?.flexShrink).toBe(0);

    const itemRows = itemsContainerNode.props.children as Array<{ props: { style?: Record<string, unknown> } }>;
    for (const row of itemRows) {
      expect(row.props.style?.flexShrink).toBe(0);
    }
  });

  it("renders a long title + a full 9-item list at Letter size without crashing or losing content", async () => {
    const fonts = await loadDefaultTypeFamily();
    const palette = resolvePalette("sage");
    const { widthPx, heightPx } = pixelDimensions(PRINT_SIZES.letter!);

    const node = buildChecklistNode(
      {
        title: "Days 1–3: Let Them Decompress",
        subtitle: "Check off each day. Don't worry about progress yet — just safety and quiet.",
        items: [
          "Quiet space set up: bed, water, and a low-traffic spot to retreat to",
          "Leash on for every outdoor bathroom break (even in a fenced yard)",
          "No visitors, parties, or dog park trips this week",
          "Offered food in a calm, low-pressure spot — no pressure to eat right away",
          "Let them choose where to rest — did not force cuddles or attention",
          "Kept walks short and low-stimulation, away from busy areas",
          "Noticed today's appetite and sleep: normal, restless, or hiding",
          "Noted any triggers seen today (loud noises, strangers, other pets, etc.)",
          "Gave them permission to just be a dog — no training pressure yet",
        ],
        palette,
      },
      widthPx,
      heightPx,
    );

    const svg = await renderToSvg(node, { widthPx, heightPx, fonts });
    // Satori renders text as vector glyph paths, not literal strings, so we
    // can't substring-match the copy — but each laid-out region (title,
    // subtitle, each checkbox + each item's text) gets its own clip mask.
    // A page that silently lost items to overflow would produce far fewer
    // of these than a page that rendered all 9 items in full.
    const maskCount = (svg.match(/<mask id="satori_om-id/g) ?? []).length;
    expect(maskCount).toBeGreaterThanOrEqual(20);

    // Must not throw (this is exactly what crashed native resvg before the fix).
    const png = rasterizeSvgToPng(svg);
    expect(png.length).toBeGreaterThan(0);
  }, 30_000);
});
