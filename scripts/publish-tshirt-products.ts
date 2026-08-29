import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { LISTING_LIMITS, type CreateDraftListingInput, type EtsyListing, type EtsyListingFile, type EtsyListingImage } from "@etsymagazam/etsy";
import { getEtsyClientForShop } from "../apps/worker/src/lib/etsy-client.ts";
import { CANONICAL_SHOP_ID } from "../packages/database/src/shop.ts";
import { listingImageNames, preparedRoot, productSources, type ProductData } from "./tshirt-products.ts";

type PreparedProduct = (typeof productSources)[number] & {
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
  status: "published" | "skipped_existing" | "held";
  listingId?: string;
  listingUrl?: string;
  priceTry?: number;
  buyerZip?: string;
  reason?: string;
};

function localFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".zip") return "ZIP";
  if (ext === ".png") return "PNG";
  if (ext === ".svg") return "SVG";
  if (ext === ".pdf") return "PDF";
  return ext.replace(".", "").toUpperCase();
}

function normalizeDescription(description: string): string {
  return description.replace(/\r\n/g, "\n").trim();
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function loadPreparedProduct(source: (typeof productSources)[number]): Promise<PreparedProduct | null> {
  const root = path.join(preparedRoot, source.slug);
  const qaReport = path.join(root, "qa-report", "qa-report.json");
  const qa = await readJson<{ passed: boolean; issues: unknown[] }>(qaReport).catch(() => null);
  if (!qa?.passed) return null;

  const data = await readJson<ProductData>(path.join(root, "listing-data", "PRODUCT_DATA.json"));
  return {
    ...source,
    data,
    paths: {
      root,
      images: listingImageNames.map((name) => path.join(root, "images", "listing_images", name)),
      buyerZip: path.join(root, "downloads", source.expectedBuyerZip),
      qaReport,
    },
  };
}

function validateDraft(listing: EtsyListing, product: PreparedProduct) {
  const issues: string[] = [];
  const expectedDescription = normalizeDescription(product.data.description);
  const actualDescription = normalizeDescription(listing.description);
  const price = listing.price.amount / listing.price.divisor;

  if (listing.state !== "draft") issues.push(`state is ${listing.state}, expected draft`);
  if (listing.type !== "download") issues.push(`type is ${listing.type}, expected download`);
  if (listing.title !== product.data.suggested_title) issues.push("title does not exactly match PRODUCT_DATA suggested_title");
  if (!actualDescription.includes("DIGITAL DOWNLOAD")) issues.push("description is missing DIGITAL DOWNLOAD");
  if (!actualDescription.toLowerCase().includes("no physical product")) issues.push("description is missing no physical product");
  if (!actualDescription.toLowerCase().includes("no t-shirt or other physical item")) issues.push("description is missing no T-shirt/no physical item");
  if (!actualDescription.toLowerCase().includes("ai disclosure")) issues.push("description is missing AI disclosure");
  if (!expectedDescription.includes(product.data.product_name)) issues.push("source description does not include product name");
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

  const sourceDir = `manual-products/tshirt-products/${product.slug}`;
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
    attributes: { style: "Retro graphic", occasion: null, recipient: null, color: "Black" },
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
        metadataJson: { manualPublish: true, source: "ETSY_5_TSHIRT_PRODUCTS_CODEX_READY", slug: product.slug, buyerZip: product.data.buyer_file },
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
        metadataJson: { manualPublish: true, source: "ETSY_5_TSHIRT_PRODUCTS_CODEX_READY", slug: product.slug, buyerZip: product.data.buyer_file },
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
    return {
      slug: product.slug,
      productName: product.data.product_name,
      status: "held",
      reason: `Shop currency is ${shop.currencyCode}, but PRODUCT_DATA suggested_price_try requires TRY pricing.`,
    };
  }

  const existingProduct = await prisma.product.findUnique({ where: { slug: product.slug }, include: { listings: true } });
  const existingActiveOrDraft = existingProduct?.listings.find((listing) => listing.state === "ACTIVE" || listing.state === "DRAFT");
  if (existingActiveOrDraft) {
    return {
      slug: product.slug,
      productName: product.data.product_name,
      status: "skipped_existing",
      listingId: existingActiveOrDraft.etsyListingId ?? existingActiveOrDraft.id,
      listingUrl: existingActiveOrDraft.etsyListingId ? `https://www.etsy.com/listing/${existingActiveOrDraft.etsyListingId}` : undefined,
      priceTry: Number(existingActiveOrDraft.priceAmount),
      buyerZip: product.data.buyer_file,
      reason: "Existing ACTIVE/DRAFT listing found for this slug; no duplicate listing was created.",
    };
  }

  const client = await getEtsyClientForShop(CANONICAL_SHOP_ID);
  if (!client) {
    return { slug: product.slug, productName: product.data.product_name, status: "held", reason: "Etsy client is not connected." };
  }

  const { productRow, version, listingImages, buyerZipStoragePath, seo } = await ensureProductRows(product, shop.id);
  let publishState = await prisma.publishState.upsert({
    where: { productVersionId: version.id },
    update: {},
    create: { productId: productRow.id, productVersionId: version.id, status: "PENDING" },
  });

  if (publishState.status === "COMPLETED") {
    const existing = await prisma.listing.findFirst({ where: { productVersionId: version.id } });
    if (existing) {
      return {
        slug: product.slug,
        productName: product.data.product_name,
        status: "skipped_existing",
        listingId: existing.etsyListingId ?? existing.id,
        listingUrl: existing.etsyListingId ? `https://www.etsy.com/listing/${existing.etsyListingId}` : undefined,
        priceTry: Number(existing.priceAmount),
        buyerZip: product.data.buyer_file,
        reason: "Publish state already completed; no duplicate listing was created.",
      };
    }
  }

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
        const buffer = await storage.read(image.path);
        uploadedImages.push(await client.uploadListingImage(etsyListingId, buffer, path.basename(image.path), image.rank));
      }
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { imagesUploaded: true } });
    }

    let uploadedFile: EtsyListingFile | null = null;
    if (!publishState.filesUploaded) {
      const buffer = await storage.read(buyerZipStoragePath);
      uploadedFile = await client.uploadListingFile(etsyListingId, buffer, path.basename(buyerZipStoragePath), 1);
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { filesUploaded: true } });
    }

    if (publishState.status !== "ASSETS_UPLOADED") {
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "ASSETS_UPLOADED" } });
    }

    const draftAfterUpload = await client.getListing(etsyListingId);
    const draftIssues = validateDraft(draftAfterUpload, product);
    if (draftIssues.length > 0) {
      await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "FAILED", lastError: draftIssues.join("; ") } });
      return { slug: product.slug, productName: product.data.product_name, status: "held", listingId: etsyListingId, reason: draftIssues.join("; ") };
    }

    if (!publishState.activated) {
      await client.activateListing(etsyListingId);
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { activated: true } });
    }

    const activeListing = await client.getListing(etsyListingId);
    const fileStats = await stat(product.paths.buyerZip);
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
        aiDisclosure: "This original artwork was created using AI-assisted design direction and was then prepared as a print-ready digital product.",
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
      listingId: etsyListingId,
      listingUrl: activeListing.url || `https://www.etsy.com/listing/${etsyListingId}`,
      priceTry: product.data.suggested_price_try,
      buyerZip: product.data.buyer_file,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "FAILED", lastError: message } }).catch(() => undefined);
    throw err;
  }
}

async function main() {
  const requested = new Set(process.argv.slice(2));
  const selectedSources = requested.size ? productSources.filter((source) => requested.has(source.slug) || requested.has(source.inputDir)) : productSources;
  if (selectedSources.length === 0) throw new Error(`No matching t-shirt product. Known slugs: ${productSources.map((source) => source.slug).join(", ")}`);

  const reports: PublishReport[] = [];
  for (const source of selectedSources) {
    const product = await loadPreparedProduct(source);
    if (!product) {
      reports.push({ slug: source.slug, productName: source.phrase, status: "held", reason: "Prepared QA report is missing or failed." });
      continue;
    }
    reports.push(await publishProduct(product));
  }

  await mkdir(preparedRoot, { recursive: true });
  await writeFile(path.join(preparedRoot, "publish-summary.json"), JSON.stringify(reports, null, 2), "utf8");
  console.log(JSON.stringify(reports, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
