import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getStorage } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { publishListing } from "../apps/worker/src/agents/publisher.ts";
import type { SeoOutput } from "../apps/worker/src/agents/seo.ts";
import { CANONICAL_SHOP_ID } from "../packages/database/src/shop.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const bundledAssetsRoot = path.join(repoRoot, "artifacts", "manual-publish-assets");

type ManualProduct = {
  slug: string;
  productTitle: string;
  listingTitle: string;
  productType: string;
  category: string;
  priceUsd: number;
  description: string;
  tags: string[];
  materials?: string[];
  attributes: SeoOutput["attributes"];
};

const products: ManualProduct[] = [
  {
    slug: "botanical-wedding-planner-binder-v1",
    productTitle: "Botanical Wedding Planner Binder Printable",
    listingTitle: "Botanical Wedding Planner Binder Printable | Wedding Budget, Guest List, Timeline & Checklist PDF",
    productType: "wedding_planner_binder",
    category: "planner",
    priceUsd: 9.9,
    description:
      "A detailed printable wedding planning binder for botanical, garden, wildflower, and romantic weddings.\n\n" +
      "This instant download is built to feel like a complete planning system, not a one-page checklist. It helps couples organize the decisions that usually create stress near the end: budget, guest list, RSVPs, vendors, seating, timelines, photo priorities, decor, signage, packing, emergency kit, final week handoffs, and thank-you notes.\n\n" +
      "Included files:\n- Complete ZIP bundle\n- US Letter PDF\n- A4 PDF\n- Printing guide\n- Personal-use license\n\n" +
      "Inside the planner:\n- 34 printable pages\n- Wedding vision board\n- Planning countdown checklists\n- Budget and payment trackers\n- Guest list and RSVP dashboard\n- Vendor, venue, seating, timeline, decor, signage, packing, emergency kit, honeymoon, gift, thank-you, and final week pages\n\n" +
      "Digital download only. No physical item will be shipped. Colors may vary by monitor, printer, ink, and paper. For personal wedding or event use only.\n\n" +
      "This listing's description and written product content (e.g. checklist/planner text) were drafted with AI assistance, directed and edited by the shop owner. The page layout, typography, and final design are original, non-AI work.",
    tags: [
      "wedding planner",
      "wedding binder",
      "bridal planner",
      "wedding checklist",
      "wedding budget",
      "guest list",
      "rsvp tracker",
      "seating chart",
      "wedding timeline",
      "vendor tracker",
      "garden wedding",
      "botanical bride",
      "printable pdf",
    ],
    materials: ["Digital File", "PDF", "ZIP"],
    attributes: { occasion: "Wedding", style: "Botanical", recipient: "Bride", color: "Sage green" },
  },
  {
    slug: "weekly-meal-planner-grocery-list-v1",
    productTitle: "Weekly Meal Planner & Grocery List Printable",
    listingTitle: "Weekly Meal Planner & Grocery List Printable | Meal Prep PDF | Kitchen Planner",
    productType: "meal_planner_printable",
    category: "planner",
    priceUsd: 6.6,
    description:
      "Plan meals, grocery shopping, and weekly prep in one clean printable.\n\n" +
      "This instant download includes a weekly meal planner layout with dinner planning, lunch prep, snack list, pantry check, grocery list, and notes sections.\n\n" +
      "Included files:\n- Complete ZIP bundle\n- Printable PDF\n- PNG source file\n- Printing instructions\n\n" +
      "Digital download only. No physical item will be shipped. For personal use only.",
    tags: [
      "meal planner",
      "grocery list",
      "weekly planner",
      "printable",
      "meal prep",
      "dinner planner",
      "menu planner",
      "food planner",
      "kitchen planner",
      "pdf planner",
      "instant download",
      "digital download",
      "checklist",
    ],
    attributes: { occasion: null, style: "Minimalist", recipient: null, color: "Sage green" },
  },
  {
    slug: "teacher-weekly-lesson-planner-v1",
    productTitle: "Teacher Weekly Lesson Planner Printable",
    listingTitle: "Teacher Weekly Lesson Planner Printable | Classroom Planning PDF | Teacher Worksheet",
    productType: "teacher_lesson_planner",
    category: "planner",
    priceUsd: 6,
    description:
      "A clean weekly lesson planner printable for teachers, tutors, homeschool planning, classroom prep, and weekly instruction organization.\n\n" +
      "Included files:\n- Complete ZIP bundle\n- Printable PDF\n- PNG file\n- Printing instructions\n\n" +
      "Use it to plan class goals, daily lessons, homework, materials, student notes, and follow-up tasks. Digital download only. No physical item will be shipped.",
    tags: [
      "teacher planner",
      "lesson planner",
      "weekly lesson",
      "teacher printable",
      "classroom planner",
      "homeschool planner",
      "education pdf",
      "worksheet",
      "school planner",
      "teaching tools",
      "printable",
      "instant download",
      "digital download",
    ],
    attributes: { occasion: "Back to school", style: "Minimalist", recipient: "Teacher", color: "Blue" },
  },
  {
    slug: "small-business-order-tracker-v1",
    productTitle: "Small Business Order Tracker Printable",
    listingTitle: "Small Business Order Tracker Printable | Shop Planner PDF | Order Log Template",
    productType: "business_order_tracker",
    category: "planner",
    priceUsd: 7.2,
    description:
      "A practical order tracker printable for small business owners, Etsy sellers, handmade shops, and side hustles.\n\n" +
      "Included files:\n- Complete ZIP bundle\n- Printable PDF\n- PNG file\n- Printing instructions\n\n" +
      "Track order numbers, customer names, products, payment status, packing status, ship-by dates, tracking numbers, customer notes, and follow-up tasks. Digital download only.",
    tags: [
      "order tracker",
      "business planner",
      "small business",
      "etsy seller tool",
      "order log",
      "shop planner",
      "seller planner",
      "printable",
      "business pdf",
      "packing list",
      "customer tracker",
      "instant download",
      "digital download",
    ],
    attributes: { occasion: null, style: "Minimalist", recipient: "Small business owner", color: "Neutral" },
  },
];

async function listFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files = await readdir(dir);
  return files
    .filter((file) => extensions.includes(path.extname(file).toLowerCase()))
    .sort()
    .map((file) => path.join(dir, file));
}

async function mirrorAsset(localPath: string, storagePath: string): Promise<string> {
  const storage = getStorage();
  await storage.write(storagePath, await readFile(localPath));
  return storagePath;
}

async function ensureProduct(product: ManualProduct) {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: CANONICAL_SHOP_ID } });
  const assetDir = path.join(bundledAssetsRoot, product.slug);
  const imageFiles = await listFiles(path.join(assetDir, "images", "listing_images"), [".png", ".jpg", ".jpeg"]);
  const downloadFiles = await listFiles(path.join(assetDir, "downloads"), [".zip", ".pdf"]);

  const productRow = await prisma.product.upsert({
    where: { slug: product.slug },
    update: {
      title: product.productTitle,
      category: product.category,
      productType: product.productType,
      status: "READY_TO_PUBLISH",
      shopId: shop.id,
    },
    create: {
      shopId: shop.id,
      slug: product.slug,
      title: product.productTitle,
      category: product.category,
      productType: product.productType,
      status: "READY_TO_PUBLISH",
      designFamily: product.slug.replace(/-v\d+$/, ""),
    },
  });

  const sourceDir = `manual-products/products/${product.slug}`;
  const listingImages = await Promise.all(
    imageFiles.map(async (file, index) => ({
      role: index === 0 ? "cover" : `image_${index + 1}`,
      rank: index + 1,
      path: await mirrorAsset(file, `${sourceDir}/listing_images/${path.basename(file)}`),
    })),
  );

  const customerFiles = { PDF: [] as string[], PNG: [] as string[], SVG: [] as string[], ZIP: [] as string[] };
  for (const file of downloadFiles) {
    const ext = path.extname(file).toLowerCase();
    const storagePath = await mirrorAsset(file, `${sourceDir}/customer_files/${ext === ".zip" ? "ZIP" : "PDF"}/${path.basename(file)}`);
    if (ext === ".zip") customerFiles.ZIP.push(storagePath);
    if (ext === ".pdf") customerFiles.PDF.push(storagePath);
  }

  const seo: SeoOutput = {
    title: product.listingTitle,
    description: product.description,
    tags: product.tags,
    materials: product.materials ?? ["Digital File", "PDF", "PNG"],
    attributes: product.attributes,
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
        metadataJson: { manualPublish: true, slug: product.slug },
        seoJson: seo,
      },
    });
  } else {
    version = await prisma.productVersion.update({
      where: { id: version.id },
      data: { sourceDir, customerFiles, listingImages, mockups: listingImages, metadataJson: { manualPublish: true, slug: product.slug }, seoJson: seo },
    });
  }

  await prisma.product.update({ where: { id: productRow.id }, data: { currentVersionId: version.id } });

  const result = await publishListing({
    shopId: shop.id,
    productId: productRow.id,
    productVersionId: version.id,
    priceUsd: product.priceUsd,
    category: product.category,
    seo,
    dryRun: false,
    autoPublish: true,
  });

  return { slug: product.slug, title: product.listingTitle, result };
}

async function main() {
  const requested = new Set(process.argv.slice(2));
  const selected = requested.size ? products.filter((product) => requested.has(product.slug)) : products;
  if (selected.length === 0) throw new Error(`No matching products. Known slugs: ${products.map((p) => p.slug).join(", ")}`);

  if (!process.env.ETSY_TAXONOMY_IDS?.trim()) {
    const existingTaxonomy = await prisma.listing.findFirst({
      where: { taxonomyId: { not: null }, isDigital: true },
      orderBy: { createdAt: "desc" },
      select: { taxonomyId: true },
    });
    if (existingTaxonomy?.taxonomyId) {
      process.env.ETSY_TAXONOMY_IDS = JSON.stringify({ planner: existingTaxonomy.taxonomyId });
    }
  }

  const results = [];
  for (const product of selected) {
    results.push(await ensureProduct(product));
  }
  console.log(JSON.stringify(results, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
