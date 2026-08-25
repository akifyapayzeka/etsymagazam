import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Fetches a real Google Fonts file for use with satori (which only parses
 * TTF/OTF/WOFF, not WOFF2). Google Fonts serves WOFF instead of WOFF2 to
 * legacy user agents, so we spoof one — the same trick used throughout the
 * satori/@vercel/og ecosystem. Results are cached on disk so repeated
 * generations (and test runs) don't re-fetch the network every time.
 */
const LEGACY_USER_AGENT = "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko";
const CACHE_DIR = path.join(process.cwd(), ".font-cache");

export interface LoadedFont {
  name: string;
  data: Buffer;
  weight: number;
  style: "normal" | "italic";
}

export async function loadGoogleFont(
  family: string,
  weight: number,
  style: "normal" | "italic" = "normal",
): Promise<LoadedFont> {
  const cacheKey = `${family.replace(/\s+/g, "-")}-${weight}-${style}.woff`;
  const cachePath = path.join(CACHE_DIR, cacheKey);

  if (existsSync(cachePath)) {
    return { name: family, data: await readFile(cachePath), weight, style };
  }

  const italParam = style === "italic" ? "1" : "0";
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:ital,wght@${italParam},${weight}&display=swap`;
  const css = await fetch(cssUrl, { headers: { "User-Agent": LEGACY_USER_AGENT } }).then((r) => {
    if (!r.ok) throw new Error(`Google Fonts CSS request failed for ${family}@${weight}: ${r.status}`);
    return r.text();
  });

  const match = css.match(/src:\s*url\(([^)]+)\)\s*format\('woff'\)/);
  if (!match) {
    throw new Error(`Could not find a WOFF source in Google Fonts CSS for ${family}@${weight} ${style}`);
  }
  const fontUrl = match[1] as string;
  const arrayBuffer = await fetch(fontUrl).then((r) => r.arrayBuffer());
  const fontBuffer = Buffer.from(new Uint8Array(arrayBuffer));

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, fontBuffer);

  return { name: family, data: fontBuffer, weight, style };
}

/** The default type family used across templates: a display serif for headlines, a clean sans for body copy. */
export async function loadDefaultTypeFamily(): Promise<LoadedFont[]> {
  return Promise.all([
    loadGoogleFont("Playfair Display", 700),
    loadGoogleFont("Playfair Display", 400),
    loadGoogleFont("Cormorant Garamond", 400),
    loadGoogleFont("Cormorant Garamond", 600),
    loadGoogleFont("Jost", 400),
    loadGoogleFont("Jost", 500),
    loadGoogleFont("Jost", 700),
  ]);
}
