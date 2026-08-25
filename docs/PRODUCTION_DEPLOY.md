# Production deployment — Etsy AI Autopilot / Form & Fern

Deployed as an **isolated** Docker Compose project, built directly from
source **on** an existing Hostinger VPS that also runs an unrelated n8n
stack. Nothing here touches n8n's containers, database, Redis, volumes, or
environment.

**Why source build on the VPS instead of GHCR images:** the GHCR path
(`.github/workflows/deploy.yml`) was tried first and is left in the repo,
parked. Every attempt — on a private repo, then a public repo, with
default Actions permissions, and with a raised GitHub spending limit —
failed identically: a job gets created but no GitHub-hosted runner is ever
assigned to it (`runner_id: 0`, no logs, fails in seconds). That's a
GitHub-side account/runner-pool issue, not something fixable from this
repo. Building on the VPS itself sidesteps GitHub Actions entirely.

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
  `etsy_internal` — never internet-reachable.
- **api** and **dashboard** are the only two services on `n8n_default`,
  routed through the existing shared Traefik via labels instead of new
  host ports.
- Compose project name: `etsy-autopilot` (separate from `n8n` and
  `studyoafg`). Separate named volumes: `etsy_postgres_data`,
  `etsy_redis_data`, `etsy_storage_data`.
- `mem_limit`/`cpus` are set on every runtime service — this VPS is a
  single-core, 4GB box already running n8n + Traefik + a static site.

## Deploy

Everything is automated by `scripts/deploy-vps.sh`, which must be run **via
SSH on the VPS itself** (`srv1611752.hstgr.cloud`) — it needs real shell
access nothing else in this setup has:

```bash
ssh <your-user>@srv1611752.hstgr.cloud
sudo mkdir -p /opt/etsy-autopilot && sudo chown "$(id -u):$(id -g)" /opt/etsy-autopilot
git clone --branch main https://github.com/akifyapayzeka/etsymagazam.git /opt/etsy-autopilot
cd /opt/etsy-autopilot
./scripts/deploy-vps.sh
```

The script, in order:
1. Checks RAM/swap; adds a 2GB swapfile only if none exists and RAM < 6GB.
2. Clones/pulls this **public** repo — no GitHub token needed.
3. Generates `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, `SESSION_SECRET`
   straight into `/opt/etsy-autopilot/.env` if they're not already there
   (internal-only secrets, not Etsy credentials — safe to auto-generate;
   they never leave the VPS, never pass through chat or this repo).
4. Stops with clear instructions if `ETSY_API_KEYSTRING`,
   `ETSY_SHARED_SECRET`, `ADMIN_EMAIL`, or `ADMIN_PASSWORD_HASH` are still
   missing from `.env` — **you fill these in by hand, on the VPS, via
   `nano /opt/etsy-autopilot/.env`** — see the secrets table below.
5. Builds `api`, `worker`, `dashboard` **one at a time** (never parallel —
   this box is 1 CPU/4GB, shared with n8n).
6. Runs the DB migration, then starts the full stack.

Re-running the script is safe (it won't regenerate secrets that already
exist, and Docker Compose reconciles the running state).

## Secrets — what goes in `/opt/etsy-autopilot/.env`, and who enters it

| Variable | Who sets it | Notes |
|---|---|---|
| `POSTGRES_PASSWORD` | `deploy-vps.sh`, automatically | Internal DB password (Postgres is not internet-reachable) |
| `ENCRYPTION_KEY` | `deploy-vps.sh`, automatically | 32-byte base64 key encrypting OAuth tokens at rest |
| `SESSION_SECRET` | `deploy-vps.sh`, automatically | Signs dashboard session cookies |
| `ETSY_API_KEYSTRING` | **You, by hand** | Etsy Developer Portal, your app's Keystring |
| `ETSY_SHARED_SECRET` | **You, by hand** | Etsy Developer Portal, your app's Shared Secret (the one you rotated) |
| `ETSY_WEBHOOK_SIGNING_SECRET` | **You, by hand** (optional) | Only if you set up Etsy webhooks |
| `ADMIN_EMAIL` | **You, by hand** | Your dashboard login email |
| `ADMIN_PASSWORD_HASH` | **You, by hand** | bcrypt hash of your dashboard login password — generate it **on your own machine**, never on the VPS or in chat: `pnpm --filter @etsymagazam/api run hash-password -- "your-password"`, then paste only the resulting hash |

None of these are ever written to this repository, a commit, a log, or
this chat.

### Autopilot pause state

`AutopilotState.isPaused` is a **database row**, not an environment
variable — it is set to `true` automatically the first time OAuth connects
successfully (see `apps/api/src/routes/etsy-oauth.ts`). Flip it from the
dashboard's Autopilot settings page when ready to unpause.

## DNS (already done)

| Type | Name | Value |
|---|---|---|
| A | `etsy-api` | `72.61.179.151` |
| AAAA | `etsy-api` | `2a02:4780:41:b854::1` |
| A | `etsy-admin` | `72.61.179.151` |
| AAAA | `etsy-admin` | `2a02:4780:41:b854::1` |

## Verify

```bash
curl -sS https://etsy-api.studyoafg.com/health
curl -sSI https://etsy-admin.studyoafg.com
```

Both must return a healthy response over real HTTPS before starting OAuth.
TLS is issued automatically by the existing shared Traefik
(`mytlschallenge` resolver) — can take a couple of minutes after first
start.

Then: log into the dashboard, go to Settings, and use "Connect Etsy" to
start OAuth (`GET /api/etsy/oauth/start`, behind dashboard login) — only
after every secret above is filled in and `/health` is green.

## What this deploy deliberately does NOT do

- Does not open a new Etsy listing, publish anything, or touch the existing
  manual first listing.
- Does not flip `AUTO_PUBLISH` or `DRY_RUN`, and does not unpause the
  autopilot — those stay at their safe defaults until a human changes them
  from the dashboard after OAuth is verified end-to-end.
- Does not modify, restart, or resource-limit the existing `n8n` or
  `studyoafg` Docker Compose projects on the same VPS.
- Does not use GitHub Actions, GHCR, or any paid GitHub feature.
