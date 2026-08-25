# Production deployment — Etsy AI Autopilot / Form & Fern

Deployed as an **isolated** Docker Compose project on an existing Hostinger
VPS that also runs an unrelated n8n stack. Nothing here touches n8n's
containers, database, Redis, volumes, or environment.

## Architecture

```
Internet → shared Traefik (already running, part of the "n8n" project)
             ├─ etsy-api.studyoafg.com   → api container (port 4000)
             └─ etsy-admin.studyoafg.com → dashboard container (port 3000)

Docker network "etsy_internal" (created by this project, not internet-reachable):
  postgres, redis, worker, api, migrate

Docker network "n8n_default" (external, pre-existing — Traefik's network):
  api, dashboard only
```

- **postgres** and **redis** have no published ports and are not on
  `n8n_default` — unreachable from the internet or from the n8n stack.
- **worker** has no published ports, no Traefik labels, and is only on
  `etsy_internal` — never internet-reachable, matching the requirement that
  the autopilot's background worker never opens a public port.
- **api** and **dashboard** are the only two services on `n8n_default`, and
  only because that's where the shared Traefik lives to route HTTPS to them.
- Compose project name: `etsy-autopilot` (separate from `n8n` and
  `studyoafg`). Separate named volumes: `etsy_postgres_data`,
  `etsy_redis_data`, `etsy_storage_data`.
- `mem_limit`/`cpus` are set on every service — this VPS is a single-core,
  4GB box already running n8n + Traefik + a static site. Limits keep a
  runaway container from starving the existing workloads. If the box feels
  tight in practice, scaling the VPS plan is the fix, not raising these.

## Images

`docker-compose.prod.yml` has no `build:` sections — the VPS pulls
pre-built images from GHCR:

- `ghcr.io/akifyapayzeka/etsymagazam-api`
- `ghcr.io/akifyapayzeka/etsymagazam-worker`
- `ghcr.io/akifyapayzeka/etsymagazam-dashboard`

Built by `.github/workflows/deploy.yml` (manual `workflow_dispatch` only —
this repo has no automatic deploy-on-merge). The dashboard image bakes in
`NEXT_PUBLIC_API_BASE_URL` at **build** time (Next.js client-side env vars
are compiled in, not read at runtime) — the workflow's
`dashboard_api_base_url` input must exactly match the real production API
URL (`https://etsy-api.studyoafg.com`).

**One-time manual step after the first push:** GHCR packages default to
**private** even in a public repo. Go to the repo's GitHub page → Packages
→ each of the 3 `etsymagazam-*` packages → Package settings → change
visibility to Public (or connect a registry credential to the VPS instead,
if you'd rather keep them private — the Hostinger Docker Manager deploy
flow used here has no login step, so public is the simpler default for
non-sensitive application images with no secrets baked in).

## Environment variables

Set on the Hostinger side via **hPanel → VPS → Docker Manager →
`etsy-autopilot` project → Environment**, never committed to this repo.

### Secrets — you enter these yourself, never paste them in chat or commit them

| Variable | What it is | How to get it |
|---|---|---|
| `ETSY_API_KEYSTRING` | Etsy Seller App keystring | Etsy Developer Portal, your app's Keystring |
| `ETSY_SHARED_SECRET` | Etsy Seller App shared secret (the one you just rotated) | Etsy Developer Portal, your app's Shared Secret |
| `ETSY_WEBHOOK_SIGNING_SECRET` | Only if you set up Etsy webhooks | Etsy Developer Portal webhook config |
| `ADMIN_EMAIL` | Your dashboard login email | Pick one |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of your dashboard login password | Run **on your own machine**, never here: `pnpm --filter @etsymagazam/api run hash-password -- "your-password"` — paste only the resulting hash, never the plaintext password |

### Internal secrets — safe for me to generate, not Etsy credentials

| Variable | What it is |
|---|---|
| `POSTGRES_PASSWORD` | Internal DB password (Postgres is not internet-reachable) |
| `ENCRYPTION_KEY` | 32-byte base64 key encrypting OAuth tokens at rest (`openssl rand -base64 32`) |
| `SESSION_SECRET` | Signs dashboard session cookies (`openssl rand -base64 48`) |

### Non-secret config (already wired into `docker-compose.prod.yml`)

`API_BASE_URL`, `DASHBOARD_BASE_URL`, `ETSY_OAUTH_REDIRECT_URI`,
`ETSY_WEBHOOK_URL`, `BRAND_DISPLAY_NAME`, `AUTO_PUBLISH=false`,
`DRY_RUN=true` are hardcoded in the compose file's `environment:` block —
no need to set these separately.

### Autopilot pause state

`AutopilotState.isPaused` is a **database row**, not an environment
variable — it is set to `true` automatically the first time OAuth connects
successfully (see `apps/api/src/routes/etsy-oauth.ts`). Flip it from the
dashboard's Autopilot settings page when you're ready to unpause; there is
no env var for this.

## DNS

Two new A/AAAA records on `studyoafg.com`, added without touching any
existing record:

| Type | Name | Value |
|---|---|---|
| A | `etsy-api` | `72.61.179.151` |
| AAAA | `etsy-api` | `2a02:4780:41:b854::1` |
| A | `etsy-admin` | `72.61.179.151` |
| AAAA | `etsy-admin` | `2a02:4780:41:b854::1` |

## Deploy steps

1. Trigger `.github/workflows/deploy.yml` (`workflow_dispatch`) to build and
   push the 3 images to GHCR.
2. Make the 3 GHCR packages public (see above, one-time).
3. Fill in the secrets above via hPanel's Docker Manager environment editor
   for the `etsy-autopilot` project.
4. Deploy/redeploy the `etsy-autopilot` Docker Compose project on the VPS
   (Hostinger's Docker Manager, pointed at `docker-compose.prod.yml`).
5. Verify: `https://etsy-api.studyoafg.com/health` and
   `https://etsy-admin.studyoafg.com` both resolve over HTTPS and return a
   healthy response. TLS is issued automatically by the existing shared
   Traefik (`mytlschallenge` resolver) once DNS has propagated — this can
   take a few minutes after the DNS records are added.
6. Log into the dashboard, go to Settings, and use "Connect Etsy" to start
   OAuth (`GET /api/etsy/oauth/start`, behind dashboard login) — do this
   only after every secret above is filled in and the API's `/health`
   endpoint is green.

## What this deploy deliberately does NOT do

- Does not open a new Etsy listing, publish anything, or touch the existing
  manual first listing.
- Does not flip `AUTO_PUBLISH` or `DRY_RUN`, and does not unpause the
  autopilot — those stay at their safe defaults until a human changes them
  from the dashboard after OAuth is verified end-to-end.
- Does not modify, restart, or resource-limit the existing `n8n` or
  `studyoafg` Docker Compose projects on the same VPS.
