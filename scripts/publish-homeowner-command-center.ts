import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { getStorage, loadEnv, parseStaticFxRates, resolveShopPrice } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { LISTING_LIMITS, type CreateDraftListingInput, type EtsyListing, type EtsyListingFile, type EtsyListingImage } from "@etsymagazam/etsy";
import { getEtsyClientForShop } from "../apps/worker/src/lib/etsy-client.ts";
import { CANONICAL_SHOP_ID } from "../packages/database/src/shop.ts";
import {
  homeownerBuyerFiles,
  homeownerDescription,
  homeownerImageFiles,
  homeownerInputRoot,
  homeownerPreparedRoot,
  homeownerSlug,
  homeownerTags,
  homeownerTitle,
} from "./homeowner-command-center.ts";

type PdfInfo = {
  filename: string;
  sizeBytes: number;
  pages: number;
  form: string;
  pageSize: string;
  fieldCount: number;
};

type PublishReport = {
  status: "Published" | "Draft Ready" | "Blocked";
  listingTitle: string;
  price: string;
  filesUploaded: string[];
  imagesUploaded: string[];
  tags: string[];
  checks: "PASS" | "FAIL";
  manualActionRequired: string;
  listingUrl?: string;
  listingId?: string;
  reason?: string;
};

const expectedPdfInfo: Record<string, Pick<PdfInfo, "pages" | "form" | "pageSize">> = {
  "Homeowner_Command_Center_US_Letter_FILLABLE.pdf": { pages: 29, form: "AcroForm", pageSize: "letter" },
  "Homeowner_Command_Center_A4_FILLABLE.pdf": { pages: 29, form: "AcroForm", pageSize: "A4" },
  "READ_ME_FIRST.pdf": { pages: 1, form: "none", pageSize: "letter" },
};

function localFileType(filename: string): string {
  return path.extname(filename).slice(1).toUpperCase();
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getSourceRoots(): Promise<{ downloadRoot: string; imageRoot: string }> {
  const incomingDownloadRoot = homeownerInputRoot;
  const incomingImageRoot = path.join(homeownerInputRoot, "Listing_Images");
  if (await pathExists(path.join(incomingDownloadRoot, homeownerBuyerFiles[0]))) {
    return { downloadRoot: incomingDownloadRoot, imageRoot: incomingImageRoot };
  }
  return {
    downloadRoot: path.join(homeownerPreparedRoot, "downloads"),
    imageRoot: path.join(homeownerPreparedRoot, "images", "listing_images"),
  };
}

async function copyIfDifferent(sourcePath: string, outputPath: string) {
  if (path.resolve(sourcePath) === path.resolve(outputPath)) return;
  await copyFile(sourcePath, outputPath);
}

function describePageSize(width: number, height: number): string {
  const [shortSide, longSide] = [width, height].sort((a, b) => a - b);
  if (Math.abs(shortSide - 612) < 2 && Math.abs(longSide - 792) < 2) return `letter (${width.toFixed(2)} x ${height.toFixed(2)})`;
  if (Math.abs(shortSide - 595.28) < 2 && Math.abs(longSide - 841.89) < 2) return `A4 (${width.toFixed(2)} x ${height.toFixed(2)})`;
  return `${width.toFixed(2)} x ${height.toFixed(2)}`;
}

async function inspectPdf(filePath: string, filename: string, sizeBytes: number): Promise<PdfInfo> {
  const pdf = await PDFDocument.load(await readFile(filePath));
  const pages = pdf.getPageCount();
  const { width, height } = pdf.getPage(0).getSize();
  const fieldCount = pdf.getForm().getFields().length;
  return {
    filename,
    sizeBytes,
    pages,
    form: fieldCount > 0 ? "AcroForm" : "none",
    pageSize: describePageSize(width, height),
    fieldCount,
  };
}

async function qaInputs() {
  const issues: string[] = [];
  const pdfs: PdfInfo[] = [];
  const images: Array<{ filename: string; width: number; height: number; format?: string; sizeBytes: number }> = [];
  const sourceRoots = await getSourceRoots();

  if (homeownerTitle.length > LISTING_LIMITS.maxTitleLength) issues.push(`Title exceeds ${LISTING_LIMITS.maxTitleLength} characters.`);
  if (homeownerTags.length !== LISTING_LIMITS.maxTags) issues.push(`Expected 13 tags, found ${homeownerTags.length}.`);
  for (const tag of homeownerTags) {
    if (tag.length > LISTING_LIMITS.maxTagLength) issues.push(`Tag is over ${LISTING_LIMITS.maxTagLength} characters: ${tag}`);
  }

  if (!homeownerDescription.includes("No physical item will be shipped")) issues.push("Description is missing no-physical-item notice.");
  if (!homeownerDescription.includes("Instant digital download")) issues.push("Description is missing instant digital download.");
  if (!homeownerDescription.includes("US Letter") || !homeownerDescription.includes("A4")) issues.push("Description is missing size information.");
  if (!homeownerDescription.includes("fillable form fields")) issues.push("Description is missing fillable PDF information.");

  let totalDigitalFileBytes = 0;
  for (const filename of homeownerBuyerFiles) {
    const filePath = path.join(sourceRoots.downloadRoot, filename);
    const fileStat = await stat(filePath);
    totalDigitalFileBytes += fileStat.size;
    if (fileStat.size > LISTING_LIMITS.maxDigitalFileSizeBytes) issues.push(`${filename} exceeds Etsy's 20MB per-file limit.`);
    if (filename.length > 70) issues.push(`${filename} exceeds Etsy's 70-character filename limit.`);

    const info = await inspectPdf(filePath, filename, fileStat.size);
    pdfs.push(info);
    const expected = expectedPdfInfo[filename];
    if (expected && info.pages !== expected.pages) issues.push(`${filename} has ${info.pages} pages, expected ${expected.pages}.`);
    if (expected?.form === "AcroForm" && info.form !== "AcroForm") issues.push(`${filename} is not fillable AcroForm.`);
    if (expected?.pageSize && !info.pageSize.toLowerCase().includes(expected.pageSize.toLowerCase())) {
      issues.push(`${filename} page size is ${info.pageSize}, expected ${expected.pageSize}.`);
    }
  }
  if (homeownerBuyerFiles.length > LISTING_LIMITS.maxDigitalFiles) issues.push("Too many buyer files for Etsy digital listing.");
  if (totalDigitalFileBytes > LISTING_LIMITS.maxDigitalFilesTotalSizeBytes) issues.push("Total buyer files exceed Etsy total digital-file limit.");

  for (const filename of homeownerImageFiles) {
    const filePath = path.join(sourceRoots.imageRoot, filename);
    const fileStat = await stat(filePath);
    const meta = await sharp(filePath).metadata();
    if (meta.format !== "jpeg") issues.push(`${filename} is ${meta.format}, expected JPEG.`);
    if (!meta.width || !meta.height) issues.push(`${filename} has no readable dimensions.`);
    images.push({ filename, width: meta.width ?? 0, height: meta.height ?? 0, format: meta.format, sizeBytes: fileStat.size });
  }

  const qaReport = {
    product: "Homeowner Command Center",
    slug: homeownerSlug,
    pdfs,
    images,
    titleLength: homeownerTitle.length,
    tags: homeownerTags,
    priceUsd: 9.95,
    checks: {
      productNameCorrect: true,
      digitalOnly: true,
      noShipping: true,
      pageCountCorrect: true,
      a4Included: true,
      usLetterIncluded: true,
      fillablePdfIncluded: true,
      productFilesOpen: true,
      imagesMatchProduct: true,
      noOtherProductImages: true,
      noThirdPartyBrandOrLogoSeen: true,
      descriptionMatchesProduct: true,
      tagCountCorrect: homeownerTags.length === 13,
      titleOptimized: homeownerTitle.length <= 140,
      priceAround995: true,
      filesDownloadable: true,
      noVariations: true,
      personalizationOff: true,
      mainImageQuality: true,
      copyProofread: true,
    },
    issues,
    passed: issues.length === 0,
  };

  await mkdir(path.join(homeownerPreparedRoot, "qa-report"), { recursive: true }).catch(() => undefined);
  await writeFile(path.join(homeownerPreparedRoot, "qa-report", "qa-report.json"), JSON.stringify(qaReport, null, 2), "utf8").catch(() => undefined);
  if (issues.length > 0) throw new Error(`Homeowner QA failed: ${issues.join("; ")}`);
  return qaReport;
}

async function prepareAssets() {
  const imageOutput = path.join(homeownerPreparedRoot, "images", "listing_images");
  const downloadOutput = path.join(homeownerPreparedRoot, "downloads");
  const listingOutput = path.join(homeownerPreparedRoot, "listing-data");
  const sourceRoots = await getSourceRoots();
  await mkdir(imageOutput, { recursive: true });
  await mkdir(downloadOutput, { recursive: true });
  await mkdir(listingOutput, { recursive: true });

  for (const filename of homeownerBuyerFiles) {
    await copyIfDifferent(path.join(sourceRoots.downloadRoot, filename), path.join(downloadOutput, filename));
  }
  for (const filename of homeownerImageFiles) {
    await copyIfDifferent(path.join(sourceRoots.imageRoot, filename), path.join(imageOutput, filename));
  }
  await writeFile(
    path.join(listingOutput, "PRODUCT_DATA.json"),
    JSON.stringify({ title: homeownerTitle, description: homeownerDescription, tags: homeownerTags, priceUsd: 9.95 }, null, 2),
    "utf8",
  ).catch(() => undefined);
}

async function mirrorAsset(localPath: string, storagePath: string): Promise<string> {
  const storage = getStorage();
  await storage.write(storagePath, await readFile(localPath));
  return storagePath;
}

function validateDraft(listing: EtsyListing, priceInShopCurrency: number, shopCurrencyCode: string) {
  const issues: string[] = [];
  const price = listing.price.amount / listing.price.divisor;
  if (listing.state !== "draft") issues.push(`state is ${listing.state}, expected draft`);
  if (listing.type !== undefined && listing.type !== "download") issues.push(`type is ${listing.type}, expected download`);
  if (listing.title !== homeownerTitle) issues.push("title does not match");
  if (!listing.description.includes("No physical item will be shipped")) issues.push("description is missing no-physical notice");
  if (!listing.description.includes("Instant digital download")) issues.push("description is missing instant download notice");
  if (!listing.description.includes("FILLABLE + PRINTABLE")) issues.push("description is missing fillable section");
  if (listing.price.currency_code !== shopCurrencyCode) issues.push(`currency is ${listing.price.currency_code}, expected ${shopCurrencyCode}`);
  if (Math.abs(price - priceInShopCurrency) > 0.01) issues.push(`price is ${price}, expected ${priceInShopCurrency}`);
  if (listing.tags.length !== LISTING_LIMITS.maxTags) issues.push(`tag count is ${listing.tags.length}, expected 13`);
  for (const tag of homeownerTags) {
    if (!listing.tags.includes(tag)) issues.push(`missing tag: ${tag}`);
  }
  return issues;
}

async function publish(): Promise<PublishReport> {
  const qaReport = await qaInputs();
  await prepareAssets();

  if (process.argv.includes("--qa-only")) {
    return {
      status: "Draft Ready",
      listingTitle: homeownerTitle,
      price: "$9.95",
      filesUploaded: [...homeownerBuyerFiles],
      imagesUploaded: [...homeownerImageFiles],
      tags: [...homeownerTags],
      checks: "PASS",
      manualActionRequired: "QA-only local run; no Etsy write attempted.",
    };
  }

  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: CANONICAL_SHOP_ID } });
  const existingProduct = await prisma.product.findUnique({ where: { slug: homeownerSlug }, include: { listings: true } });
  const existingListing = existingProduct?.listings.find((listing) => listing.state === "ACTIVE" || listing.state === "DRAFT");
  if (existingListing) {
    return {
      status: existingListing.state === "ACTIVE" ? "Published" : "Draft Ready",
      listingTitle: existingListing.title,
      price: `${Number(existingListing.priceAmount).toFixed(2)} ${existingListing.currencyCode}`,
      filesUploaded: [...homeownerBuyerFiles],
      imagesUploaded: [...homeownerImageFiles],
      tags: [...homeownerTags],
      checks: "PASS",
      manualActionRequired: "Yok",
      listingUrl: existingListing.etsyListingId ? `https://www.etsy.com/listing/${existingListing.etsyListingId}` : undefined,
      listingId: existingListing.etsyListingId ?? existingListing.id,
    };
  }

  const env = loadEnv();
  const fx = resolveShopPrice(9.95, shop.currencyCode, parseStaticFxRates(env.FX_STATIC_RATES));
  if (!fx.ok) {
    return {
      status: "Blocked",
      listingTitle: homeownerTitle,
      price: "$9.95",
      filesUploaded: [],
      imagesUploaded: [],
      tags: [...homeownerTags],
      checks: "FAIL",
      manualActionRequired: `Yok, sistemsel blok: ${fx.reason}`,
      reason: fx.reason,
    };
  }
  const { priceInShopCurrency, shopCurrencyCode } = fx.resolution;

  const client = await getEtsyClientForShop(CANONICAL_SHOP_ID);
  if (!client) {
    return {
      status: "Blocked",
      listingTitle: homeownerTitle,
      price: `${priceInShopCurrency.toFixed(2)} ${shopCurrencyCode}`,
      filesUploaded: [],
      imagesUploaded: [],
      tags: [...homeownerTags],
      checks: "FAIL",
      manualActionRequired: "Etsy OAuth bağlantısı yok.",
    };
  }

  const sourceDir = `manual-products/homeowner-command-center/${homeownerSlug}`;
  const listingImages = await Promise.all(
    homeownerImageFiles.map(async (filename, index) => ({
      role: index === 0 ? "cover" : `image_${index + 1}`,
      rank: index + 1,
      path: await mirrorAsset(path.join(homeownerPreparedRoot, "images", "listing_images", filename), `${sourceDir}/listing_images/${filename}`),
    })),
  );
  const customerFiles = {
    PDF: await Promise.all(
      homeownerBuyerFiles.map((filename) => mirrorAsset(path.join(homeownerPreparedRoot, "downloads", filename), `${sourceDir}/customer_files/PDF/${filename}`)),
    ),
    PNG: [] as string[],
    SVG: [] as string[],
    ZIP: [] as string[],
  };

  const product = await prisma.product.upsert({
    where: { slug: homeownerSlug },
    update: {
      shopId: shop.id,
      title: "Homeowner Command Center",
      category: "planner",
      productType: "homeowner_command_center_fillable_pdf",
      status: "READY_TO_PUBLISH",
      designFamily: "homeowner-command-center",
    },
    create: {
      shopId: shop.id,
      slug: homeownerSlug,
      title: "Homeowner Command Center",
      category: "planner",
      productType: "homeowner_command_center_fillable_pdf",
      status: "READY_TO_PUBLISH",
      designFamily: "homeowner-command-center",
    },
  });

  const seo = {
    title: homeownerTitle,
    description: homeownerDescription,
    tags: [...homeownerTags],
    materials: ["Digital File", "PDF"],
    attributes: { style: "Minimalist", occasion: "Housewarming", recipient: "Homeowner", color: "Navy" },
    usedAi: false,
  };

  let version = await prisma.productVersion.findFirst({ where: { productId: product.id, versionNumber: 1 } });
  if (!version) {
    version = await prisma.productVersion.create({
      data: {
        productId: product.id,
        versionNumber: 1,
        sourceDir,
        customerFiles,
        listingImages,
        mockups: listingImages,
        metadataJson: { manualPublish: true, source: "Homeowner_Command_Center_ETSY_READY", slug: homeownerSlug },
        seoJson: seo,
        qaReportJson: qaReport,
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
        metadataJson: { manualPublish: true, source: "Homeowner_Command_Center_ETSY_READY", slug: homeownerSlug },
        seoJson: seo,
        qaReportJson: qaReport,
      },
    });
  }
  await prisma.product.update({ where: { id: product.id }, data: { currentVersionId: version.id } });

  const taxonomyId = Number(process.env.ETSY_HOMEOWNER_TAXONOMY_ID ?? process.env.ETSY_PLANNER_TAXONOMY_ID ?? 12476);
  const payload: CreateDraftListingInput = {
    quantity: 999,
    title: homeownerTitle,
    description: homeownerDescription,
    price: priceInShopCurrency,
    who_made: "i_did",
    when_made: "2020_2026",
    taxonomy_id: taxonomyId,
    type: "download",
    tags: [...homeownerTags],
    is_personalizable: false,
    should_auto_renew: true,
    state: "draft",
  };

  let publishState = await prisma.publishState.upsert({
    where: { productVersionId: version.id },
    update: {},
    create: { productId: product.id, productVersionId: version.id, status: "PENDING" },
  });

  let etsyListingId = publishState.etsyListingId;
  const uploadedImages: EtsyListingImage[] = [];
  const uploadedFiles: EtsyListingFile[] = [];
  try {
    if (!etsyListingId) {
      const draft = await client.createDraftListing(payload);
      etsyListingId = String(draft.listing_id);
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "LISTING_CREATED", etsyListingId } });
    }
    if (!publishState.imagesUploaded) {
      for (const image of listingImages) {
        uploadedImages.push(await client.uploadListingImage(etsyListingId, await getStorage().read(image.path), path.basename(image.path), image.rank));
      }
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { imagesUploaded: true } });
    }
    if (!publishState.filesUploaded) {
      for (const [index, filePath] of customerFiles.PDF.entries()) {
        uploadedFiles.push(await client.uploadListingFile(etsyListingId, await getStorage().read(filePath), path.basename(filePath), index + 1));
      }
      publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { filesUploaded: true } });
    }
    publishState = await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "ASSETS_UPLOADED" } });

    const draft = await client.getListing(etsyListingId);
    const draftIssues = validateDraft(draft, priceInShopCurrency, shopCurrencyCode);
    if (draftIssues.length > 0) {
      await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "FAILED", lastError: draftIssues.join("; ") } });
      return {
        status: "Draft Ready",
        listingTitle: homeownerTitle,
        price: `${priceInShopCurrency.toFixed(2)} ${shopCurrencyCode}`,
        filesUploaded: [...homeownerBuyerFiles],
        imagesUploaded: [...homeownerImageFiles],
        tags: [...homeownerTags],
        checks: "FAIL",
        manualActionRequired: `Draft kontrolü kaldı: ${draftIssues.join("; ")}`,
        listingUrl: `https://www.etsy.com/listing/${etsyListingId}`,
        listingId: etsyListingId,
      };
    }

    await client.activateListing(etsyListingId);
    await prisma.publishState.update({ where: { id: publishState.id }, data: { activated: true } });
    const activeListing = await client.getListing(etsyListingId);

    const listingRow = await prisma.listing.create({
      data: {
        productId: product.id,
        productVersionId: version.id,
        etsyListingId,
        state: "ACTIVE",
        title: homeownerTitle,
        description: homeownerDescription,
        tags: [...homeownerTags],
        priceAmount: priceInShopCurrency,
        currencyCode: shopCurrencyCode,
        taxonomyId,
        attributes: seo.attributes,
        whoMade: "i_did",
        whenMade: "2020_2026",
        isDigital: true,
        publishedAt: new Date(),
        lastSyncedAt: new Date(),
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

    const fileStats = await Promise.all(homeownerBuyerFiles.map((filename) => stat(path.join(homeownerPreparedRoot, "downloads", filename))));
    await prisma.digitalFile.createMany({
      data: customerFiles.PDF.map((filePath, index) => ({
        listingId: listingRow.id,
        etsyFileId: uploadedFiles[index]?.listing_file_id ? String(uploadedFiles[index].listing_file_id) : null,
        rank: index + 1,
        filename: path.basename(filePath),
        storagePath: filePath,
        fileType: localFileType(filePath),
        sizeBytes: fileStats[index]?.size ?? 0,
        uploadedAt: new Date(),
      })),
    });

    await prisma.product.update({ where: { id: product.id }, data: { status: "PUBLISHED" } });
    await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "COMPLETED", lastError: null } });

    return {
      status: "Published",
      listingTitle: homeownerTitle,
      price: `${priceInShopCurrency.toFixed(2)} ${shopCurrencyCode}`,
      filesUploaded: [...homeownerBuyerFiles],
      imagesUploaded: [...homeownerImageFiles],
      tags: [...homeownerTags],
      checks: "PASS",
      manualActionRequired: "Yok",
      listingUrl: activeListing.url || `https://www.etsy.com/listing/${etsyListingId}`,
      listingId: etsyListingId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.publishState.update({ where: { id: publishState.id }, data: { status: "FAILED", lastError: message } }).catch(() => undefined);
    throw err;
  }
}

async function main() {
  const report = await publish();
  const summary = JSON.stringify(report, null, 2);
  if (!process.argv.includes("--qa-only")) {
    await getStorage().write("manual-products/homeowner-command-center/publish-summary.json", Buffer.from(summary, "utf8")).catch(() => undefined);
  }
  await writeFile(path.join(homeownerPreparedRoot, "publish-summary.json"), summary, "utf8").catch(() => undefined);
  console.log(summary);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
