import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isValidPdf } from "./render/pdf.js";
import { isValidZip } from "./render/zip.js";
import { ProductPackageBuilder, type ProductPackageManifest } from "./package-builder.js";
import type { Storage } from "@etsymagazam/core";

class TestLocalStorage implements Storage {
  constructor(private readonly root: string) {}
  async write(relativePath: string, data: Buffer): Promise<string> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const full = path.join(this.root, relativePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return relativePath;
  }
  async read(relativePath: string): Promise<Buffer> {
    const { readFile } = await import("node:fs/promises");
    return readFile(path.join(this.root, relativePath));
  }
  async resolveUrl(relativePath: string): Promise<string> {
    return path.join(this.root, relativePath);
  }
}

describe("ProductPackageBuilder (end-to-end, real rendering)", () => {
  let tmpDir: string;
  let manifest: ProductPackageManifest;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "etsy-autopilot-test-"));
    const storage = new TestLocalStorage(tmpDir);
    const builder = new ProductPackageBuilder(storage);
    manifest = await builder.build({
      productSlug: "wildflower-wedding-welcome-sign",
      productTitle: "Wildflower Wedding Welcome Sign",
      brandName: "Test Shop",
      templateType: "poster",
      paletteId: "wildflower",
      posterContent: {
        eyebrow: "Welcome to the wedding of",
        title: "Sarah & James",
        subtitle: "June 14, 2026 · Willow Creek Barn",
        bodyLines: ["Please sign our guestbook", "and join us for the celebration"],
        footer: "With love",
      },
      sizeIds: ["2x3", "4x5"],
    });
  }, 60_000);

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("produces PNG, PDF, SVG, and ZIP customer files", () => {
    expect(manifest.customerFiles.PNG.length).toBe(2);
    expect(manifest.customerFiles.PDF.length).toBe(1);
    expect(manifest.customerFiles.SVG.length).toBe(1);
    expect(manifest.customerFiles.ZIP.length).toBe(1);
  });

  it("produces exactly 10 listing images in a stable role order", () => {
    expect(manifest.listingImages).toHaveLength(10);
    expect(manifest.listingImages[0]?.role).toBe("cover");
    expect(manifest.listingImages.at(-1)?.role).toBe("info");
  });

  it("generates a structurally valid PDF", async () => {
    const storage = new TestLocalStorage(tmpDir);
    const pdfBuffer = await storage.read(manifest.customerFiles.PDF[0] as string);
    expect(await isValidPdf(pdfBuffer)).toBe(true);
  });

  it("generates a structurally valid ZIP containing the expected entries", async () => {
    const storage = new TestLocalStorage(tmpDir);
    const zipBuffer = await storage.read(manifest.customerFiles.ZIP[0] as string);
    expect(await isValidZip(zipBuffer)).toBe(true);
  });

  it("plans Etsy digital file delivery within the 5-file limit regardless of size count", () => {
    expect((manifest.metadata.digitalFilesForEtsy as string[]).length).toBeLessThanOrEqual(5);
  });
});
