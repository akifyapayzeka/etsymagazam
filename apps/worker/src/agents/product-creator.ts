import { createLogger, getStorage } from "@etsymagazam/core";
import { prisma, type ProductVersion } from "@etsymagazam/database";
import { ProductPackageBuilder } from "@etsymagazam/product-generator";
import { computeImageHash } from "@etsymagazam/qa";
import type { ProductConcept } from "./product-strategy.js";

const log = createLogger("product-creator-agent");

function slugify(title: string, suffix: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base}-${suffix}`;
}

/** Renders the actual customer files + listing images for a product concept and persists a ProductVersion. */
export async function createProductVersion(
  product: { id: string; slug: string; title: string },
  concept: ProductConcept,
  brandName: string,
): Promise<ProductVersion> {
  const builder = new ProductPackageBuilder(getStorage());

  const nextVersionNumber = ((await prisma.productVersion.count({ where: { productId: product.id } })) ?? 0) + 1;

  const manifest = await builder.build({
    productSlug: `${product.slug}-v${nextVersionNumber}`,
    productTitle: concept.title,
    brandName,
    templateType: concept.templateType,
    paletteId: concept.suggestedPaletteId,
    posterContent:
      concept.templateType === "poster"
        ? {
            eyebrow: concept.eyebrow ?? undefined,
            title: concept.title,
            subtitle: concept.subtitle ?? undefined,
            bodyLines: concept.bodyLines,
            footer: concept.footer ?? undefined,
          }
        : undefined,
    checklistContent:
      concept.templateType === "checklist"
        ? {
            title: concept.title,
            subtitle: concept.subtitle ?? undefined,
            items: concept.items && concept.items.length > 0 ? concept.items : concept.bodyLines,
          }
        : undefined,
    sizeIds: concept.suggestedSizes,
  });

  const storage = getStorage();
  const coverPath = manifest.listingImages.find((i) => i.role === "cover")?.path;
  const coverImageHash = coverPath ? await computeImageHash(await storage.read(coverPath)) : null;

  const version = await prisma.productVersion.create({
    data: {
      productId: product.id,
      versionNumber: nextVersionNumber,
      sourceDir: manifest.productDir,
      customerFiles: manifest.customerFiles as unknown as object,
      listingImages: manifest.listingImages as unknown as object,
      mockups: manifest.mockups as unknown as object,
      metadataJson: { ...manifest.metadata, coverImageHash } as object,
      licenseText: await storage.read(manifest.licensePath).then((b) => b.toString("utf8")),
    },
  });

  await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });

  log.info({ productId: product.id, versionId: version.id }, "Generated product version");
  return version;
}

export { slugify };
