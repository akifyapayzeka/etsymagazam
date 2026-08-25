import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { computeImageHash, hammingDistance, isDuplicate } from "./duplicate.js";

async function solidColorPng(r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: { r, g, b } } }).png().toBuffer();
}

/** dHash compares horizontally-adjacent pixels, so test images need horizontal variation to differ meaningfully. */
function rawImage(width: number, height: number, pattern: (x: number, y: number) => number): Buffer {
  const buf = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pattern(x, y);
      const idx = (y * width + x) * 3;
      buf[idx] = v;
      buf[idx + 1] = v;
      buf[idx + 2] = v;
    }
  }
  return buf;
}

async function stripedPng(stripeWidth: number): Promise<Buffer> {
  const raw = rawImage(200, 200, (x) => (Math.floor(x / stripeWidth) % 2 === 0 ? 20 : 230));
  return sharp(raw, { raw: { width: 200, height: 200, channels: 3 } }).png().toBuffer();
}

describe("perceptual duplicate detection", () => {
  it("gives identical images a hamming distance of 0", async () => {
    const buf = await solidColorPng(240, 100, 50);
    const hashA = await computeImageHash(buf);
    const hashB = await computeImageHash(buf);
    expect(hammingDistance(hashA, hashB)).toBe(0);
    expect(isDuplicate(hammingDistance(hashA, hashB))).toBe(true);
  });

  it("flags a near-identical re-encoded image as a duplicate", async () => {
    const buf = await solidColorPng(30, 30, 30);
    const hashA = await computeImageHash(buf);
    const rehashed = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
    const hashB = await computeImageHash(rehashed);
    expect(isDuplicate(hammingDistance(hashA, hashB))).toBe(true);
  });

  it("does not flag visually distinct images as duplicates", async () => {
    const bufA = await solidColorPng(128, 128, 128); // uniform, no horizontal edges
    const bufB = await stripedPng(20); // many alternating vertical stripes
    const hashA = await computeImageHash(bufA);
    const hashB = await computeImageHash(bufB);
    expect(isDuplicate(hammingDistance(hashA, hashB))).toBe(false);
  });
});
