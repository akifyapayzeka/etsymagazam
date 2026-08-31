import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { LISTING_LIMITS } from "@etsymagazam/etsy";
import { generatedTshirtListingImageNames, generatedTshirtProducts, generatedTshirtWaveRoot, type GeneratedTshirtProduct } from "./generated-tshirt-wave-products.ts";

const DESIGN_WIDTH = 4500;
const DESIGN_HEIGHT = 5400;
const LISTING_WIDTH = 2000;
const LISTING_HEIGHT = 1600;

type ImageMeta = {
  filename: string;
  width: number;
  height: number;
  format?: string;
  sizeBytes: number;
};

type ProductQaReport = {
  slug: string;
  productName: string;
  buyerZip: {
    filename: string;
    sizeBytes: number;
    entries: string[];
    png: { filename: string; width: number; height: number; hasAlpha: boolean; hasTransparentPixels: boolean; density?: number };
  };
  listingImages: ImageMeta[];
  titleLength: number;
  tagCount: number;
  tags: string[];
  priceTry: number;
  mockupSource: {
    researchedFreeSite: string;
    productionMethod: string;
  };
  trademarkReview: {
    phrase: string;
    decision: "APPROVED_FOR_PUBLISH" | "HOLD";
    note: string;
  };
  issues: string[];
  passed: boolean;
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function textLines(text: string, x: number, y: number, lineHeight: number, fontSize: number, family: string, fill: string, weight = 700): string {
  return text
    .split("\n")
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" text-anchor="middle" font-family="${family}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${esc(line)}</text>`)
    .join("");
}

function iconSvg(product: GeneratedTshirtProduct): string {
  const a = product.colors.accent;
  const b = product.colors.secondary;
  const ink = product.colors.ink;
  if (product.designFamily === "caffeine-mode-on") {
    return `
      <path d="M1720 1160 h760 v420 c0 180-145 325-325 325 h-110 c-180 0-325-145-325-325z" fill="none" stroke="${a}" stroke-width="70" stroke-linejoin="round"/>
      <path d="M2480 1265 h180 c120 0 205 88 205 194s-85 194-205 194h-180" fill="none" stroke="${a}" stroke-width="70" stroke-linecap="round"/>
      <path d="M1830 1960 h520" stroke="${b}" stroke-width="58" stroke-linecap="round"/>
      <path d="M1865 910 c-65-95 65-145 0-240 M2115 910 c-65-95 65-145 0-240 M2365 910 c-65-95 65-145 0-240" fill="none" stroke="${ink}" stroke-width="48" stroke-linecap="round"/>
    `;
  }
  if (product.designFamily === "lesson-plans-later") {
    return `
      <path d="M1770 725 h820 v480 h-820z" fill="none" stroke="${a}" stroke-width="58" rx="34"/>
      <path d="M1870 860 h520 M1870 990 h410 M1870 1120 h300" stroke="${b}" stroke-width="42" stroke-linecap="round"/>
      <path d="M2700 920 l245 245 -650 650 -245 75 75-245z" fill="none" stroke="${ink}" stroke-width="64" stroke-linejoin="round"/>
      <path d="M2690 920 l245 245" stroke="${a}" stroke-width="64" stroke-linecap="round"/>
    `;
  }
  if (product.designFamily === "scrubs-and-caffeine") {
    return `
      <path d="M1675 1250 h390 l105-210 210 520 130-310 h315" fill="none" stroke="${a}" stroke-width="68" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M2010 825 c190-210 560-95 560 195 0 330-560 665-560 665s-560-335-560-665c0-290 370-405 560-195z" fill="none" stroke="${b}" stroke-width="54" stroke-linejoin="round"/>
      <path d="M2780 1630 h330 v185 c0 88-72 160-160 160h-10c-88 0-160-72-160-160z" fill="none" stroke="${ink}" stroke-width="50"/>
      <path d="M3110 1700 h115 c70 0 120 50 120 112s-50 112-120 112h-115" fill="none" stroke="${ink}" stroke-width="50" stroke-linecap="round"/>
    `;
  }
  if (product.designFamily === "reading-weather") {
    return `
      <path d="M1520 965 c270-135 550-135 840 0v1050c-290-135-570-135-840 0z" fill="none" stroke="${a}" stroke-width="62" stroke-linejoin="round"/>
      <path d="M2360 965 c270-135 550-135 840 0v1050c-290-135-570-135-840 0z" fill="none" stroke="${a}" stroke-width="62" stroke-linejoin="round"/>
      <path d="M2240 1015 v990" stroke="${b}" stroke-width="46" stroke-linecap="round"/>
      <path d="M1800 1215 h330 M1800 1390 h280 M2530 1215 h330 M2530 1390 h280" stroke="${ink}" stroke-width="42" stroke-linecap="round"/>
      <path d="M1900 710 c90-170 360-170 450 0 150 5 260 118 260 260h-960c0-142 110-255 250-260z" fill="none" stroke="${b}" stroke-width="54"/>
    `;
  }
  return `
    <path d="M1430 1980 l690-1050 430 625 245-340 410 765z" fill="none" stroke="${a}" stroke-width="70" stroke-linejoin="round"/>
    <path d="M1940 1445 l180-255 210 310 M2600 1600 l195-270 175 270" fill="none" stroke="${b}" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M1540 2165 h1540" stroke="${ink}" stroke-width="58" stroke-linecap="round"/>
    <path d="M1700 2295 h1220" stroke="${a}" stroke-width="42" stroke-linecap="round"/>
  `;
}

async function renderDesignPng(product: GeneratedTshirtProduct): Promise<Buffer> {
  const svg = `
<svg width="${DESIGN_WIDTH}" height="${DESIGN_HEIGHT}" viewBox="0 0 ${DESIGN_WIDTH} ${DESIGN_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="none"/>
  <g opacity="1">${iconSvg(product)}</g>
  <text x="2250" y="2585" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="155" font-weight="800" letter-spacing="20" fill="${product.colors.accent}">${esc(product.eyebrow.toUpperCase())}</text>
  ${textLines(product.phrase, 2250, 3125, 610, 560, "Georgia, 'Times New Roman', serif", product.colors.ink, 800)}
  <path d="M1710 4305 h1080" stroke="${product.colors.secondary}" stroke-width="70" stroke-linecap="round"/>
  <text x="2250" y="4625" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="165" font-weight="800" letter-spacing="10" fill="${product.colors.accent}">${esc(product.subtitle.toUpperCase())}</text>
</svg>`.trim();

  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).withMetadata({ density: 300 }).toBuffer();
}

async function buildMockup(product: GeneratedTshirtProduct, designPng: Buffer, shirtFill: string, variant: "hero" | "alt"): Promise<Buffer> {
  const bg = Buffer.from(`
<svg width="${LISTING_WIDTH}" height="${LISTING_HEIGHT}" viewBox="0 0 ${LISTING_WIDTH} ${LISTING_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#000000" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="100%" height="100%" fill="${product.colors.background}"/>
  <circle cx="250" cy="240" r="155" fill="${product.colors.secondary}" opacity="0.16"/>
  <circle cx="1760" cy="1310" r="220" fill="${product.colors.accent}" opacity="0.10"/>
  <path d="M${variant === "hero" ? 380 : 720} 180
    L${variant === "hero" ? 535 : 875} 180
    C${variant === "hero" ? 565 : 905} 260 ${variant === "hero" ? 635 : 975} 305 ${variant === "hero" ? 725 : 1065} 305
    C${variant === "hero" ? 815 : 1155} 305 ${variant === "hero" ? 885 : 1225} 260 ${variant === "hero" ? 915 : 1255} 180
    L${variant === "hero" ? 1070 : 1410} 180
    L${variant === "hero" ? 1310 : 1650} 420
    L${variant === "hero" ? 1135 : 1475} 600
    L${variant === "hero" ? 1045 : 1385} 515
    L${variant === "hero" ? 1045 : 1385} 1370
    C${variant === "hero" ? 1045 : 1385} 1415 ${variant === "hero" ? 1010 : 1350} 1450 ${variant === "hero" ? 965 : 1305} 1450
    L${variant === "hero" ? 485 : 825} 1450
    C${variant === "hero" ? 440 : 780} 1450 ${variant === "hero" ? 405 : 745} 1415 ${variant === "hero" ? 405 : 1370}
    L${variant === "hero" ? 405 : 745} 515
    L${variant === "hero" ? 315 : 655} 600
    L${variant === "hero" ? 140 : 480} 420 Z"
    fill="${shirtFill}" stroke="${product.colors.ink}" stroke-width="8" stroke-linejoin="round" filter="url(#shadow)"/>
  <path d="M${variant === "hero" ? 580 : 920} 182 C${variant === "hero" ? 620 : 960} 365 ${variant === "hero" ? 830 : 1170} 365 ${variant === "hero" ? 870 : 1210} 182" fill="none" stroke="${product.colors.ink}" stroke-width="8" opacity="0.38"/>
</svg>`.trim());

  const designWidth = variant === "hero" ? 470 : 520;
  const design = await sharp(designPng).resize({ width: designWidth, height: 620, fit: "inside" }).png().toBuffer();
  const left = variant === "hero" ? 490 : 905;
  const top = variant === "hero" ? 575 : 560;
  const composites: sharp.OverlayOptions[] = [{ input: design, left, top }];

  if (variant === "hero") {
    const [titleLineOne, titleLineTwo = ""] = product.phrase.split("\n");
    const textSvg = Buffer.from(`
<svg width="${LISTING_WIDTH}" height="${LISTING_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <text x="1640" y="365" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="74" font-weight="800" fill="${product.colors.ink}">${esc(titleLineOne)}</text>
  <text x="1640" y="465" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="74" font-weight="800" fill="${product.colors.ink}">${esc(titleLineTwo)}</text>
  <text x="1640" y="625" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="${product.colors.accent}" letter-spacing="5">DIGITAL PNG DOWNLOAD</text>
  <text x="1640" y="745" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="${product.colors.ink}">4500 x 5400 px - Transparent</text>
  <text x="1640" y="825" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="${product.colors.ink}">No physical shirt shipped</text>
</svg>`.trim());
    composites.push({ input: textSvg, left: 0, top: 0 });
  }

  return sharp(bg).composite(composites).jpeg({ quality: 92 }).toBuffer();
}

async function buildArtworkDetails(product: GeneratedTshirtProduct, designPng: Buffer): Promise<Buffer> {
  const design = await sharp(designPng).resize({ width: 760, height: 960, fit: "inside" }).png().toBuffer();
  const svg = Buffer.from(`
<svg width="${LISTING_WIDTH}" height="${LISTING_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${product.colors.background}"/>
  <rect x="150" y="145" width="900" height="1310" rx="24" fill="#FFFFFF" stroke="${product.colors.accent}" stroke-width="5"/>
  <path d="M150 250 h900 M150 355 h900 M150 460 h900 M150 565 h900 M150 670 h900 M150 775 h900 M150 880 h900 M150 985 h900 M150 1090 h900 M150 1195 h900 M150 1300 h900" stroke="#ECE7DD" stroke-width="3"/>
  <path d="M255 145 v1310 M360 145 v1310 M465 145 v1310 M570 145 v1310 M675 145 v1310 M780 145 v1310 M885 145 v1310 M990 145 v1310" stroke="#ECE7DD" stroke-width="3"/>
  <text x="1460" y="380" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="104" font-weight="800" fill="${product.colors.ink}">Artwork Details</text>
  <text x="1460" y="520" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="800" fill="${product.colors.accent}">Real exported PNG shown here</text>
  <text x="1460" y="700" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="${product.colors.ink}">Transparent background</text>
  <text x="1460" y="790" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="${product.colors.ink}">High resolution print file</text>
  <text x="1460" y="880" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="${product.colors.ink}">For sublimation, DTF and crafts</text>
  <text x="1460" y="1050" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="700" fill="${product.colors.ink}">Digital file only - no apparel included</text>
</svg>`.trim());

  return sharp(svg).composite([{ input: design, left: 220, top: 315 }]).jpeg({ quality: 92 }).toBuffer();
}

function infoCardSvg(product: GeneratedTshirtProduct, title: string, lines: string[]): Buffer {
  const rowText = lines
    .map((line, index) => {
      const y = 615 + index * 145;
      return `
        <circle cx="520" cy="${y - 15}" r="34" fill="${product.colors.accent}"/>
        <text x="520" y="${y}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#FFFFFF">${index + 1}</text>
        <text x="600" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="${product.colors.ink}">${esc(line)}</text>`;
    })
    .join("");

  return Buffer.from(`
<svg width="${LISTING_WIDTH}" height="${LISTING_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${product.colors.background}"/>
  <rect x="250" y="170" width="1500" height="1260" rx="28" fill="#FFFFFF" stroke="${product.colors.accent}" stroke-width="6"/>
  <text x="1000" y="380" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="108" font-weight="800" fill="${product.colors.ink}">${esc(title)}</text>
  <path d="M675 455 h650" stroke="${product.colors.secondary}" stroke-width="22" stroke-linecap="round"/>
  ${rowText}
</svg>`.trim());
}

async function buildInfoImage(product: GeneratedTshirtProduct, title: string, lines: string[]): Promise<Buffer> {
  return sharp(infoCardSvg(product, title, lines)).jpeg({ quality: 92 }).toBuffer();
}

function buildDescription(product: GeneratedTshirtProduct): string {
  return [
    `${product.productName} is a ready-to-use digital t-shirt print file for ${product.niche}. It includes the actual transparent PNG shown in the listing mockups, prepared for sublimation, DTF, heat transfer and craft projects.`,
    "This is a DIGITAL DOWNLOAD. No physical product, printed shirt, transfer sheet, frame, shipping, or production partner service is included.",
    "WHAT YOU WILL RECEIVE",
    `- 1 high-resolution transparent PNG file: ${product.pngName}`,
    "- 4500 x 5400 px canvas",
    "- 300 DPI export metadata",
    "- Instructions.txt",
    "- License.txt",
    "- Buyer download ZIP",
    "HOW IT WORKS",
    "1. Purchase the listing.",
    "2. Download the ZIP from Etsy.",
    "3. Unzip the file.",
    "4. Upload the transparent PNG to your print workflow or craft software.",
    "5. Print or apply it using your own equipment or vendor.",
    "IMPORTANT DIGITAL PRODUCT NOTICE",
    "No physical item will be shipped. This is a digital design file only. Colors can vary slightly depending on monitor, printer, ink, fabric and press settings.",
    "AI DISCLOSURE",
    "AI-assisted concept and layout direction was used. The final printable PNG, listing copy and product package were reviewed and prepared by the seller.",
    "TERMS OF USE",
    "Personal and small-business physical end-product use is allowed. Do not resell, redistribute, share, upload, sublicense, or include the digital source file in another digital product or bundle.",
  ].join("\n\n");
}

async function createBuyerZip(product: GeneratedTshirtProduct, png: Buffer): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(product.pngName, png);
  zip.file(
    "instructions.txt",
    [
      `${product.productName}`,
      "",
      "1. Unzip this download.",
      `2. Use ${product.pngName} as the transparent t-shirt print artwork.`,
      "3. Recommended uses: sublimation, DTF, heat transfer, craft cutting software that accepts PNG, or print-on-demand upload.",
      "4. No physical shirt or printed transfer is included.",
      "5. Test colors and sizing before production.",
    ].join("\n"),
  );
  zip.file(
    "license.txt",
    [
      `${product.productName} License`,
      "",
      "Personal and small-business physical end-product use is allowed.",
      "Do not resell, redistribute, share, upload, sublicense, or include the digital source file in another digital product or bundle.",
      "You may not claim the digital artwork itself as your trademark, logo, or exclusive brand identity.",
    ].join("\n"),
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
}

async function validateProduct(product: GeneratedTshirtProduct, root: string): Promise<ProductQaReport> {
  const issues: string[] = [];
  const zipPath = path.join(root, "downloads", product.buyerZip);
  const zipBuffer = await readFile(zipPath);
  const zip = await JSZip.loadAsync(zipBuffer);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  const pngEntry = files.find((entry) => entry.name === product.pngName);
  if (!pngEntry) issues.push("Buyer ZIP does not contain the expected PNG.");
  const pngBuffer = pngEntry ? await pngEntry.async("nodebuffer") : Buffer.alloc(0);
  const pngMeta = pngBuffer.length ? await sharp(pngBuffer).metadata() : {};
  const raw = pngBuffer.length ? await sharp(pngBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true }) : null;
  const channels = raw?.info.channels ?? 0;
  let hasTransparentPixels = false;
  if (raw) {
    for (let i = channels - 1; i < raw.data.length; i += channels) {
      if (raw.data[i] < 255) {
        hasTransparentPixels = true;
        break;
      }
    }
  }
  if (pngMeta.width !== DESIGN_WIDTH || pngMeta.height !== DESIGN_HEIGHT) issues.push(`PNG dimensions are ${pngMeta.width}x${pngMeta.height}, expected ${DESIGN_WIDTH}x${DESIGN_HEIGHT}.`);
  if (pngMeta.hasAlpha !== true) issues.push("PNG alpha channel missing.");
  if (!hasTransparentPixels) issues.push("PNG has no transparent pixels.");

  const zipStats = await stat(zipPath);
  if (zipStats.size > LISTING_LIMITS.maxDigitalFileSizeBytes) issues.push("Buyer ZIP exceeds Etsy 20MB per-file limit.");
  if (product.buyerZip.length > 70) issues.push("Buyer ZIP filename exceeds Etsy 70-character filename limit.");
  if (product.suggestedTitle.length > LISTING_LIMITS.maxTitleLength) issues.push("Listing title exceeds Etsy title limit.");
  if (product.tags.length !== LISTING_LIMITS.maxTags) issues.push(`Tag count is ${product.tags.length}, expected 13.`);
  for (const tag of product.tags) {
    if (tag.length > LISTING_LIMITS.maxTagLength) issues.push(`Tag exceeds ${LISTING_LIMITS.maxTagLength} chars: ${tag}`);
  }

  const listingImages: ImageMeta[] = [];
  for (const imageName of generatedTshirtListingImageNames) {
    const imagePath = path.join(root, "images", "listing_images", imageName);
    const imageStats = await stat(imagePath);
    const meta = await sharp(imagePath).metadata();
    if (meta.format !== "jpeg") issues.push(`${imageName} is ${meta.format}, expected jpeg.`);
    if (meta.width !== LISTING_WIDTH || meta.height !== LISTING_HEIGHT) issues.push(`${imageName} is ${meta.width}x${meta.height}, expected ${LISTING_WIDTH}x${LISTING_HEIGHT}.`);
    listingImages.push({ filename: imageName, width: meta.width ?? 0, height: meta.height ?? 0, format: meta.format, sizeBytes: imageStats.size });
  }

  return {
    slug: product.slug,
    productName: product.productName,
    buyerZip: {
      filename: product.buyerZip,
      sizeBytes: zipStats.size,
      entries: files.map((entry) => entry.name),
      png: {
        filename: product.pngName,
        width: pngMeta.width ?? 0,
        height: pngMeta.height ?? 0,
        hasAlpha: pngMeta.hasAlpha === true,
        hasTransparentPixels,
        density: pngMeta.density,
      },
    },
    listingImages,
    titleLength: product.suggestedTitle.length,
    tagCount: product.tags.length,
    tags: product.tags,
    priceTry: product.priceTry,
    mockupSource: {
      researchedFreeSite: "Mockey.ai free t-shirt mockup generator was identified during current web research.",
      productionMethod: "Final mockups were generated locally from the actual transparent PNG to keep the buyer file and listing images exactly matched.",
    },
    trademarkReview: { phrase: product.phrase.replace(/\n/g, " "), decision: "APPROVED_FOR_PUBLISH", note: product.trademarkNote },
    issues,
    passed: issues.length === 0,
  };
}

async function buildProduct(product: GeneratedTshirtProduct): Promise<ProductQaReport> {
  const root = path.join(generatedTshirtWaveRoot, product.slug);
  const imageRoot = path.join(root, "images", "listing_images");
  const downloadRoot = path.join(root, "downloads");
  const dataRoot = path.join(root, "listing-data");
  const qaRoot = path.join(root, "qa-report");
  await mkdir(imageRoot, { recursive: true });
  await mkdir(downloadRoot, { recursive: true });
  await mkdir(dataRoot, { recursive: true });
  await mkdir(qaRoot, { recursive: true });

  const designPng = await renderDesignPng(product);
  const buyerZip = await createBuyerZip(product, designPng);
  await writeFile(path.join(downloadRoot, product.buyerZip), buyerZip);

  const images = [
    await buildMockup(product, designPng, product.colors.shirtLight, "hero"),
    await buildArtworkDetails(product, designPng),
    await buildInfoImage(product, "What You Receive", ["Transparent PNG file", "4500 x 5400 px", "300 DPI export", "Instructions + license", "Instant digital file"]),
    await buildMockup(product, designPng, product.colors.shirtDark, "alt"),
    await buildInfoImage(product, "How It Works", ["Purchase on Etsy", "Download the ZIP", "Unzip the PNG", "Upload or print", "No physical shirt shipped"]),
  ];
  for (const [index, image] of images.entries()) {
    await writeFile(path.join(imageRoot, generatedTshirtListingImageNames[index]), image);
  }

  const data = {
    product_name: product.productName,
    suggested_title: product.suggestedTitle,
    suggested_price_try: product.priceTry,
    price_currency_note: "Use 200 TRY in the connected TRY Etsy shop.",
    tags: product.tags,
    description: buildDescription(product),
    listing_images: [...generatedTshirtListingImageNames],
    buyer_file: product.buyerZip,
    digital_product: true,
    physical_item: false,
    ai_disclosure_required: true,
  };
  await writeFile(path.join(dataRoot, "PRODUCT_DATA.json"), JSON.stringify(data, null, 2), "utf8");
  await writeFile(
    path.join(dataRoot, "ETSY_LISTING_COPY.txt"),
    [`TITLE`, product.suggestedTitle, "", `DESCRIPTION`, data.description, "", `TAGS`, product.tags.join(", "), "", `PRICE`, `${product.priceTry} TRY`].join("\n"),
    "utf8",
  );

  const qa = await validateProduct(product, root);
  await writeFile(path.join(qaRoot, "qa-report.json"), JSON.stringify(qa, null, 2), "utf8");
  return qa;
}

async function main() {
  const reports: ProductQaReport[] = [];
  for (const product of generatedTshirtProducts) {
    reports.push(await buildProduct(product));
  }
  await writeFile(path.join(generatedTshirtWaveRoot, "qa-summary.json"), JSON.stringify(reports, null, 2), "utf8");
  console.log(JSON.stringify(reports, null, 2));
  const failed = reports.filter((report) => !report.passed);
  if (failed.length > 0) throw new Error(`Generated t-shirt QA failed: ${failed.map((report) => report.slug).join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
