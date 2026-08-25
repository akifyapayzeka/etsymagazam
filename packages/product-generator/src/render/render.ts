import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { LoadedFont } from "../fonts.js";
import type { SatoriNode } from "./element.js";

export interface RenderOptions {
  widthPx: number;
  heightPx: number;
  fonts: LoadedFont[];
}

/** Renders a layout tree to an SVG string at exact pixel dimensions — this is the deterministic layout/typography step. */
export async function renderToSvg(node: SatoriNode, opts: RenderOptions): Promise<string> {
  return satori(node as unknown as Parameters<typeof satori>[0], {
    width: opts.widthPx,
    height: opts.heightPx,
    fonts: opts.fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight as never, style: f.style })),
  });
}

/** Rasterizes an SVG string to a PNG buffer at 1:1 pixel scale (satori already lays out at target resolution). */
export function rasterizeSvgToPng(svg: string): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "original" } });
  const rendered = resvg.render();
  return rendered.asPng();
}

/** Convenience: render a node tree straight to a print-ready PNG buffer. */
export async function renderToPng(node: SatoriNode, opts: RenderOptions): Promise<Buffer> {
  const svg = await renderToSvg(node, opts);
  return rasterizeSvgToPng(svg);
}
