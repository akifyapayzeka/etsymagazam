# How the autopilot behaves

## The kill switch

**Settings → Pause Autopilot** stops:
- new product generation
- auto-publish
- automatic price changes
- automatic listing changes (deactivation, etc.)

It does **not** stop: analytics/order syncing, alerts, or the dashboard.
Paused is also the default state on a fresh install — nothing runs until
you explicitly resume it (see `docs/ETSY_SETUP.md` step 8).

Every generation run passes through `apps/worker/src/agents/store-director.ts`'s
`canGenerateMore()` gate before it does anything: paused shop → blocked;
`MAX_PRODUCTS_PER_DAY` reached → blocked; `MAX_PRODUCTS_PER_WEEK` reached →
blocked. Otherwise it proceeds and the count moves toward the limit.

## Config knobs (Settings, or `.env`)

| Setting | What it does |
|---|---|
| `AUTO_PUBLISH` | `false`: QA-passed products become Etsy **drafts** for you to review. `true`: they go live automatically. |
| `DRY_RUN` | `true`: the Publisher Agent writes the exact payload it *would* send to Etsy to a local file instead of calling the API. Always test a config change with `DRY_RUN=true` first. |
| `MAX_PRODUCTS_PER_DAY` / `MAX_PRODUCTS_PER_WEEK` | Hard caps on new product generation, regardless of how many good opportunities exist. Start low; raise as you trust the output. |
| `QA_MIN_SCORE` | Minimum overall QA score (0-100) to pass. Default 90. |
| `QA_MAX_RETRIES` | How many times a failed QA product gets regenerated before being cancelled. |
| `IP_RISK_REJECT_THRESHOLD` | IP/trademark risk score (0-100) above which a product is rejected outright. |
| `MIN_PRICE` / `MAX_PRICE` | Hard price bounds the Pricing Agent will never cross. |
| `MAX_DAILY_PRICE_CHANGE` | Max number of automatic price changes per listing per day. |

## The daily/weekly/monthly schedule

Registered in `apps/worker/src/scheduler.ts` (all times UTC):

- **Daily**: seasonal opportunity scan → analytics refresh (syncs Etsy
  receipts) → Store Director plans the day's production (picks the
  highest-scored `NEW` opportunities, up to remaining budget) → automation
  health check (alerts).
- **Weekly (Mondays)**: Growth Agent scans for winning products and queues
  variations; loser-product review (see below); pricing review runs a
  controlled sequential price test on underperforming/overperforming
  listings.
- **Monthly**: a portfolio/profitability snapshot is recorded to
  `automation_runs` for you to review — it doesn't take any automatic
  action.

## Growing what works

When a published product's trailing-30-day sales cross a threshold, the
Growth Agent (`apps/worker/src/agents/growth.ts`) queues a *variation* —
not a random new product, but a deliberate expansion of that design
family using category-appropriate angles (e.g. a wedding welcome sign that
sells well gets an Invitation, Menu Card, Table Numbers, Thank You Card,
etc., up to a configurable cap per family).

## Handling what doesn't

The Optimize Agent (`apps/worker/src/agents/optimize.ts`) reviews active
listings weekly. Etsy's public API doesn't expose per-listing views or
favorites (see `docs/ARCHITECTURE.md`), so the funnel-stage rules (no
views → refresh SEO; views-no-favorites → reposition; favorites-no-sale →
review price) only activate once you wire in that signal. Until then, the
one rule that runs on real data: a listing with **zero sales after a
configurable window** (`apps/worker/src/config/optimization-rules.json`)
gets deactivated — not deleted, so you can always reactivate it manually.

## Cost control

Every AI call (`packages/ai`) is logged to `generation_costs` with its
provider, model, token counts, and estimated cost — cheap-tier models are
used for the routine copy tasks (SEO, ideation), and layout/typography
never touches an AI call at all (see `docs/ARCHITECTURE.md`). The Finance
Agent (`apps/worker/src/agents/finance.ts`) rolls this up daily against
gross revenue and estimated Etsy fees into `daily_metrics.estimatedNet` —
visible on the dashboard's **Money** screen. `estimatedTaxes` is always
informational (this system keeps records; it does not give tax advice).

## Alerts

Priorities, and what triggers them (`apps/worker/src/jobs/alerts.ts` +
every agent's own failure paths):

- **P0**: Etsy authorization lost (token expired >24h without a successful
  refresh), shop suspended, payment issue, policy violation.
- **P1**: a job exhausted all its retries (dead letter — surfaced
  automatically by `apps/worker/src/index.ts`), publishing blocked (e.g.
  missing taxonomy id), webhooks stuck, automation stalled entirely.
- **P2**: a customer message needs a human, unusual refund pattern,
  elevated QA/IP rejection rate.

Routine QA rejections, retries, and regenerations are **not** alerts —
they're normal automation, visible in Products and Audit Log, not pushed
at you. Alerts also dedupe (same shop+category within a window doesn't
re-fire) so a flaky loop can't spam you.

## Customer messages

Etsy's official API does not support fully automated replies to buyer
messages, and this system will not use browser automation to fake it (see
`docs/SECURITY.md`). The product model is designed to minimize the need in
the first place — instant-download digital products with no personalization
loop. Anything that does need a human is flagged for **Human Attention
Required** rather than silently ignored or faked.
