# Security

## Secrets

- **Never commit `.env`** — it's gitignored. `.env.example` documents every
  variable with no real values.
- With `NODE_ENV=production`, boot fails fast (before serving any traffic)
  if `ETSY_API_KEYSTRING`, `ETSY_SHARED_SECRET`, `ENCRYPTION_KEY`,
  `SESSION_SECRET`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD_HASH` is empty, or if
  `SESSION_SECRET` is still the dev-only placeholder value — see
  `packages/core/src/env.ts`'s `assertProductionSecrets`. This check is a
  no-op outside production, so local/dev/test boot normally without every
  secret filled in.
- Loggers (`packages/core/src/logger.ts`, and the Fastify API server's own
  request logger) redact common secret-shaped field names and sensitive
  request headers (`authorization`, `cookie`, `x-api-key`,
  `webhook-signature`) as defense-in-depth — no code path in this repo
  intentionally logs a raw secret, but a field named like one won't leak
  even if that ever changes by mistake.
- Etsy OAuth tokens are encrypted at rest (AES-256-GCM,
  `packages/core/src/crypto.ts`) using `ENCRYPTION_KEY`
  (`openssl rand -base64 32`). Losing this key means losing the ability to
  decrypt stored tokens — you'd need to reconnect Etsy.
- Passwords are never stored — only a bcrypt hash (`ADMIN_PASSWORD_HASH`),
  generated via `pnpm --filter @etsymagazam/api run hash-password`.
- Webhook payloads are verified with HMAC-SHA256 against
  `ETSY_WEBHOOK_SIGNING_SECRET` before anything in the payload is trusted
  (`packages/etsy/src/webhooks.ts`), including a 300-second replay-attack
  window.

## Auth (dashboard/API)

Single-admin, stateless signed-cookie session
(`apps/api/src/lib/session.ts`, HMAC-SHA256 with `SESSION_SECRET`, 12h
expiry) plus a double-submit CSRF cookie required on every mutating
request. Rate limiting: 200 req/min globally, 5 attempts/15min on login
specifically (`@fastify/rate-limit`).

## Etsy API usage — what this system will and will not do

Only the officially documented Etsy Open API v3 is used: OAuth 2.0 with
PKCE, REST endpoints for listings/images/files/receipts, and the official
order webhooks. Specifically, this system **never**:

- scrapes Etsy web pages
- automates a browser to act as a logged-in user
- attempts to solve or bypass CAPTCHAs
- rotates proxies to evade detection or rate limits
- bypasses or exceeds Etsy's documented rate limits (`packages/etsy`
  paces requests to the documented QPS and tracks the daily quota,
  backing off — honoring `Retry-After` — on 429s)
- fabricates reviews, sales, or any other data
- copies another seller's listing or uses copyrighted/trademarked material
  (see the IP/Policy Guard in `packages/qa/src/ip-guard.ts`, and the
  Creativity Standards AI-disclosure handling in
  `packages/qa/src/ai-disclosure.ts`)

If Etsy's official capabilities are ever insufficient for something this
system wants to do (e.g. fully automated customer messaging), the answer
is to flag it for a human, not to work around the API — see
`docs/AUTOPILOT.md`'s "Customer messages" section.

## Input validation

All API request bodies/queries are validated with `zod` schemas before
touching the database (`apps/api/src/routes/*`). Prisma's parameterized
queries prevent SQL injection by construction — this codebase never
builds raw SQL from request input.

## Retry & idempotency

- Etsy API calls retry with exponential backoff on 429/5xx (honoring
  `Retry-After`), and give up cleanly (no retry) on 4xx client errors —
  see `tests/etsy-client-retry.test.ts`.
- Webhook events are deduplicated on `(provider, external_id)` — a
  redelivered webhook is a no-op, never processed twice
  (`tests/webhook-idempotency.test.ts`).
- BullMQ jobs get 3 attempts with exponential backoff
  (`packages/core/src/queues.ts`); a job that exhausts all attempts
  becomes a dead letter and raises a P1 alert automatically rather than
  silently vanishing.

## Reporting a concern

If you find a security issue in this codebase, treat it like any other
bug in your own fork — this is a personal-shop project, not a maintained
open-source package with a formal disclosure process.
