import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { LISTING_LIMITS, type CreateDraftListingInput, type EtsyListing, type EtsyListingFile, type EtsyListingImage } from "@etsymagazam/etsy";
import { getEtsyClientForShop } from "../apps/worker/src/lib/etsy-client.ts";
import { CANONICAL_SHOP_ID } from "../packages/database/src/shop.ts";
import { generatedTshirtListingImageNames, generatedTshirtProducts, generatedTshirtWaveRoot, type GeneratedTshirtProduct } from "./generated-tshirt-wave-products.ts";

type ProductData = {
  product_name: string;
  suggested_title: string;
  suggested_price_try: number;
  tags: string[];
  description: string;
  listing_images: string[];
  buyer_file: string;
  digital_product: boolean;
  physical_item: boolean;
  ai_disclosure_required: boolean;
};

type PreparedProduct = GeneratedTshirtProduct & {
  data: ProductData;
  paths: {
    root: string;
    images: string[];
    buyerZip: string;
    qaReport: string;
  };
};

type PublishReport = {
  slug: string;
  productName: string;
  status: "published" | "skipped_existing" | "dry_run_ready" | "held";
  listingTitle?: string;
  listingId?: string;
  listingUrl?: string;
  priceTry?: number;
  buyerZip?: string;
  imagesUploaded?: string[];
  tags?: string[];
  checks?: "PASS" | "FAIL";
  reason?: string;
};

function localFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".zip") return "ZIP";
  if (ext === ".png") return "PNG";
  if (ext === ".jpg" || ext === ".jpeg") return "JPG";
  return ext.replace(".", "").toUpperCase();
}

function normalizeDescription(description: string): string {
  return description.replace(/\r\n/g, "\n").trim();
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function loadPreparedProduct(source: GeneratedTshirtProduct): Promise<PreparedProduct | null> {
  const root = path.join(generatedTshirtWaveRoot, source.slug);
  const qaReport = path.join(root, "qa-report", "qa-report.json");
  const qa = await readJson<{ passed: boolean; issues: unknown[] }>(qaReport).catch(() => null);
  if (!qa?.passed) return null;

  const data = await readJson<ProductData>(path.join(root, "listing-data", "PRODUCT_DATA.json"));
  if (!data.digital_product || data.physical_item || data.buyer_file !== source.buyerZip) return null;
  return {
    ...source,
    data,
    paths: {
      root,
      images: generatedTshirtListingImageNames.map((name) => path.join(root, "images", "listing_images", name)),
      buyerZip: path.join(root, "downloads", source.buyerZip),
      qaReport,
    },
  };
}

function validateDraft(listing: EtsyListing, product: PreparedProduct) {
  const issues: string[] = [];
  const actualDescription = normalizeDescription(listing.description);
  const price = listing.price.amount / listing.price.divisor;

  if (listing.state !== "draft") issues.push(`state is ${listing.state}, expected draft`);
  if (listing.type !== undefined && listing.type !== "download") issues.push(`type is ${listing.type}, expected download`);
  if (listing.title !== product.data.suggested_title) issues.push("title does not exactly match prepared data");
  if (!actualDescription.toLowerCase().includes("digital download")) issues.push("description is missing digital download");
  if (!actualDescription.toLowerCase().includes("no physical product")) issues.push("description is missing no physical product");
  if (!actualDescription.toLowerCase().includes("no physical item will be shipped")) issues.push("description is missing no physical item shipment notice");
  if (!actualDescription.toLowerCase().includes("ai disclosure")) issues.push("description is missing AI disclosure");
  if (listing.price.currency_code !== "TRY") issues.push(`currency is ${listing.price.currency_code}, expected TRY`);
  if (Math.abs(price - product.data.suggested_price_try) > 0.01) issues.push(`price is ${price}, expected ${product.data.suggested_price_try}`);
  if (listing.quantity !== 999) issues.push(`quantity is ${listing.quantity}, expected 999`);
  if (listing.tags.length !== LISTING_LIMITS.maxTags) issues.push(`tag count is ${listing.tags.length}, expected 13`);
  for (const tag of product.data.tags) {
    if (!listing.tags.includes(tag)) issues.push(`missing tag: ${tag}`);
  }
  return issues;
}

async function mirrorAsset(localPath: string, storagePath: string): Promise<string> {
  const storage = getStorage();
  await storage.write(storagePath, await readFile(localPath));
  return storagePath;
}

async function ensureProductRows(product: PreparedProduct, shopId: string) {
  const productRow = await prisma.product.upsert({
    where: { slug: product.slug },
    update: {
      shopId,
      title: product.data.product_name,
      category: "digital_tshirt_print",
      productType: product.productType,
      status: "READY_TO_PUBLISH",
      designFamily: product.designFamily,
    },
    create: {
      shopId,
      slug: product.slug,
      title: product.data.product_name,
      category: "digital_tshirt_print",
      productType: product.productType,
      status: "READY_TO_PUBLISH",
      designFamily: product.designFamily,
    },
  });

  const sourceDir = `manual-products/generated-tshirt-wave-20260831/${product.slug}`;
  const listingImages = await Promise.all(
    product.paths.images.map(async (file, index) => ({
      role: index === 0 ? "cover" : `image_${index + 1}`,
      rank: index + 1,
      path: await mirrorAsset(file, `${sourceDir}/listing_images/${path.basename(file)}`),
    })),
  );
  const buyerZipStoragePath = await mirrorAsset(product.paths.buyerZip, `${sourceDir}/customer_files/ZIP/${path.basename(product.paths.buyerZip)}`);
  const qaReport = await readJson<unknown>(product.paths.qaReport);
  const customerFiles = { PDF: [] as string[], PNG: [] as string[], SVG: [] as string[], ZIP: [buyerZipStoragePath] };
  const seo = {
    title: product.data.suggested_title,
    description: product.data.description,
    tags: product.data.tags,
    materials: ["Digital File", "PNG", "ZIP", "T-Shirt Design"],
    attributes: { style: "Minimal graphic", occasion: null, recipient: null, color: product.colors.ink },
    usedAi: true,
  };

  let version = await prisma.productVersion.findFirst({ where: { productId: productRow.id, versionNumber: 1 } });
  if (!version) {
    version = await prisma.productVersion.create({
      data: {
        productId: productRow.id,
        versionNumber: 1,
        sourceDir,
        customerFiles,
        listingImages,
        mockups: listingImages,
        metadataJson: { manualPublish: true, source: "generated-tshirt-wave-20260831", slug: product.slug, buyerZip: product.data.buyer_file },
        seoJson: seo,
        qaReportJson: qaReport as object,
      },
    });
  } else {
    version = await prisma.productVersion.update({
      where: { id: version.id },
      data: {
        sourceDir,
        customerFiles,
        listingImages,
        mockups: listingImages,
        metadataJson: { manualPublish: true, source: "generated-tshirt-wave-20260831", slug: product.slug, buyerZip: product.data.buyer_file },
        seoJson: seo,
        qaReportJson: qaReport as object,
      },
    });
  }
  await prisma.product.update({ where: { id: productRow.id }, data: { currentVersionId: version.id } });
  return { productRow, version, listingImages, buyerZipStoragePath, seo };
}

async function publishProduct(product: PreparedProduct): Promise<PublishReport> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: CANONICAL_SHOP_ID } });
  if (shop.currencyCode !== "TRY") {
    return { slug: product.slug, productName: product.data.product_name, status: "held", checks: "FAIL", reason: `Shop currency is ${shop.currencyCode}, expected TRY for 200 TL pricing.` };
  }

  const existingProduct = await prisma.product.findUnique({ where: { slug: product.slug }, include: { listings: true } });
  const existingActiveOrDraft = existingProduct?.listings.find((listing) => listing.state === "ACTIVE" || listing.state === "DRAFT");
  if (existingActiveOrDraft) {
    return {
      slug: product.slug,
      productName: product.data.product_name,
      status: "skipped_existing",
      listingTitle: existingActiveOrDraft.title,
      listingId: existingActiveOrDraft.etsyListingId ?? existingActiveOrDraft.id,
      listingUrl: existingActiveOrDraft.etsyListingId ? `https://www.etsy.com/listing/${existingActiveOrDraft.etsyListingId}` : undefined,
      priceTry: Number(existingActiveOrDraft.priceAmount),
      buyerZip: product.data.buyer_file,
      imagesUploaded: [...generatedTshirtListingImageNames],
      tags: product.data.tags,
      checks: "PASS",
      reason: "Existing ACTIVE/DRAFT listing found for this slug; no duplicate listing was created.",
    };
  }

  const client = await getEtsyClientForShop(CANONICAL_SHOP_ID);
  if (!client) return { slug: product.slug, productName: product.data.product_name, status: "held", checks: "FAIL", reason: "Etsy OAuth client is not connected." };

  const { productRow, version, listingImages, buyerZipStoragePath, seo } = await ensureProductRows(product, shop.id);
  let publishState = await prisma.publishState.upsert({
    where: { productVersionId: version.id },
    update: {},
    create: { productId: productRow.id, productVersionId: version.id, status: "PENDING" },
  });

  const storage = getStorage();
  const taxonomyId = Number(process.env.ETSY_TSHIRT_TAXONOMY_ID ?? 562);
  const payload: CreateDraftListingInput = {
    quantity: 999,
    title: product.data.suggested_title,
    description: product.data.description,
    price: product.data.suggested_price_try,
    who_made: "i_did",
    when_made: "2020_2026",
    taxonomy_id: taxonomyId,
    type: "download",
    tags: product.data.tags,
    is_personalizable: false,
    should_auto_renew: true,
    is_supply: true,
    state: "draft",
  };

  let etsyListingId = publishState.etsyListingId;
  try {
    if (!etsyListingId) {
      const draft = await client.createDraftListing(payload);
      etsyListingId = String(draft.listing_id);
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "LISTING_CREATED", etsyListingId } });
    }

    const uploadedImages: EtsyListingImage[] = [];
    if (!publishState.imagesUploaded) {
      for (const image of listingImages) {
        uploadedImages.push(await client.uploadListingImage(etsyListingId, await storage.read(image.path), path.basename(image.path), image.rank));
      }
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { imagesUploaded: true } });
    }

    let uploadedFile: EtsyListingFile | null = null;
    if (!publishState.filesUploaded) {
      uploadedFile = await client.uploadListingFile(etsyListingId, await storage.read(buyerZipStoragePath), path.basename(buyerZipStoragePath), 1);
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { filesUploaded: true } });
    }
    publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "ASSETS_UPLOADED" } });

    const draft = await client.getListing(etsyListingId);
    const draftIssues = validateDraft(draft, product);
    if (draftIssues.length > 0) {
      await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "FAILED", lastError: draftIssues.join("; ") } });
      return { slug: product.slug, productName: product.data.product_name, status: "held", listingTitle: product.data.suggested_title, listingId: etsyListingId, priceTry: product.data.suggested_price_try, buyerZip: product.data.buyer_file, imagesUploaded: [...generatedTshirtListingImageNames], tags: product.data.tags, checks: "FAIL", reason: draftIssues.join("; ") };
    }

    await client.activateListing(etsyListingId);
    await prisma.publishState.update({ where: { id: publishState.id }, data: { activated: true } });
    const activeListing = await client.getListing(etsyListingId);

    const listingRow = await prisma.listing.create({
      data: {
        productId: productRow.id,
        productVersionId: version.id,
        etsyListingId,
        state: "ACTIVE",
        title: product.data.suggested_title,
        description: product.data.description,
        tags: product.data.tags,
        priceAmount: product.data.suggested_price_try,
        currencyCode: "TRY",
        taxonomyId,
        attributes: seo.attributes,
        whoMade: "i_did",
        whenMade: "2020_2026",
        isDigital: true,
        publishedAt: new Date(),
        lastSyncedAt: new Date(),
        aiDisclosure: "AI-assisted concept and layout direction was used. The final printable PNG, listing copy and product package were reviewed and prepared by the seller.",
      },
    });

    await prisma.listingAsset.createMany({
      data: listingImages.map((image) => ({
        listingId: listingRow.id,
        etsyImageId: uploadedImages.find((uploaded) => uploaded.rank === image.rank)?.listing_image_id
          ? String(uploadedImages.find((uploaded) => uploaded.rank === image.rank)?.listing_image_id)
          : null,
        rank: image.rank,
        role: image.role,
        storagePath: image.path,
        uploadedAt: new Date(),
      })),
    });

    const fileStats = await stat(product.paths.buyerZip);
    await prisma.digitalFile.create({
      data: {
        listingId: listingRow.id,
        etsyFileId: uploadedFile?.listing_file_id ? String(uploadedFile.listing_file_id) : null,
        rank: 1,
        filename: path.basename(product.paths.buyerZip),
        storagePath: buyerZipStoragePath,
        fileType: localFileType(product.paths.buyerZip),
        sizeBytes: fileStats.size,
        uploadedAt: new Date(),
      },
    });

    await prisma.product.update({ where: { id: productRow.id }, data: { status: "PUBLISHED" } });
    await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "COMPLETED", lastError: null } });

    return {
      slug: product.slug,
      productName: product.data.product_name,
      status: "published",
      listingTitle: product.data.suggested_title,
      listingId: etsyListingId,
      listingUrl: activeListing.url || `https://www.etsy.com/listing/${etsyListingId}`,
      priceTry: product.data.suggested_price_try,
      buyerZip: product.data.buyer_file,
      imagesUploaded: [...generatedTshirtListingImageNames],
      tags: product.data.tags,
      checks: "PASS",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "FAILED", lastError: message } }).catch(() => undefined);
    throw err;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const requested = new Set(process.argv.slice(2).filter((arg) => arg !== "--dry-run"));
  const selected = requested.size ? generatedTshirtProducts.filter((product) => requested.has(product.slug)) : generatedTshirtProducts;
  if (selected.length === 0) throw new Error(`No matching generated t-shirt slug. Known slugs: ${generatedTshirtProducts.map((product) => product.slug).join(", ")}`);

  const reports: PublishReport[] = [];
  for (const source of selected) {
    const product = await loadPreparedProduct(source);
    if (!product) {
      reports.push({ slug: source.slug, productName: source.productName, status: "held", checks: "FAIL", reason: "Prepared QA report is missing, failed, or product data does not match buyer ZIP." });
      continue;
    }
    if (dryRun) {
      reports.push({
        slug: product.slug,
        productName: product.data.product_name,
        status: "dry_run_ready",
        listingTitle: product.data.suggested_title,
        priceTry: product.data.suggested_price_try,
        buyerZip: product.data.buyer_file,
        imagesUploaded: [...generatedTshirtListingImageNames],
        tags: product.data.tags,
        checks: "PASS",
        reason: "Dry-run only; no Etsy write attempted.",
      });
      continue;
    }
    reports.push(await publishProduct(product));
  }

  const summaryJson = JSON.stringify(reports, null, 2);
  if (!dryRun) {
    await getStorage().write("manual-products/generated-tshirt-wave-20260831/publish-summary.json", Buffer.from(summaryJson, "utf8")).catch(() => undefined);
  }
  await mkdir(generatedTshirtWaveRoot, { recursive: true }).catch(() => undefined);
  await writeFile(path.join(generatedTshirtWaveRoot, "publish-summary.json"), summaryJson, "utf8").catch(() => undefined);
  console.log(summaryJson);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
