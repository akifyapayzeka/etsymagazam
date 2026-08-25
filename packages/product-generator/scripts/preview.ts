import path from "node:path";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import type { Storage } from "@etsymagazam/core";
import { ProductPackageBuilder } from "../src/package-builder.js";

class LocalPreviewStorage implements Storage {
  constructor(private readonly root: string) {}
  async write(relativePath: string, data: Buffer): Promise<string> {
    const full = path.join(this.root, relativePath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return relativePath;
  }
  async read(relativePath: string): Promise<Buffer> {
    return readFile(path.join(this.root, relativePath));
  }
  async resolveUrl(relativePath: string): Promise<string> {
    return path.join(this.root, relativePath);
  }
}

const outDir = path.resolve(process.cwd(), ".preview-output");
const storage = new LocalPreviewStorage(outDir);
const builder = new ProductPackageBuilder(storage);

const manifest = await builder.build({
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

console.log(JSON.stringify(manifest, null, 2));
console.log("Output dir:", outDir);
