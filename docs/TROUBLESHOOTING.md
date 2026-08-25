# Troubleshooting

## "Invalid environment configuration" on boot

A required env var is missing or malformed. The error lists exactly which
ones. Check `.env` against `.env.example`. Note: `.env` is only
auto-loaded from the **repo root** — per-package `.env` files aren't read.

## `ENCRYPTION_KEY is not set` / decrypt errors

`ENCRYPTION_KEY` must be a base64 string that decodes to exactly 32 bytes:
`openssl rand -base64 32`. If you rotate this key, every previously
encrypted Etsy token becomes unreadable — you'll need to reconnect Etsy
(`docs/ETSY_SETUP.md` step 4).

## `/health/ready` reports `database: error` or `redis: error`

- Confirm `DATABASE_URL`/`REDIS_URL` point at reachable instances. Local
  dev: `docker compose up postgres redis` or run them natively.
- Run `pnpm db:migrate` — a fresh database has no tables until migrations
  run.
- In Docker Compose, the `migrate` one-shot service must complete
  successfully before `api`/`worker` start (see `depends_on` in
  `docker-compose.yml`); check `docker compose logs migrate` if they never
  come up healthy.

## Publisher Agent says "No taxonomy_id configured"

Expected and intentional — see `docs/ETSY_SETUP.md` step 6. Run
`pnpm tsx scripts/fetch-etsy-taxonomy.ts` and fill in
`apps/worker/src/config/etsy-taxonomy.json`. The system will not guess a
category id.

## A product keeps failing QA and gets cancelled

Check its `qa_reports` rows (or the Products page) for the specific
`issues` — common ones:

- `LOW_DPI` — a requested print size renders below 300 DPI; check
  `packages/product-generator/src/sizes.ts` if you've added a custom size.
- `IP_RISK` — the generated title/description/tags matched something in
  `packages/qa/src/config/ip-blocklist.json`. If it's a false positive,
  the blocklist entry may be too broad; if it's a real risk, that's the
  system working correctly.
- `PDF_CORRUPT` / `ZIP_CORRUPT` — usually a transient rendering issue;
  check the worker logs for the actual render error. `QA_MAX_RETRIES`
  controls how many times it retries before giving up.

## Font rendering fails / product generation hangs

`packages/product-generator` fetches Google Fonts over the network on
first use per font+weight, caching to `.font-cache/` inside the worker
package. If the worker's network egress is blocked, this will fail — check
worker logs for a fetch error from `fonts.googleapis.com`/
`fonts.gstatic.com`. Once cached, no network is needed for that font again.

## Etsy API calls failing with 429

Etsy enforces both QPS and a daily quota (`packages/etsy/src/constants.ts`
documents the values as last verified — re-check
https://developer.etsy.com/documentation/essentials/rate-limits/ if this
changes). The client already paces requests and retries with backoff; if
you're still hitting 429s repeatedly, check `remainingDailyQuota` via
`/api/etsy/oauth/verify` — you may need to reduce `MAX_PRODUCTS_PER_DAY`
or scheduled job frequency.

## OAuth callback fails / "state_mismatch" or "missing_pkce_cookie"

The OAuth flow's PKCE state lives in a short-lived (10 min) httpOnly
cookie. This fails if: the callback URL in your Etsy Developer app doesn't
exactly match `ETSY_OAUTH_REDIRECT_URI`, you took more than 10 minutes to
approve on Etsy's consent screen, or the API and the browser aren't on
compatible domains for cookies (check `NODE_ENV`/`secure` cookie settings
in production — the callback must be HTTPS).

## Docker build fails on `pnpm install --frozen-lockfile`

`pnpm-lock.yaml` is out of sync with a `package.json` — run `pnpm install`
locally (which updates the lockfile) and commit the result before
rebuilding.

## Monitoring in production

There's no separate metrics stack bundled (would be over-engineering for
a single-shop system) — instead:

- `GET /health` (api, :4000) and `GET /health` (worker, :4100) are cheap
  liveness checks; `GET /health/ready` (api) additionally verifies
  Postgres and Redis connectivity. `docker-compose.yml` already wires
  these into container healthchecks.
- All three services log structured JSON (pino) — point any log
  aggregator (or just `docker compose logs -f`) at stdout.
- The dashboard's **Alerts** page and P0/P1 alerts are the actual signal
  to act on; health checks catch "is it up," alerts catch "is it working
  correctly."
- For uptime monitoring of the public health endpoints, any external HTTP
  monitor (a simple cron+curl, Uptime Kuma, etc.) pointed at `/health` is
  sufficient — no code changes needed to add one.
