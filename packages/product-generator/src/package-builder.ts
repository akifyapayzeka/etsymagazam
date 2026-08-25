import type { Storage } from "@etsymagazam/core";
import { resolvePalette, type Palette } from "./design/palette.js";
import { loadDefaultTypeFamily, type LoadedFont } from "./fonts.js";
import { buildLicenseText } from "./license.js";
import { buildCoverNode } from "./mockup/cover.js";
import { buildInfoCardNode } from "./mockup/info-card.js";
import { buildSizesChartNode } from "./mockup/sizes-chart.js";
import { buildPdf } from "./render/pdf.js";
import { rasterizeSvgToPng, renderToPng, renderToSvg } from "./render/render.js";
import { buildZip } from "./render/zip.js";
import { LISTING_IMAGE_SIZE, PRINT_SIZES, pixelDimensions, type PrintSize } from "./sizes.js";
import { buildChecklistNode, type ChecklistSpec } from "./templates/checklist.js";
import { buildPosterNode, type PosterSpec } from "./templates/poster.js";

export interface ProductGenerationSpec {
  productSlug: string;
  productTitle: string;
  shopName: string;
  templateType: "poster" | "checklist";
  paletteId?: string;
  posterContent?: Omit<PosterSpec, "palette">;
  checklistContent?: Omit<ChecklistSpec, "palette">;
  sizeIds: string[];
  aiDisclosureLine?: string;
}

export interface ProductPackageManifest {
  productDir: string;
  customerFiles: { PDF: string[]; PNG: string[]; SVG: string[]; ZIP: string[] };
  listingImages: Array<{ role: string; path: string; rank: number }>;
  mockups: Array<{ role: string; path: string }>;
  instructionsPath: string;
  licensePath: string;
  metadataPath: string;
  metadata: Record<string, unknown>;
}

const LISTING_IMAGE_ROLES: Array<{ role: string; badge?: string; title: string; bullets?: string[] }> = [
  { role: "cover", badge: "Instant Download", title: "" },
  { role: "mockup", badge: "Printable Template", title: "" },
  { role: "contents", title: "What's Included" },
  { role: "sizes", title: "Sizes & Formats" },
  { role: "instant_download", title: "How Delivery Works" },
  { role: "how_it_works", title: "How It Works" },
  { role: "printing_guide", title: "Printing Guide" },
  { role: "usage_example", title: "Ways To Use This" },
  { role: "bundle_overview", title: "What You Get" },
  { role: "info", title: "Good To Know" },
];

export class ProductPackageBuilder {
  constructor(private readonly storage: Storage) {}

  async build(spec: ProductGenerationSpec): Promise<ProductPackageManifest> {
    const fonts = await loadDefaultTypeFamily();
    const palette = resolvePalette(spec.paletteId);
    const productDir = `products/${spec.productSlug}`;
    const sizes = spec.sizeIds.map((id) => {
      const size = PRINT_SIZES[id];
      if (!size) throw new Error(`Unknown print size id: ${id}`);
      return size;
    });
    if (sizes.length === 0) throw new Error("At least one print size is required.");

    const designNode = (widthPx: number, heightPx: number) =>
      spec.templateType === "poster"
        ? buildPosterNode({ ...(spec.posterContent as PosterSpec), palette }, widthPx, heightPx)
        : buildChecklistNode({ ...(spec.checklistContent as ChecklistSpec), palette }, widthPx, heightPx);

    // --- Render each requested size as PNG (and keep the largest as SVG too) ---
    const pngFiles: Array<{ size: PrintSize; buffer: Buffer }> = [];
    let largestSvg: { size: PrintSize; svg: string } | undefined;
    for (const size of sizes) {
      const { widthPx, heightPx } = pixelDimensions(size);
      const node = designNode(widthPx, heightPx);
      const svg = await renderToSvg(node, { widthPx, heightPx, fonts });
      const png = rasterizeSvgToPng(svg);
      pngFiles.push({ size, buffer: png });
      if (!largestSvg || size.widthIn * size.heightIn > largestSvg.size.widthIn * largestSvg.size.heightIn) {
        largestSvg = { size, svg };
      }
    }

    const customerFiles: ProductPackageManifest["customerFiles"] = { PDF: [], PNG: [], SVG: [], ZIP: [] };

    for (const { size, buffer } of pngFiles) {
      const relPath = `${productDir}/source/png/${spec.productSlug}-${size.id}.png`;
      await this.storage.write(relPath, buffer);
      customerFiles.PNG.push(relPath);
    }

    if (largestSvg) {
      const svgPath = `${productDir}/source/svg/${spec.productSlug}.svg`;
      await this.storage.write(svgPath, Buffer.from(largestSvg.svg, "utf8"));
      customerFiles.SVG.push(svgPath);
    }

    const combinedPdf = await buildPdf(
      pngFiles.map(({ size, buffer }) => ({ pngBuffer: buffer, widthIn: size.widthIn, heightIn: size.heightIn })),
    );
    const pdfPath = `${productDir}/customer_files/PDF/${spec.productSlug}-all-sizes.pdf`;
    await this.storage.write(pdfPath, combinedPdf);
    customerFiles.PDF.push(pdfPath);

    // --- Instructions + license (real, static, deterministic) ---
    const instructionsText = buildInstructionsText(spec.productTitle, sizes);
    const instructionsPath = `${productDir}/instructions/how-to-print.txt`;
    await this.storage.write(instructionsPath, Buffer.from(instructionsText, "utf8"));

    const licenseText = buildLicenseText(spec.productTitle, spec.shopName);
    const licensePath = `${productDir}/license.txt`;
    await this.storage.write(licensePath, Buffer.from(licenseText, "utf8"));

    // --- Customer ZIP bundle: everything a buyer needs, kept within Etsy's 5-file cap upstream ---
    const zipEntries = [
      ...pngFiles.map(({ size, buffer }) => ({ filename: `PNG/${spec.productSlug}-${size.id}.png`, data: buffer })),
      { filename: "PDF/all-sizes.pdf", data: combinedPdf },
      { filename: "instructions.txt", data: Buffer.from(instructionsText, "utf8") },
      { filename: "license.txt", data: Buffer.from(licenseText, "utf8") },
    ];
    const zipBuffer = await buildZip(zipEntries);
    const zipPath = `${productDir}/customer_files/ZIP/${spec.productSlug}-complete-bundle.zip`;
    await this.storage.write(zipPath, zipBuffer);
    customerFiles.ZIP.push(zipPath);

    // --- Listing images (mockups) ---
    const largestPng = pngFiles.reduce((a, b) =>
      a.size.widthIn * a.size.heightIn >= b.size.widthIn * b.size.heightIn ? a : b,
    );
    const designAspect = largestPng.size.widthIn / largestPng.size.heightIn;
    const designThumbBase64 = largestPng.buffer.toString("base64");

    const listingImages: ProductPackageManifest["listingImages"] = [];
    const mockups: ProductPackageManifest["mockups"] = [];

    for (const [i, roleSpec] of LISTING_IMAGE_ROLES.entries()) {
      const node = await this.buildListingImageNode(roleSpec, {
        designThumbBase64,
        designAspect,
        palette,
        sizes,
        spec,
      });
      const png = await renderToPng(node, {
        widthPx: LISTING_IMAGE_SIZE.widthPx,
        heightPx: LISTING_IMAGE_SIZE.heightPx,
        fonts,
      });
      const relPath = `${productDir}/listing_images/${String(i + 1).padStart(2, "0")}_${roleSpec.role}.png`;
      await this.storage.write(relPath, png);
      listingImages.push({ role: roleSpec.role, path: relPath, rank: i + 1 });
      if (roleSpec.role === "cover" || roleSpec.role === "mockup") {
        mockups.push({ role: roleSpec.role, path: relPath });
      }
    }

    const metadata = {
      productSlug: spec.productSlug,
      productTitle: spec.productTitle,
      templateType: spec.templateType,
      paletteId: palette.id,
      sizes: sizes.map((s) => s.id),
      generatedAt: new Date().toISOString(),
      digitalFilesForEtsy: ["ZIP", "PDF"], // policy: ship the complete ZIP + one convenience PDF, always <= 5 files regardless of size count
    };
    const metadataPath = `${productDir}/metadata.json`;
    await this.storage.write(metadataPath, Buffer.from(JSON.stringify(metadata, null, 2), "utf8"));

    return {
      productDir,
      customerFiles,
      listingImages,
      mockups,
      instructionsPath,
      licensePath,
      metadataPath,
      metadata,
    };
  }

  private async buildListingImageNode(
    roleSpec: (typeof LISTING_IMAGE_ROLES)[number],
    ctx: {
      designThumbBase64: string;
      designAspect: number;
      palette: Palette;
      sizes: PrintSize[];
      spec: ProductGenerationSpec;
    },
  ) {
    const { widthPx, heightPx } = LISTING_IMAGE_SIZE;
    if (roleSpec.role === "cover" || roleSpec.role === "mockup") {
      return buildCoverNode(
        {
          designPngBase64: ctx.designThumbBase64,
          designAspect: ctx.designAspect,
          badge: roleSpec.badge ?? "Instant Download",
          palette: ctx.palette,
        },
        widthPx,
        heightPx,
      );
    }
    if (roleSpec.role === "sizes") {
      return buildSizesChartNode(
        {
          title: "Sizes & Formats",
          sizeLabels: ctx.sizes.map((s) => `${s.widthIn}x${s.heightIn} in`),
          fileFormats: ["PDF", "PNG", "SVG (source)"],
          palette: ctx.palette,
        },
        widthPx,
        heightPx,
      );
    }
    return buildInfoCardNode(
      {
        badge: roleSpec.role === "instant_download" ? "Instant Download" : undefined,
        title: roleSpec.title,
        bullets: bulletsForRole(roleSpec.role, ctx.spec, ctx.sizes),
        palette: ctx.palette,
      },
      widthPx,
      heightPx,
    );
  }
}

function bulletsForRole(role: string, spec: ProductGenerationSpec, sizes: PrintSize[]): string[] {
  switch (role) {
    case "contents":
      return [
        "1 print-ready PDF with every size included",
        "High-resolution PNG files for each size",
        "1 editable-source SVG file",
        "Printing instructions + personal use license",
      ];
    case "instant_download":
      return [
        "Your files are delivered instantly after checkout — no waiting.",
        "Download from Etsy's 'Purchases and Reviews' page.",
        "No physical item will be shipped.",
      ];
    case "how_it_works":
      return [
        "Purchase this listing and check out.",
        "Download your files from Etsy (desktop recommended for the ZIP).",
        "Print at home or send to a local/online print shop.",
      ];
    case "printing_guide":
      return [
        "For best results, print on matte or lightly textured cardstock.",
        "Use 'Actual Size' / 100% scale — do not use 'Fit to Page'.",
        `Included sizes: ${sizes.map((s) => `${s.widthIn}x${s.heightIn}in`).join(", ")}.`,
      ];
    case "usage_example":
      return [
        "Frame it as-is for an instant, budget-friendly piece of decor.",
        "Print at a larger size for a bigger statement piece.",
        "A thoughtful, personal gift when paired with a nice frame.",
      ];
    case "bundle_overview":
      return [
        `${spec.productTitle} includes everything shown in this listing.`,
        "Matching pieces from the same design family may be available in our shop.",
        "Check the shop section for coordinating items.",
      ];
    case "info":
    default:
      return [
        "This is a digital product for personal use — see included license.txt.",
        "Colors may vary slightly depending on your screen and printer.",
        spec.aiDisclosureLine ?? "Designed using a mix of custom design tools and AI-assisted image generation.",
      ];
  }
}

function buildInstructionsText(productTitle: string, sizes: PrintSize[]): string {
  return `HOW TO PRINT — ${productTitle}

1. Unzip the download and open the PDF (or the PNG for your chosen size).
2. Print at "Actual Size" / 100% scale — NOT "Fit to Page" — to keep the
   correct proportions.
3. Included sizes: ${sizes.map((s) => `${s.widthIn}x${s.heightIn} in`).join(", ")}.
4. For the sharpest print, use a local print shop or a home printer set to
   its highest quality / photo setting on matte or lightly textured paper.

This is a digital product. No physical item will be mailed to you.
`;
}
