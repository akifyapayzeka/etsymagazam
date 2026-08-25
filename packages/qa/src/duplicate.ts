import sharp from "sharp";

/**
 * Perceptual difference-hash (dHash): downsizes to 9x8 grayscale and encodes
 * whether each pixel is brighter than its right neighbor as one bit,
 * producing a 64-bit hash that's stable under resizing/re-encoding but
 * changes meaningfully when the actual image content changes. Used to catch
 * the AI churning out near-identical designs.
 */
export async function computeImageHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = "";
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col] ?? 0;
      const right = data[row * 9 + col + 1] ?? 0;
      bits += left < right ? "1" : "0";
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
}

export function hammingDistance(hashA: string, hashB: string): number {
  let xor = BigInt(`0x${hashA}`) ^ BigInt(`0x${hashB}`);
  let count = 0;
  while (xor > 0n) {
    count += Number(xor & 1n);
    xor >>= 1n;
  }
  return count;
}

/** Out of 64 bits; <=10 is a widely-used "very likely the same/near-identical image" threshold for dHash. */
export const DEFAULT_DUPLICATE_HAMMING_THRESHOLD = 10;

export function isDuplicate(distance: number, threshold: number = DEFAULT_DUPLICATE_HAMMING_THRESHOLD): boolean {
  return distance <= threshold;
}

/** Finds the closest existing hash to `hash`, if any is within threshold. */
export function findClosestDuplicate(
  hash: string,
  existingHashes: Array<{ id: string; hash: string }>,
  threshold: number = DEFAULT_DUPLICATE_HAMMING_THRESHOLD,
): { id: string; distance: number } | undefined {
  let closest: { id: string; distance: number } | undefined;
  for (const existing of existingHashes) {
    const distance = hammingDistance(hash, existing.hash);
    if (distance <= threshold && (!closest || distance < closest.distance)) {
      closest = { id: existing.id, distance };
    }
  }
  return closest;
}
