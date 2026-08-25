# Upload order — customer files & listing images

Etsy caps a digital listing at 5 files total. This bundle ships as the ZIP
(everything, both sizes) plus the two convenience PDFs — 3 files, comfortably
under the cap.

## Digital files (Etsy "Digital files" section) — upload in this order

1. `customer-download/333-rescue-dog-decompression-tracker-complete-bundle.zip`
   (the full bundle — every PNG page in both sizes + both PDFs + instructions.txt + license.txt)
2. `customer-download/333-rescue-dog-decompression-tracker-letter.pdf`
   (convenience: US Letter, all 5 pages, print-ready as one file)
3. `customer-download/333-rescue-dog-decompression-tracker-a_series.pdf`
   (convenience: A4, all 5 pages, print-ready as one file)

## Listing images (Etsy "Photos" section) — upload in this exact order (01 → 09)

Etsy uses the first image as the primary/cover thumbnail shown in search —
`01_cover.png` MUST be uploaded first.

1. `listing-images/01_cover.png` — primary/cover image
2. `listing-images/02_mockup.png` — a real page shown up close ("Printable Bundle")
3. `listing-images/03_whats_included.png` — what's included
4. `listing-images/04_features_benefits.png` — why it helps
5. `listing-images/05_sizes_formats.png` — sizes & file formats
6. `listing-images/06_how_it_works.png` — purchase → download → print
7. `listing-images/07_use_case.png` — ways to use it
8. `listing-images/08_instant_download.png` — instant download reassurance
9. `listing-images/09_important_info.png` — disclaimers / good-to-know

All 9 are 2000x2000px PNGs (Etsy's recommended square listing-image size).

## Listing text — see `listing-data/`

- `etsy-title.txt` — paste verbatim into the Title field
- `etsy-description.txt` — paste verbatim into the Description field
- `etsy-tags.txt` — one tag per line, 13 total; add each as a separate Etsy tag
- `etsy-category.txt` — a category hint + how to pick it in Etsy's UI (see the note in the file — this is not a numeric taxonomy_id)
- `etsy-price.txt` — the price to set
- `etsy-attributes.json` — suggested listing attributes (occasion/style/recipient/color) and the write-contract fields (`who_made`, `when_made`, `type`, `quantity`) for reference against what the autopilot will eventually send via the API

## QA / verification record

`qa-report/qa-report.json` — the real QA + IP/Policy Guard scan of this exact
listing's files and copy: overall score 100/100 (bar: ≥95), IP risk 0/100
(bar: ≤10), zero issues.

## Why this product

`WHY_THIS_PRODUCT.json` — the research and scoring behind picking this as
the first product, including the 4 other candidates considered and rejected.
