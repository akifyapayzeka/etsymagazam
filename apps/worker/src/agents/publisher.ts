import { createLogger, getStorage } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { LISTING_LIMITS, type CreateDraftListingInput } from "@etsymagazam/etsy";
import etsyTaxonomy from "../config/etsy-taxonomy.json" with { type: "json" };
import { getEtsyClientForShop } from "../lib/etsy-client.js";
import { recordAudit, recordDecision } from "../lib/decisions.js";
import type { SeoOutput } from "./seo.js";

const log = createLogger("publisher-agent");

export function resolveTaxonomyId(category: string): number | null {
  const map = etsyTaxonomy.categoryToTaxonomyId as Record<string, number | null>;
  return map[category] ?? null;
}

export interface PublishInput {
  shopId: string;
  productId: string;
  productVersionId: string;
  priceUsd: number;
  category: string;
  seo: SeoOutput;
  dryRun: boolean;
  autoPublish: boolean;
}

export interface PublishResult {
  status: "dry_run" | "published_draft" | "published_active" | "blocked";
  reason: string;
  listingId?: string;
}

export async function publishListing(input: PublishInput): Promise<PublishResult> {
  const taxonomyId = resolveTaxonomyId(input.category);
  if (!taxonomyId) {
    const reason = `No taxonomy_id configured for category "${input.category}". Run scripts/fetch-etsy-taxonomy.ts and fill in apps/worker/src/config/etsy-taxonomy.json.`;
    log.warn({ category: input.category }, reason);
    return { status: "blocked", reason };
  }

  const version = await prisma.productVersion.findUniqueOrThrow({ where: { id: input.productVersionId } });
  const listingImages = version.listingImages as Array<{ role: string; path: string; rank: number }>;
  const customerFiles = version.customerFiles as { PDF: string[]; PNG: string[]; SVG: string[]; ZIP: string[] };
  const digitalFilePaths = [...customerFiles.ZIP, ...customerFiles.PDF].slice(0, LISTING_LIMITS.maxDigitalFiles);

  const payload: CreateDraftListingInput = {
    quantity: 999,
    title: input.seo.title,
    description: input.seo.description,
    price: input.priceUsd,
    who_made: "i_did",
    when_made: "made_to_order",
    taxonomy_id: taxonomyId,
    tags: input.seo.tags,
    materials: input.seo.materials,
    is_digital: true,
    should_auto_renew: true,
    state: "draft",
  };

  const storage = getStorage();

  if (input.dryRun) {
    const dryRunPath = `${version.sourceDir}/dry-run-publish-payload.json`;
    await storage.write(
      dryRunPath,
      Buffer.from(
        JSON.stringify({ payload, listingImages: listingImages.map((i) => i.path), digitalFilePaths, wouldActivate: input.autoPublish }, null, 2),
        "utf8",
      ),
    );
    await recordDecision({
      agentName: "publisher-agent",
      entityType: "product",
      entityId: input.productId,
      action: "dry_run_publish",
      reason: `DRY_RUN=true — wrote intended Etsy API payload to ${dryRunPath} instead of calling the real API.`,
      dataUsed: { taxonomyId, price: input.priceUsd, tagCount: input.seo.tags.length },
      confidenceScore: 1,
      result: "DRY_RUN",
    });
    return { status: "dry_run", reason: `Payload written to ${dryRunPath} (DRY_RUN mode — nothing sent to Etsy).` };
  }

  const client = await getEtsyClientForShop(input.shopId);
  if (!client) {
    return { status: "blocked", reason: "Etsy is not connected yet (no active OAuth connection for this shop)." };
  }

  const listing = await client.createDraftListing(payload);

  for (const image of [...listingImages].sort((a, b) => a.rank - b.rank)) {
    const buffer = await storage.read(image.path);
    const filename = image.path.split("/").pop() ?? `${image.role}.png`;
    await client.uploadListingImage(String(listing.listing_id), buffer, filename, image.rank);
  }

  for (const [i, filePath] of digitalFilePaths.entries()) {
    const buffer = await storage.read(filePath);
    const filename = filePath.split("/").pop() ?? `file-${i}`;
    await client.uploadListingFile(String(listing.listing_id), buffer, filename, i + 1);
  }

  let finalState: "draft" | "active" = "draft";
  if (input.autoPublish) {
    await client.activateListing(String(listing.listing_id));
    finalState = "active";
  }

  const listingRow = await prisma.listing.create({
    data: {
      productId: input.productId,
      productVersionId: input.productVersionId,
      etsyListingId: String(listing.listing_id),
      state: finalState === "active" ? "ACTIVE" : "DRAFT",
      title: input.seo.title,
      description: input.seo.description,
      tags: input.seo.tags,
      priceAmount: input.priceUsd,
      taxonomyId,
      attributes: input.seo.attributes as unknown as object,
      isDigital: true,
      publishedAt: finalState === "active" ? new Date() : null,
      lastSyncedAt: new Date(),
    },
  });

  await prisma.listingAsset.createMany({
    data: listingImages.map((i) => ({ listingId: listingRow.id, rank: i.rank, role: i.role, storagePath: i.path, uploadedAt: new Date() })),
  });
  await prisma.digitalFile.createMany({
    data: digitalFilePaths.map((p, i) => ({
      listingId: listingRow.id,
      rank: i + 1,
      filename: p.split("/").pop() ?? `file-${i}`,
      storagePath: p,
      fileType: p.endsWith(".zip") ? "ZIP" : "PDF",
      sizeBytes: 0,
      uploadedAt: new Date(),
    })),
  });

  await prisma.product.update({ where: { id: input.productId }, data: { status: "PUBLISHED" } });

  await recordAudit({
    shopId: input.shopId,
    actor: "publisher-agent",
    action: "listing_published",
    entityType: "listing",
    entityId: listingRow.id,
    after: { etsyListingId: listing.listing_id, state: finalState, price: input.priceUsd },
    reason: input.autoPublish ? "AUTO_PUBLISH=true and QA/IP checks passed." : "Draft created; AUTO_PUBLISH=false so it was not activated.",
  });

  return {
    status: finalState === "active" ? "published_active" : "published_draft",
    reason: finalState === "active" ? "Listing created and activated on Etsy." : "Listing created as a draft on Etsy (AUTO_PUBLISH=false).",
    listingId: listingRow.id,
  };
}
