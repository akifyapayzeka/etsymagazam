import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import { inputRoot, listingImageNames, preparedRoot, productSources, type ProductData } from "./tshirt-products.ts";

type QaIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  location: string;
};

type QaProductReport = {
  slug: string;
  productName: string;
  buyerZip: {
    filename: string;
    sizeBytes: number;
    entries: string[];
    png: {
      filename: string;
      width: number;
      height: number;
      hasAlpha: boolean;
      hasTransparentPixels: boolean;
      density?: number;
    };
  };
  listingImages: Array<{ filename: string; width: number; height: number; format?: string; sizeBytes: number }>;
  titleLength: number;
  tagCount: number;
  tags: string[];
  priceTry: number;
  trademarkReview: {
    phrase: string;
    decision: "APPROVED_FOR_PUBLISH" | "HOLD";
    note: string;
  };
  issues: QaIssue[];
  passed: boolean;
};

const allowedFilename = /^[a-zA-Z0-9._-]+$/;

const trademarkReviewByPhrase: Record<string, QaProductReport["trademarkReview"]> = {
  "No Rush Club": {
    phrase: "No Rush Club",
    decision: "APPROVED_FOR_PUBLISH",
    note: "Manual current web/USPTO-oriented search found marketplace phrase use, but no obvious active exact apparel trademark conflict or third-party logo issue.",
  },
  "Low Battery Society": {
    phrase: "Low Battery Society",
    decision: "APPROVED_FOR_PUBLISH",
    note: "Manual current web/USPTO-oriented search found broad low-battery apparel phrase use, but no obvious active exact apparel trademark conflict or third-party logo issue.",
  },
  "Midnight Snack Club": {
    phrase: "Midnight Snack Club",
    decision: "APPROVED_FOR_PUBLISH",
    note: "Manual current web/USPTO-oriented search found marketplace phrase use, but no obvious active exact apparel trademark conflict or third-party logo issue.",
  },
  "Offline Adventure": {
    phrase: "Offline Adventure",
    decision: "APPROVED_FOR_PUBLISH",
    note: "Manual current web/USPTO-oriented search found no obvious active exact apparel trademark conflict or third-party logo issue.",
  },
  "Coffee Before Chaos": {
    phrase: "Coffee Before Chaos",
    decision: "APPROVED_FOR_PUBLISH",
    note: "Manual current web/USPTO-oriented search found marketplace phrase use, but no obvious active exact apparel trademark conflict or third-party logo issue.",
  },
};

function addIssue(issues: QaIssue[], code: string, severity: QaIssue["severity"], message: string, location: string) {
  issues.push({ code, severity, message, location });
}

function includesAny(text: string, needles: string[]): boolean {
  const normalized = text.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function validateBuyerZip(zipPath: string, expectedZipName: string, issues: QaIssue[]) {
  const zipStats = await stat(zipPath);
  if (zipStats.size > LISTING_LIMITS.maxDigitalFileSizeBytes) {
    addIssue(
      issues,
      "ETSY_FILE_LIMIT_EXCEEDED",
      "error",
      `${expectedZipName} is ${zipStats.size} bytes, above Etsy's 20MB per-file limit.`,
      expectedZipName,
    );
  }
  if (expectedZipName.length > 70 || !allowedFilename.test(expectedZipName)) {
    addIssue(issues, "ETSY_FILENAME_INVALID", "error", `${expectedZipName} does not satisfy Etsy filename constraints.`, expectedZipName);
  }

  const zipBuffer = await readFile(zipPath);
  const zip = await JSZip.loadAsync(zipBuffer);
  const fileEntries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (fileEntries.length === 0) {
    addIssue(issues, "ZIP_EMPTY", "error", `${expectedZipName} has no files.`, expectedZipName);
  }

  const entries: string[] = [];
  for (const entry of fileEntries) {
    entries.push(entry.name);
    await entry.async("nodebuffer");
  }

  const pngEntries = fileEntries.filter((entry) => entry.name.toLowerCase().endsWith(".png"));
  if (pngEntries.length !== 1) {
    addIssue(issues, "PNG_COUNT_INVALID", "error", `${expectedZipName} should contain exactly one PNG, found ${pngEntries.length}.`, expectedZipName);
  }

  const pngEntry = pngEntries[0];
  if (!pngEntry) {
    throw new Error(`${expectedZipName} does not contain a PNG, cannot continue technical QA.`);
  }

  const pngBuffer = await pngEntry.async("nodebuffer");
  const meta = await sharp(pngBuffer).metadata();
  const raw = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels = raw.info.channels;
  let hasTransparentPixels = false;
  for (let i = channels - 1; i < raw.data.length; i += channels) {
    if (raw.data[i] < 255) {
      hasTransparentPixels = true;
      break;
    }
  }

  if (meta.width !== 4500 || meta.height !== 5400) {
    addIssue(issues, "PNG_DIMENSIONS_INVALID", "error", `${pngEntry.name} is ${meta.width}x${meta.height}, expected 4500x5400.`, pngEntry.name);
  }
  if (!meta.hasAlpha) {
    addIssue(issues, "PNG_ALPHA_MISSING", "error", `${pngEntry.name} has no alpha channel.`, pngEntry.name);
  }
  if (!hasTransparentPixels) {
    addIssue(issues, "PNG_TRANSPARENCY_MISSING", "error", `${pngEntry.name} has an alpha channel but no transparent pixels.`, pngEntry.name);
  }
  if (meta.density !== undefined && Math.round(meta.density) < 300) {
    addIssue(issues, "PNG_DPI_BELOW_CLAIM", "error", `${pngEntry.name} density is ${meta.density}, below the 300 DPI claim.`, pngEntry.name);
  }

  return {
    filename: expectedZipName,
    sizeBytes: zipStats.size,
    entries,
    png: {
      filename: pngEntry.name,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      hasAlpha: meta.hasAlpha === true,
      hasTransparentPixels,
      density: meta.density,
    },
  };
}

async function validateListingImages(productDir: string, data: ProductData, issues: QaIssue[]) {
  const listingDir = path.join(productDir, "seller_listing_kit");
  const result: QaProductReport["listingImages"] = [];

  for (const imageName of listingImageNames) {
    const imagePath = path.join(listingDir, imageName);
    const imageStats = await stat(imagePath);
    const meta = await sharp(await readFile(imagePath)).metadata();
    if (!meta.width || !meta.height) {
      addIssue(issues, "LISTING_IMAGE_INVALID", "error", `${imageName} has no readable dimensions.`, imageName);
    }
    if (meta.format !== "jpeg") {
      addIssue(issues, "LISTING_IMAGE_NOT_JPEG", "error", `${imageName} is ${meta.format}, expected JPEG.`, imageName);
    }
    result.push({ filename: imageName, width: meta.width ?? 0, height: meta.height ?? 0, format: meta.format, sizeBytes: imageStats.size });
  }

  if (data.listing_images.length !== listingImageNames.length) {
    addIssue(issues, "LISTING_IMAGE_METADATA_COUNT_INVALID", "warning", "PRODUCT_DATA listing_images does not list five images.", "PRODUCT_DATA.json");
  }

  return result;
}

function validateCopy(source: { phrase: string }, data: ProductData, copyText: string, issues: QaIssue[]) {
  if (!data.digital_product || data.physical_item) {
    addIssue(issues, "DIGITAL_FLAGS_INVALID", "error", "PRODUCT_DATA flags do not mark this as digital-only.", "PRODUCT_DATA.json");
  }
  if (data.buyer_file.length > 70 || !allowedFilename.test(data.buyer_file)) {
    addIssue(issues, "BUYER_FILE_NAME_INVALID", "error", `Buyer filename is not Etsy-safe: ${data.buyer_file}`, "PRODUCT_DATA.json");
  }
  if (data.suggested_title.length > LISTING_LIMITS.maxTitleLength) {
    addIssue(issues, "TITLE_TOO_LONG", "error", `Title is ${data.suggested_title.length} characters, Etsy max is 140.`, "PRODUCT_DATA.json");
  }
  if (data.tags.length !== LISTING_LIMITS.maxTags) {
    addIssue(issues, "TAG_COUNT_INVALID", "error", `Expected 13 tags, found ${data.tags.length}.`, "PRODUCT_DATA.json");
  }
  for (const tag of data.tags) {
    if (tag.length > LISTING_LIMITS.maxTagLength) {
      addIssue(issues, "TAG_TOO_LONG", "error", `Tag "${tag}" is ${tag.length} characters, Etsy max is 20.`, "PRODUCT_DATA.json");
    }
  }

  const combinedCopy = `${data.suggested_title}\n${data.description}\n${copyText}`;
  if (!includesAny(combinedCopy, [source.phrase, data.product_name])) {
    addIssue(issues, "PRODUCT_IDENTITY_MISMATCH", "error", "Listing copy/title does not match the expected product phrase.", "PRODUCT_DATA.json");
  }
  if (!includesAny(combinedCopy, ["digital download", "instant digital download"])) {
    addIssue(issues, "DIGITAL_DOWNLOAD_TEXT_MISSING", "error", "Listing copy does not clearly say digital download.", "ETSY_LISTING_COPY.txt");
  }
  if (!includesAny(combinedCopy, ["no physical product", "no t-shirt or other physical item", "no physical item"])) {
    addIssue(issues, "NO_PHYSICAL_TEXT_MISSING", "error", "Listing copy does not clearly say no physical item is included.", "ETSY_LISTING_COPY.txt");
  }
  if (!includesAny(combinedCopy, ["ai disclosure", "ai-assisted"])) {
    addIssue(issues, "AI_DISCLOSURE_MISSING", "error", "AI disclosure is missing.", "ETSY_LISTING_COPY.txt");
  }
}

async function prepareAssets(source: (typeof productSources)[number], data: ProductData, report: QaProductReport) {
  const productDir = path.join(inputRoot, source.inputDir);
  const outputDir = path.join(preparedRoot, source.slug);
  const imageOutputDir = path.join(outputDir, "images", "listing_images");
  const downloadOutputDir = path.join(outputDir, "downloads");
  const listingDataOutputDir = path.join(outputDir, "listing-data");
  const qaOutputDir = path.join(outputDir, "qa-report");

  await mkdir(imageOutputDir, { recursive: true });
  await mkdir(downloadOutputDir, { recursive: true });
  await mkdir(listingDataOutputDir, { recursive: true });
  await mkdir(qaOutputDir, { recursive: true });

  await copyFile(path.join(productDir, data.buyer_file), path.join(downloadOutputDir, data.buyer_file));
  for (const imageName of listingImageNames) {
    await copyFile(path.join(productDir, "seller_listing_kit", imageName), path.join(imageOutputDir, imageName));
  }

  await writeFile(path.join(listingDataOutputDir, "PRODUCT_DATA.json"), JSON.stringify(data, null, 2), "utf8");
  await copyFile(path.join(productDir, "seller_listing_kit", "ETSY_LISTING_COPY.txt"), path.join(listingDataOutputDir, "ETSY_LISTING_COPY.txt"));
  await writeFile(path.join(qaOutputDir, "qa-report.json"), JSON.stringify(report, null, 2), "utf8");
}

async function qaProduct(source: (typeof productSources)[number]): Promise<QaProductReport> {
  const productDir = path.join(inputRoot, source.inputDir);
  const sellerDir = path.join(productDir, "seller_listing_kit");
  const data = await readJson<ProductData>(path.join(sellerDir, "PRODUCT_DATA.json"));
  const copyText = await readFile(path.join(sellerDir, "ETSY_LISTING_COPY.txt"), "utf8");
  const issues: QaIssue[] = [];

  if (data.buyer_file !== source.expectedBuyerZip) {
    addIssue(issues, "BUYER_FILE_MISMATCH", "error", `PRODUCT_DATA buyer_file is ${data.buyer_file}, expected ${source.expectedBuyerZip}.`, "PRODUCT_DATA.json");
  }

  validateCopy(source, data, copyText, issues);

  const buyerZip = await validateBuyerZip(path.join(productDir, source.expectedBuyerZip), source.expectedBuyerZip, issues);
  const listingImages = await validateListingImages(productDir, data, issues);
  const trademarkReview = trademarkReviewByPhrase[source.phrase];
  if (!trademarkReview || trademarkReview.decision !== "APPROVED_FOR_PUBLISH") {
    addIssue(issues, "TRADEMARK_HOLD", "error", `Trademark review requires hold for ${source.phrase}.`, source.phrase);
  }

  const report: QaProductReport = {
    slug: source.slug,
    productName: data.product_name,
    buyerZip,
    listingImages,
    titleLength: data.suggested_title.length,
    tagCount: data.tags.length,
    tags: data.tags,
    priceTry: data.suggested_price_try,
    trademarkReview,
    issues,
    passed: issues.every((issue) => issue.severity !== "error"),
  };

  if (report.passed) {
    await prepareAssets(source, data, report);
  }

  return report;
}

async function main() {
  const reports: QaProductReport[] = [];
  for (const source of productSources) {
    reports.push(await qaProduct(source));
  }

  await mkdir(preparedRoot, { recursive: true });
  await writeFile(path.join(preparedRoot, "qa-summary.json"), JSON.stringify(reports, null, 2), "utf8");

  const failed = reports.filter((report) => !report.passed);
  console.log(JSON.stringify(reports, null, 2));
  if (failed.length > 0) {
    throw new Error(`T-shirt QA failed for ${failed.map((report) => report.slug).join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
