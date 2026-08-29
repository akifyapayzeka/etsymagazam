import path from "node:path";
import { fileURLToPath } from "node:url";

export const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

export const homeownerInputRoot = path.join(
  repoRoot,
  "artifacts",
  "incoming",
  "Homeowner_Command_Center_ETSY_READY_20260829_174348",
);

export const homeownerPreparedRoot = path.join(repoRoot, "artifacts", "manual-publish-assets", "homeowner-command-center-v1");

export const homeownerSlug = "homeowner-command-center-fillable-pdf-v1";

export const homeownerBuyerFiles = [
  "Homeowner_Command_Center_US_Letter_FILLABLE.pdf",
  "Homeowner_Command_Center_A4_FILLABLE.pdf",
  "READ_ME_FIRST.pdf",
] as const;

export const homeownerImageFiles = [
  "01_Run_Your_Home_Like_A_S.jpg",
  "02_Everything_Important._.jpg",
  "03_Built_For_New_Homeowne.jpg",
  "04_Maintenance_Without_Gu.jpg",
  "05_Repairs_With_Better_Re.jpg",
  "06_Plan_Projects_With_Con.jpg",
  "07_Print_It_Or_Type_Into_.jpg",
  "08_A_Useful_Housewarming_.jpg",
] as const;

export const homeownerTitle =
  "Home Maintenance Binder Printable, Homeowner Planner, New Home Binder, House Maintenance Log, Fillable PDF";

export const homeownerTags = [
  "home maintenance",
  "homeowner binder",
  "new home binder",
  "house maintenance",
  "home organizer",
  "home planner",
  "maintenance log",
  "home records",
  "new homeowner gift",
  "home inventory",
  "house binder",
  "home management",
  "fillable pdf",
] as const;

export const homeownerDescription = `Run your home with one organized system. The Homeowner Command Center is a printable and fillable home management binder for maintenance, repairs, warranties, projects, safety contacts and important records.

Keep the details that are easy to forget in one clean place, whether you are moving into a new home, organizing an existing home, or building a practical home maintenance binder.

WHAT YOU'LL RECEIVE
- Homeowner Command Center US Letter fillable PDF
- Homeowner Command Center A4 fillable PDF
- READ_ME_FIRST PDF with use and printing guidance
- Instant digital download
- No physical product will be shipped

29-PAGE HOMEOWNER COMMAND CENTER
This digital binder includes 29 pages total in each size: one cover/start page, one quick index page, 26 focused organizer pages, and one notes/sketches page.

INCLUDED PAGES
- Home Snapshot
- Quick Index
- Utility Shutoff Map
- Home Systems Directory
- Appliance Passport
- Warranty Vault Index
- Contractor Directory
- Annual Maintenance Map
- Seasonal Home Reset
- Monthly Maintenance Log
- Filter & Consumable Tracker
- Safety Device Check
- Repair Triage Sheet
- Repair & Service Log
- Home Project Planner
- Project Budget
- Quote Comparison
- Paint & Finish Library
- Room Measurement Sheet
- Home Inventory - High Value
- Move-In Baseline
- Seller Handoff Record
- Emergency Contact Card
- Document Location Index
- Home Network Record
- Service Visit Notes
- 30-Day Home Action List
- Notes & Sketches

PDF SIZES
- US Letter PDF
- A4 PDF

FILLABLE + PRINTABLE
The PDFs include fillable form fields for use on a computer or tablet with a compatible PDF reader. You can also print blank pages and write by hand.

WHO THIS IS FOR
- New homeowners
- First-time home buyers
- People moving into a new home
- Organized households
- Anyone who wants maintenance, appliance, warranty, contractor, project and home record pages in one place

HOW IT WORKS
1. Purchase the listing.
2. Download the files from your Etsy purchases.
3. Open the PDF in Adobe Acrobat Reader or another PDF reader that supports form fields.
4. Type into the fields and save a copy, or print blank pages and fill them in by hand.

IMPORTANT DIGITAL PRODUCT NOTICE
This is a digital product. No physical item will be shipped. No binder, printed pages, planner, tabs or accessories are included.

PRINTING
Print at Actual Size / 100%. Choose the US Letter or A4 file to match your paper size. Colors may vary slightly between monitors, printers, inks and paper types.

TERMS OF USE
Personal use only. Do not resell, redistribute, share, upload, sublicense, or include the source files in another digital product or bundle.

Because this is a digital download, return and refund handling follows Etsy's digital item policies and the shop's applicable policies.`;
