import path from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

export const inputRoot = path.join(
  repoRoot,
  "artifacts",
  "incoming",
  "ETSY_5_TSHIRT_PRODUCTS_CODEX_READY_20260828_2338",
);

export const preparedRoot = path.join(repoRoot, "artifacts", "manual-publish-assets", "tshirt-products");

export const listingImageNames = [
  "01_MAIN_MOCKUP.jpg",
  "02_ARTWORK_DETAILS.jpg",
  "03_TRANSPARENT_PNG.jpg",
  "04_LIGHT_TEE_MOCKUP.jpg",
  "05_HOW_IT_WORKS.jpg",
] as const;

export type ProductSource = {
  inputDir: string;
  slug: string;
  phrase: string;
  productType: string;
  designFamily: string;
  expectedBuyerZip: string;
};

export const productSources: ProductSource[] = [
  {
    inputDir: "01_no_rush_club",
    slug: "no-rush-club-snail-tshirt-png-v1",
    phrase: "No Rush Club",
    productType: "tshirt_png_snail_graphic",
    designFamily: "no-rush-club",
    expectedBuyerZip: "01_NO_RUSH_CLUB_BUYER_DOWNLOAD.zip",
  },
  {
    inputDir: "02_low_battery_society",
    slug: "low-battery-society-robot-tshirt-png-v1",
    phrase: "Low Battery Society",
    productType: "tshirt_png_robot_graphic",
    designFamily: "low-battery-society",
    expectedBuyerZip: "02_LOW_BATTERY_SOCIETY_BUYER_DOWNLOAD.zip",
  },
  {
    inputDir: "03_midnight_snack_club",
    slug: "midnight-snack-club-raccoon-tshirt-png-v1",
    phrase: "Midnight Snack Club",
    productType: "tshirt_png_midnight_snack_graphic",
    designFamily: "midnight-snack-club",
    expectedBuyerZip: "03_MIDNIGHT_SNACK_CLUB_BUYER_DOWNLOAD.zip",
  },
  {
    inputDir: "04_offline_adventure",
    slug: "offline-adventure-dept-tshirt-png-v1",
    phrase: "Offline Adventure",
    productType: "tshirt_png_outdoor_graphic",
    designFamily: "offline-adventure",
    expectedBuyerZip: "04_OFFLINE_ADVENTURE_BUYER_DOWNLOAD.zip",
  },
  {
    inputDir: "05_coffee_before_chaos",
    slug: "coffee-before-chaos-bear-tshirt-png-v1",
    phrase: "Coffee Before Chaos",
    productType: "tshirt_png_coffee_graphic",
    designFamily: "coffee-before-chaos",
    expectedBuyerZip: "05_COFFEE_BEFORE_CHAOS_BUYER_DOWNLOAD.zip",
  },
];

export type ProductData = {
  product_name: string;
  suggested_title: string;
  suggested_price_try: number;
  price_currency_note: string;
  tags: string[];
  description: string;
  listing_images: string[];
  buyer_file: string;
  digital_product: boolean;
  physical_item: boolean;
  ai_disclosure_required: boolean;
};
