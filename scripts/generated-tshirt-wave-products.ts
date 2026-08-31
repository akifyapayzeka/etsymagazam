import path from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

export const generatedTshirtWaveRoot = path.join(repoRoot, "artifacts", "manual-publish-assets", "generated-tshirt-wave-20260831");

export const generatedTshirtListingImageNames = [
  "01_MAIN_MOCKUP.jpg",
  "02_ARTWORK_DETAILS.jpg",
  "03_TRANSPARENT_PNG.jpg",
  "04_LIGHT_TEE_MOCKUP.jpg",
  "05_HOW_IT_WORKS.jpg",
] as const;

export type GeneratedTshirtProduct = {
  slug: string;
  productName: string;
  phrase: string;
  eyebrow: string;
  subtitle: string;
  niche: string;
  productType: string;
  designFamily: string;
  buyerZip: string;
  pngName: string;
  suggestedTitle: string;
  tags: string[];
  priceTry: number;
  colors: {
    ink: string;
    accent: string;
    secondary: string;
    shirtDark: string;
    shirtLight: string;
    background: string;
  };
  trademarkNote: string;
};

export const generatedTshirtProducts: GeneratedTshirtProduct[] = [
  {
    slug: "caffeine-mode-on-tshirt-png-v1",
    productName: "Caffeine Mode On T-Shirt PNG",
    phrase: "Caffeine\nMode On",
    eyebrow: "Daily Brew Club",
    subtitle: "Coffee Lover Graphic",
    niche: "coffee lovers",
    productType: "tshirt_png_coffee_typographic",
    designFamily: "caffeine-mode-on",
    buyerZip: "06_CAFFEINE_MODE_ON_BUYER_DOWNLOAD.zip",
    pngName: "caffeine-mode-on-tshirt-design-4500x5400.png",
    suggestedTitle: "Caffeine Mode On PNG, Coffee Lover T-Shirt Design, Sublimation PNG, DTF Shirt Design",
    tags: [
      "coffee png",
      "caffeine png",
      "coffee shirt png",
      "tshirt design png",
      "sublimation png",
      "dtf design",
      "coffee lover gift",
      "barista png",
      "instant download",
      "png design file",
      "shirt design",
      "coffee graphic",
      "digital download",
    ],
    priceTry: 200,
    colors: { ink: "#2A211C", accent: "#B86B39", secondary: "#F0B46B", shirtDark: "#6F5140", shirtLight: "#F3ECE4", background: "#FAF6F1" },
    trademarkNote: "Current broad web/trademark-oriented search found marketplace phrase use, but no obvious active exact apparel trademark conflict.",
  },
  {
    slug: "lesson-plans-later-teacher-tshirt-png-v1",
    productName: "Lesson Plans Later Teacher T-Shirt PNG",
    phrase: "Lesson Plans\nLater",
    eyebrow: "Teacher Mode",
    subtitle: "Off Duty Classroom Graphic",
    niche: "teachers",
    productType: "tshirt_png_teacher_typographic",
    designFamily: "lesson-plans-later",
    buyerZip: "07_LESSON_PLANS_LATER_BUYER_DOWNLOAD.zip",
    pngName: "lesson-plans-later-teacher-tshirt-design-4500x5400.png",
    suggestedTitle: "Lesson Plans Later PNG, Teacher T-Shirt Design, Teacher Off Duty Sublimation PNG, DTF Design",
    tags: [
      "teacher png",
      "teacher shirt png",
      "teacher off duty",
      "school png",
      "classroom png",
      "tshirt design png",
      "sublimation png",
      "dtf design",
      "teacher gift",
      "instant download",
      "png design file",
      "shirt design",
      "digital download",
    ],
    priceTry: 200,
    colors: { ink: "#1F2933", accent: "#C17B2E", secondary: "#5C8A72", shirtDark: "#47535E", shirtLight: "#F4EEE3", background: "#F8F5EF" },
    trademarkNote: "Current search showed generic marketplace phrase use around teachers, but no obvious active exact apparel trademark conflict.",
  },
  {
    slug: "scrubs-and-caffeine-nurse-tshirt-png-v1",
    productName: "Scrubs And Caffeine Nurse T-Shirt PNG",
    phrase: "Scrubs &\nCaffeine",
    eyebrow: "Shift Fuel",
    subtitle: "Healthcare Worker Graphic",
    niche: "nurses and healthcare workers",
    productType: "tshirt_png_nurse_typographic",
    designFamily: "scrubs-and-caffeine",
    buyerZip: "08_SCRUBS_AND_CAFFEINE_BUYER_DOWNLOAD.zip",
    pngName: "scrubs-and-caffeine-nurse-tshirt-design-4500x5400.png",
    suggestedTitle: "Scrubs And Caffeine PNG, Nurse T-Shirt Design, Healthcare Worker Sublimation PNG, DTF",
    tags: [
      "nurse png",
      "scrubs png",
      "nurse shirt png",
      "healthcare png",
      "medical png",
      "tshirt design png",
      "sublimation png",
      "dtf design",
      "nurse gift",
      "instant download",
      "png design file",
      "shirt design",
      "digital download",
    ],
    priceTry: 200,
    colors: { ink: "#102A43", accent: "#2F80A0", secondary: "#E39BA6", shirtDark: "#324A5F", shirtLight: "#EDF6F8", background: "#F5FAFA" },
    trademarkNote: "Current search found descriptive healthcare phrase use, but no obvious active exact apparel trademark conflict. No protected red-cross symbol is used.",
  },
  {
    slug: "reading-weather-bookish-tshirt-png-v1",
    productName: "Reading Weather Bookish T-Shirt PNG",
    phrase: "Reading\nWeather",
    eyebrow: "Cozy Chapter Club",
    subtitle: "Book Lover Graphic",
    niche: "book lovers",
    productType: "tshirt_png_bookish_typographic",
    designFamily: "reading-weather",
    buyerZip: "09_READING_WEATHER_BUYER_DOWNLOAD.zip",
    pngName: "reading-weather-bookish-tshirt-design-4500x5400.png",
    suggestedTitle: "Reading Weather PNG, Book Lover T-Shirt Design, Bookish Sublimation PNG, Reader DTF",
    tags: [
      "book lover png",
      "reading png",
      "bookish png",
      "reader shirt png",
      "library png",
      "tshirt design png",
      "sublimation png",
      "dtf design",
      "book lover gift",
      "instant download",
      "png design file",
      "shirt design",
      "digital download",
    ],
    priceTry: 200,
    colors: { ink: "#2D2435", accent: "#8E5A82", secondary: "#CFAE70", shirtDark: "#51445B", shirtLight: "#F3EEF4", background: "#FAF7F8" },
    trademarkNote: "Current search showed descriptive reading/weather phrase use and marketplace usage, but no obvious active exact apparel trademark conflict.",
  },
  {
    slug: "weekend-trail-club-outdoor-tshirt-png-v1",
    productName: "Weekend Trail Club Outdoor T-Shirt PNG",
    phrase: "Weekend\nTrail Club",
    eyebrow: "Take The Scenic Route",
    subtitle: "Outdoor Adventure Graphic",
    niche: "outdoor and hiking fans",
    productType: "tshirt_png_outdoor_typographic",
    designFamily: "weekend-trail-club",
    buyerZip: "10_WEEKEND_TRAIL_CLUB_BUYER_DOWNLOAD.zip",
    pngName: "weekend-trail-club-outdoor-tshirt-design-4500x5400.png",
    suggestedTitle: "Weekend Trail Club PNG, Hiking T-Shirt Design, Outdoor Sublimation PNG, Adventure DTF",
    tags: [
      "hiking png",
      "outdoor png",
      "trail shirt png",
      "camping png",
      "adventure png",
      "tshirt design png",
      "sublimation png",
      "dtf design",
      "outdoor gift",
      "instant download",
      "png design file",
      "shirt design",
      "digital download",
    ],
    priceTry: 200,
    colors: { ink: "#1F2E24", accent: "#6F7F45", secondary: "#C38E4E", shirtDark: "#44503F", shirtLight: "#EFF2E8", background: "#F7F4EC" },
    trademarkNote: "Current search found general trail/club phrase use, but no obvious active exact apparel trademark conflict.",
  },
];
