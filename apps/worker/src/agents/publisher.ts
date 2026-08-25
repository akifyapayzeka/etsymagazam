import { createLogger, getStorage, loadEnv, parseStaticFxRates, resolveShopPrice } from "@etsymagazam/core";
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
  /** USD-denominated (see packages/core/src/currency.ts) — converted to the connected shop's real currency before being sent to Etsy. */
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

  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: input.shopId } });
  const env = loadEnv();
  const fx = resolveShopPrice(input.priceUsd, shop.currencyCode, parseStaticFxRates(env.FX_STATIC_RATES));
  if (!fx.ok) {
    log.warn({ shopId: input.shopId, shopCurrencyCode: shop.currencyCode, ...fx.auditDetails }, fx.reason);
    await recordDecision({
      agentName: "publisher-agent",
      entityType: "product",
      entityId: input.productId,
      action: "publish_blocked_currency_mismatch",
      reason: fx.reason,
      dataUsed: fx.auditDetails,
      confidenceScore: 1,
      result: "BLOCKED",
    });
    return { status: "blocked", reason: fx.reason };
  }
  const { priceInShopCurrency, shopCurrencyCode, fxRate, fxSource, basePriceUsd } = fx.resolution;

  const version = await prisma.productVersion.findUniqueOrThrow({ where: { id: input.productVersionId } });
  const listingImages = version.listingImages as Array<{ role: string; path: string; rank: number }>;
  const customerFiles = version.customerFiles as { PDF: string[]; PNG: string[]; SVG: string[]; ZIP: string[] };
  const digitalFilePaths = [...customerFiles.ZIP, ...customerFiles.PDF].slice(0, LISTING_LIMITS.maxDigitalFiles);

  const payload: CreateDraftListingInput = {
    quantity: 999,
    title: input.seo.title,
    description: input.seo.description,
    price: priceInShopCurrency,
    who_made: "i_did",
    // Every product this autopilot creates is a pre-rendered, ready-made
    // instant download — never something made after a specific customer's
    // order — so "made_to_order" is never correct here. "2020_2026" is the
    // real Etsy when_made date-range enum value covering products actually
    // created in that window (see packages/etsy/src/types.ts EtsyWhenMade).
    when_made: "2020_2026",
    taxonomy_id: taxonomyId,
    type: "download",
    tags: input.seo.tags,
    materials: input.seo.materials,
    should_auto_renew: true,
    state: "draft",
  };

  const storage = getStorage();

  if (input.dryRun) {
    const dryRunPath = `${version.sourceDir}/dry-run-publish-payload.json`;
    await storage.write(
      dryRunPath,
      Buffer.from(
        JSON.stringify(
          {
            payload,
            fx: { basePriceUsd, shopCurrencyCode, fxRate, fxSource },
            listingImages: listingImages.map((i) => i.path),
            digitalFilePaths,
            wouldActivate: input.autoPublish,
          },
          null,
          2,
        ),
        "utf8",
      ),
    );
    await recordDecision({
      agentName: "publisher-agent",
      entityType: "product",
      entityId: input.productId,
      action: "dry_run_publish",
      reason: `DRY_RUN=true — wrote intended Etsy API payload to ${dryRunPath} instead of calling the real API.`,
      dataUsed: { taxonomyId, basePriceUsd, priceInShopCurrency, shopCurrencyCode, fxRate, fxSource, tagCount: input.seo.tags.length },
      confidenceScore: 1,
      result: "DRY_RUN",
    });
    return { status: "dry_run", reason: `Payload written to ${dryRunPath} (DRY_RUN mode — nothing sent to Etsy).` };
  }

  const client = await getEtsyClientForShop(input.shopId);
  if (!client) {
    return { status: "blocked", reason: "Etsy is not connected yet (no active OAuth connection for this shop)." };
  }

  // --- Idempotency state machine ------------------------------------------
  // A BullMQ retry (transient network error, worker crash mid-publish, etc.)
  // re-enters this function from the top. Without a durable record of which
  // Etsy API calls already succeeded, a retry would call createDraftListing
  // again and produce a second real draft listing on Etsy for the same
  // product. publish_states is that durable record, keyed by
  // productVersionId (unique): each step's result is persisted immediately
  // after it succeeds, before the next step runs, so a retry resumes from
  // the last completed step instead of restarting. (Etsy's write endpoints
  // have no idempotency-key parameter, so this DB write is the only
  // safeguard — if the process dies in the gap between the Etsy call
  // succeeding and this write landing, that one edge case can still create
  // a duplicate; everything else is covered.)
  let publishState = await prisma.publishState.upsert({
    where: { productVersionId: input.productVersionId },
    update: {},
    create: { productId: input.productId, productVersionId: input.productVersionId, status: "PENDING" },
  });

  if (publishState.status === "COMPLETED") {
    const existing = await prisma.listing.findFirst({ where: { productVersionId: input.productVersionId } });
    if (existing) {
      return {
        status: existing.state === "ACTIVE" ? "published_active" : "published_draft",
        reason: "Already published in a previous run (idempotent replay) — no new Etsy listing was created.",
        listingId: existing.id,
      };
    }
  }

  try {
    let etsyListingId = publishState.etsyListingId;
    if (!etsyListingId) {
      const listing = await client.createDraftListing(payload);
      etsyListingId = String(listing.listing_id);
      publishState = await prisma.publishState.update({
        where: { id: publishState.id },
        data: { status: "LISTING_CREATED", etsyListingId },
      });
    }

    if (!publishState.imagesUploaded) {
      for (const image of [...listingImages].sort((a, b) => a.rank - b.rank)) {
        const buffer = await storage.read(image.path);
        const filename = image.path.split("/").pop() ?? `${image.role}.png`;
        await client.uploadListingImage(etsyListingId, buffer, filename, image.rank);
      }
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { imagesUploaded: true } });
    }

    if (!publishState.filesUploaded) {
      for (const [i, filePath] of digitalFilePaths.entries()) {
        const buffer = await storage.read(filePath);
        const filename = filePath.split("/").pop() ?? `file-${i}`;
        await client.uploadListingFile(etsyListingId, buffer, filename, i + 1);
      }
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { filesUploaded: true } });
    }

    if (publishState.status !== "ASSETS_UPLOADED") {
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "ASSETS_UPLOADED" } });
    }

    let finalState: "draft" | "active" = "draft";
    if (input.autoPublish) {
      if (!publishState.activated) {
        await client.activateListing(etsyListingId);
        publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { activated: true } });
      }
      finalState = "active";
    }

    let listingRow = await prisma.listing.findFirst({ where: { productVersionId: input.productVersionId } });
    if (!listingRow) {
      listingRow = await prisma.listing.create({
        data: {
          productId: input.productId,
          productVersionId: input.productVersionId,
          etsyListingId,
          state: finalState === "active" ? "ACTIVE" : "DRAFT",
          title: input.seo.title,
          description: input.seo.description,
          tags: input.seo.tags,
          priceAmount: priceInShopCurrency,
          currencyCode: shopCurrencyCode,
          taxonomyId,
          attributes: input.seo.attributes as unknown as object,
          isDigital: true,
          publishedAt: finalState === "active" ? new Date() : null,
          lastSyncedAt: new Date(),
        },
      });

      await prisma.listingAsset.createMany({
        data: listingImages.map((i) => ({ listingId: listingRow!.id, rank: i.rank, role: i.role, storagePath: i.path, uploadedAt: new Date() })),
      });
      await prisma.digitalFile.createMany({
        data: digitalFilePaths.map((p, i) => ({
          listingId: listingRow!.id,
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
        after: { etsyListingId, state: finalState, basePriceUsd, priceInShopCurrency, shopCurrencyCode, fxRate, fxSource },
        reason: input.autoPublish ? "AUTO_PUBLISH=true and QA/IP checks passed." : "Draft created; AUTO_PUBLISH=false so it was not activated.",
      });
    }

    await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "COMPLETED", lastError: null } });

    return {
      status: finalState === "active" ? "published_active" : "published_draft",
      reason: finalState === "active" ? "Listing created and activated on Etsy." : "Listing created as a draft on Etsy (AUTO_PUBLISH=false).",
      listingId: listingRow.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "FAILED", lastError: message } });
    throw err;
  }
}
