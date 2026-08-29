import sharp from "sharp";
import type { Palette } from "../design/palette.js";

/**
 * Builds a simple, honest t-shirt SILHOUETTE mockup (flat generic shape, not
 * a photograph — this system has no garment photography) with the actual
 * design composited onto the chest area, so a shopper can immediately tell
 * "this is a shirt design," not a paper print. Deliberately separate from
 * buildCoverNode (packages/product-generator/src/mockup/cover.ts), which
 * mats a design on plain paper with a drop shadow — correct for printable
 * planners/signs, actively misleading for apparel.
 */
export async function buildTshirtMockupPng(
  designPngBuffer: Buffer,
  opts: { canvasSize?: number; shirtFill?: string; palette: Palette },
): Promise<Buffer> {
  const size = opts.canvasSize ?? 2000;
  const shirtFill = opts.shirtFill ?? "#EDEAE4";
  const stroke = opts.palette.accent;

  // A generic, non-branded flat t-shirt silhouette (body + two sleeves +
  // scooped neckline), drawn as basic SVG shapes — not traced from or
  // resembling any specific artist's or brand's icon set.
  const shirtSvg = `
<svg width="${size}" height="${size}" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">
  <path
    fill="${shirtFill}"
    stroke="${stroke}"
    stroke-width="4"
    stroke-linejoin="round"
    d="M 210 70
       L 260 70
       C 268 96 284 110 300 110
       C 316 110 332 96 340 70
       L 390 70
       L 470 150
       L 410 210
       L 380 180
       L 380 540
       C 380 552 372 560 360 560
       L 240 560
       C 228 560 220 552 220 540
       L 220 180
       L 190 210
       L 130 150
       Z"
  />
</svg>`.trim();

  const shirtBase = await sharp(Buffer.from(shirtSvg)).resize(size, size).png().toBuffer();

  // Fit the design into the chest area of the 600x600 viewBox shirt path
  // (roughly x:220-380, y:190-460), converted to canvas pixels, keeping
  // the design's own aspect ratio so it never distorts.
  const chestBoxPx = {
    left: Math.round((225 / 600) * size),
    top: Math.round((200 / 600) * size),
    width: Math.round((150 / 600) * size),
    height: Math.round((240 / 600) * size),
  };

  const designMeta = await sharp(designPngBuffer).metadata();
  const designAspect = (designMeta.width ?? 1) / (designMeta.height ?? 1);
  let fitW = chestBoxPx.width;
  let fitH = Math.round(fitW / designAspect);
  if (fitH > chestBoxPx.height) {
    fitH = chestBoxPx.height;
    fitW = Math.round(fitH * designAspect);
  }
  const resizedDesign = await sharp(designPngBuffer).resize(fitW, fitH, { fit: "inside" }).toBuffer();

  const left = chestBoxPx.left + Math.round((chestBoxPx.width - fitW) / 2);
  const top = chestBoxPx.top + Math.round((chestBoxPx.height - fitH) / 2);

  return sharp(shirtBase)
    .composite([{ input: resizedDesign, left, top }])
    .png()
    .toBuffer();
}
