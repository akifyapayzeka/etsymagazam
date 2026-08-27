#!/usr/bin/env tsx
/**
 * Publishes hand-built artifacts/*-live-listing/ packages to Etsy for real,
 * as DRAFT listings — using the EtsyConnection OAuth token already stored
 * for the canonical shop (no new API key needed; see docs/ETSY_SETUP.md).
 *
 * This is a deliberate one-off script (same spirit as
 * scripts/build-first-listing.ts): it reuses the exact same publish
 * pipeline the autopilot itself uses (apps/worker/src/agents/publisher.ts —
 * idempotent, currency-aware, taxonomy-checked) instead of a new code path,
 * just fed from a pre-built artifacts/ folder instead of a freshly
 * AI-generated ProductVersion.
 *
 * Listings are created as Etsy DRAFTS (never auto-activated) — a human
 * still reviews and hits "Publish" in Etsy's own editor before anything
 * goes live or costs a listing fee.
 *
 * MUST run inside the worker container on the VPS (it needs the real
 * DATABASE_URL, STORAGE_LOCAL_PATH, and Etsy credentials from .env):
 *
 *   cd /opt/etsy-autopilot
 *   docker compose -p etsy-autopilot -f docker-compose.prod.yml build worker
 *   docker compose -p etsy-autopilot -f docker-compose.prod.yml run --rm -T worker \
 *     pnpm tsx scripts/publish-artifacts-to-etsy.ts third fourth fifth sixth seventh
 *
 * Pass one or more artifact folder short names (matching the LISTINGS table
 * below). Each is fully independent — a taxonomy_id "blocked" result for one
 * listing never affects the others.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getStorage, loadEnv } from "@etsymagazam/core";
import { getCanonicalShop, prisma } from "@etsymagazam/database";
import { computeImageHash } from "@etsymagazam/qa";
import { publishListing } from "../apps/worker/src/agents/publisher.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

interface ListingSpec {
  key: string;
  artifactDir: string;
  slug: string;
  /** Must match a key in apps/worker/src/config/etsy-taxonomy.json (or the ETSY_TAXONOMY_IDS env override) to actually publish — otherwise publishListing() safely blocks rather than guessing. */
  taxonomyCategory: string;
  productType: string;
}

const LISTINGS: ListingSpec[] = [
  { key: "third", artifactDir: "third-live-listing", slug: "rescue-dog-gotcha-day-memory-bundle", taxonomyCategory: "cards", productType: "checklist" },
  { key: "fourth", artifactDir: "fourth-live-listing", slug: "wildflower-wedding-welcome-sign-bundle", taxonomyCategory: "wedding", productType: "poster" },
  { key: "fifth", artifactDir: "fifth-live-listing", slug: "halloween-party-planner-games-bundle", taxonomyCategory: "seasonal", productType: "checklist" },
  { key: "sixth", artifactDir: "sixth-live-listing", slug: "2026-2027-student-semester-reset-planner", taxonomyCategory: "planner", productType: "checklist" },
  { key: "seventh", artifactDir: "seventh-live-listing", slug: "pet-sitter-emergency-routine-binder", taxonomyCategory: "organization", productType: "checklist" },
];

async function readTextFile(p: string): Promise<string> {
  return (await readFile(p, "utf8")).trim();
}

async function publishOne(spec: ListingSpec) {
  const artifactRoot = path.join(REPO_ROOT, "artifacts", spec.artifactDir);
  const storage = getStorage();

  const title = await readTextFile(path.join(artifactRoot, "listing-data", "etsy-title.txt"));
  const description = await readTextFile(path.join(artifactRoot, "listing-data", "etsy-description.txt"));
  const tags = (await readTextFile(path.join(artifactRoot, "listing-data", "etsy-tags.txt"))).split("\n").map((t) => t.trim()).filter(Boolean);
  const priceLine = await readTextFile(path.join(artifactRoot, "listing-data", "etsy-price.txt"));
  const priceUsd = Number.parseFloat(priceLine.split(/\s/)[0] ?? "0");
  const attributesRaw = JSON.parse(await readTextFile(path.join(artifactRoot, "listing-data", "etsy-attributes.json"))) as {
    occasion?: string;
    style?: string;
    recipient?: string;
    color?: string;
    materials: string[];
  };

  // --- Copy listing images + customer files into the real storage volume ---
  const listingImagesDir = path.join(artifactRoot, "listing-images");
  const imageFiles = (await readdir(listingImagesDir)).filter((f) => f.endsWith(".png")).sort();
  const listingImages: { role: string; path: string; rank: number }[] = [];
  for (const [i, filename] of imageFiles.entries()) {
    const buf = await readFile(path.join(listingImagesDir, filename));
    const role = filename.replace(/^\d+_/, "").replace(/\.png$/, "");
    const relPath = `${spec.slug}/listing_images/${filename}`;
    await storage.write(relPath, buf);
    listingImages.push({ role, path: relPath, rank: i + 1 });
  }

  const downloadDir = path.join(artifactRoot, "customer-download");
  const downloadFiles = await readdir(downloadDir);
  const customerFiles = { PDF: [] as string[], PNG: [] as string[], SVG: [] as string[], ZIP: [] as string[] };
  for (const filename of downloadFiles) {
    const buf = await readFile(path.join(downloadDir, filename));
    const relPath = `${spec.slug}/source/${filename}`;
    await storage.write(relPath, buf);
    if (filename.endsWith(".zip")) customerFiles.ZIP.push(relPath);
    else if (filename.endsWith(".pdf")) customerFiles.PDF.push(relPath);
  }

  const coverImage = listingImages.find((i) => i.role === "cover" || i.role === "01_cover");
  const coverImageHash = coverImage ? await computeImageHash(await storage.read(coverImage.path)) : null;

  // --- DB rows -------------------------------------------------------------
  const shop = await getCanonicalShop();

  const product = await prisma.product.create({
    data: {
      shopId: shop.id,
      slug: `${spec.slug}-${Date.now().toString(36)}`,
      title,
      category: spec.taxonomyCategory,
      productType: spec.productType,
      status: "IN_QA",
    },
  });

  const version = await prisma.productVersion.create({
    data: {
      productId: product.id,
      versionNumber: 1,
      sourceDir: `${spec.slug}/source`,
      customerFiles: customerFiles as unknown as object,
      listingImages: listingImages as unknown as object,
      mockups: listingImages.filter((i) => i.role === "cover" || i.role === "mockup" || i.role === "01_cover" || i.role === "02_mockup") as unknown as object,
      metadataJson: { productSlug: spec.slug, productTitle: title, coverImageHash } as object,
      seoJson: { title, description, tags, materials: attributesRaw.materials, attributes: attributesRaw, usedAi: true } as unknown as object,
    },
  });

  await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });

  const result = await publishListing({
    shopId: shop.id,
    productId: product.id,
    productVersionId: version.id,
    priceUsd,
    category: spec.taxonomyCategory,
    seo: {
      title,
      description,
      tags,
      materials: attributesRaw.materials,
      attributes: {
        occasion: attributesRaw.occasion ?? null,
        style: attributesRaw.style ?? null,
        recipient: attributesRaw.recipient ?? null,
        color: attributesRaw.color ?? null,
      },
      usedAi: true,
    },
    dryRun: false,
    autoPublish: false, // always create as an Etsy DRAFT — a human reviews and activates it
  });

  return { spec, title, priceUsd, imageCount: listingImages.length, fileCount: customerFiles.ZIP.length + customerFiles.PDF.length, result };
}

async function main() {
  const requested = process.argv.slice(2);
  const targets = requested.length > 0 ? LISTINGS.filter((l) => requested.includes(l.key)) : LISTINGS;
  if (targets.length === 0) {
    console.error(`No matching listings for args: ${requested.join(", ")}. Valid keys: ${LISTINGS.map((l) => l.key).join(", ")}`);
    process.exit(1);
  }

  loadEnv(); // fail fast if secrets are missing, before touching anything

  const rows: Array<{ title: string; priceUsd: number; imageCount: number; fileCount: number; status: string; listingId?: string; reason: string }> = [];
  for (const spec of targets) {
    console.log(`\n=== Publishing "${spec.slug}" as a draft (category: ${spec.taxonomyCategory}) ===`);
    try {
      const { title, priceUsd, imageCount, fileCount, result } = await publishOne(spec);
      console.log(`  -> ${result.status}: ${result.reason}${result.listingId ? ` (listing_id ${result.listingId})` : ""}`);
      rows.push({ title, priceUsd, imageCount, fileCount, status: result.status, listingId: result.listingId, reason: result.reason });
    } catch (err) {
      console.error(`  -> ERROR:`, err);
      rows.push({ title: spec.slug, priceUsd: 0, imageCount: 0, fileCount: 0, status: "error", reason: String(err) });
    }
  }

  console.log("\n\n=== SUMMARY ===");
  console.table(rows.map((r) => ({ title: r.title.slice(0, 40), price: r.priceUsd, images: r.imageCount, files: r.fileCount, status: r.status, listingId: r.listingId ?? "-" })));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
