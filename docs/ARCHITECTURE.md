# Architecture

## The loop

```
RESEARCH → PRODUCT STRATEGY → PRODUCT CREATION (design+mockups) → SEO
   → QA + IP/POLICY CHECK → PRICING → PUBLISH → ANALYTICS
   → GROWTH (winners) / OPTIMIZE (losers) → back to RESEARCH
```

This runs as a chain of BullMQ jobs (`apps/worker`), each stage handing
off to the next by enqueuing the following job. A scheduler
(`apps/worker/src/scheduler.ts`) fires the entry points daily, weekly, or
monthly. A human can also short-circuit the loop from the dashboard (paste
keywords, pick an opportunity to produce).

## Why one repo, not microservices

Three deployable units, not twenty: `apps/api` (HTTP surface — OAuth,
webhooks, dashboard REST API), `apps/worker` (all the agents, as job
handlers), `apps/dashboard` (the UI). The "agents" named throughout the
spec this system was built against (Store Director, Trend Scout, Product
Strategy, Design, Mockup, SEO, Pricing, IP/Policy Guard, QA, Publisher,
Analytics, Growth, Seasonal, Finance, Alert & Reporting) are modules under
`apps/worker/src/agents/`, not separate services — several of them are
folded together where splitting them would add process/queue overhead
without adding real independence:

- **Design + Mockup** live inside `packages/product-generator` — they're
  the same rendering pipeline (see below), not two decisions.
- **SEO** and **IP/Policy Guard** run as steps inside the
  `PRODUCT_GENERATION` and `QA` jobs, respectively, rather than their own
  queues — there is no scenario where you'd want SEO copy without a
  product to attach it to, or a policy check that isn't part of QA gating.
- **Store Director** isn't a single big brain — it's a gate function
  (`canGenerateMore`) checked before every generation run, plus a daily
  planning job that picks which opportunities to produce. Every decision
  it (and every other agent) makes is written to `agent_decisions` with
  its reasoning, the data used, and a confidence score — that table is
  the dashboard's "why did it do that" audit trail.

## Deterministic vs AI

This is the core design bet: **layout, typography, and file generation are
deterministic code, never AI**. `packages/product-generator` renders
actual print-ready PDFs/PNGs/SVGs and the 10 listing images using
[satori](https://github.com/vercel/satori) (React-element-shaped layout
trees → SVG) + [resvg](https://github.com/RazrFalcon/resvg) (SVG → raster)
+ [pdf-lib](https://github.com/Hopding/pdf-lib) — real typography, real
pixel-perfect layout, zero risk of an image model garbling text.

AI (`packages/ai`, routed through `packages/core`'s prompt library in
`prompts/`) is used only for:

- **Concept/copy generation** — product ideation (title, angle, content
  outline) and SEO copywriting (title/description/tags). Both have a
  deterministic fallback if the AI call fails or returns malformed JSON —
  the pipeline never stalls on a flaky model response.
- **Optional design-concept direction** — a decorative-accent mood
  description, not layout/text placement.

Every AI call records its provider, model, prompt version, token counts,
and cost in `generation_costs` — see `docs/AUTOPILOT.md` for the cost
control this enables.

## Data model

`packages/database/prisma/schema.prisma` is the source of truth. Broad
groups: shop/connection, products (`products` → `product_versions` →
`listings`/`listing_assets`/`digital_files`), research
(`product_research`/`keywords`/`opportunities`), quality
(`qa_reports`/`ip_checks`), commerce (`etsy_orders`/`etsy_order_items`/
`webhook_events`), analytics/finance (`daily_metrics`/`product_metrics`/
`price_changes`/`experiments`/`generation_costs`), and operations
(`agent_runs`/`agent_decisions`/`alerts`/`automation_runs`/`audit_logs`/
`seasonal_events`/`autopilot_state`).

## Available vs unavailable metrics — read this before trusting a number

Etsy's public Open API v3 exposes **orders/receipts** (so revenue, sales
count, refunds are real) but does **not** expose per-listing views or
favorites. `product_metrics.visits`/`.favorites` stay `null` unless you
wire in a source for them (manual entry, a future analytics integration).
The Analytics and Optimize agents check for `null` explicitly and either
skip that logic branch or fall back to a sales+listing-age-only rule — see
`apps/worker/src/agents/optimize.ts`. Nothing in this system invents a
number Etsy didn't actually give it.

## Storage

Generated files (customer downloads, listing images, mockups) go through
`packages/core`'s `Storage` interface (`getStorage()`), which is a local
filesystem driver by default (`STORAGE_LOCAL_PATH`) or S3-compatible
(`STORAGE_DRIVER=s3`). Nothing in `apps/worker` talks to the filesystem
directly, so switching storage backends is a config change, not a code
change.

## Etsy integration boundaries

`packages/etsy` only ever calls Etsy's official Open API v3 (OAuth2+PKCE,
REST endpoints, and the order webhooks). There is no browser automation,
no scraping, and no bypass of Etsy's own rate limits — see
`docs/SECURITY.md` for the full list of things this system will not do.
