#!/usr/bin/env bash
# Etsy AI Autopilot — VPS source-build deploy script.
#
# Run this VIA SSH ON THE VPS (srv1611752.hstgr.cloud), as a user with
# docker permissions. NOT run in CI, NOT run by an AI agent — this script
# needs real shell access to the target VPS, which nothing else in this
# repo has.
#
# What it does, in order: checks RAM/swap and adds a safety swapfile only
# if none exists; clones (or pulls) this PUBLIC repo with no token needed;
# generates the three internal-only secrets straight into a local .env if
# they're not already there (POSTGRES_PASSWORD, ENCRYPTION_KEY,
# SESSION_SECRET — never Etsy credentials); stops with instructions if the
# human-provided secrets are still missing; builds api, worker, and
# dashboard ONE AT A TIME (never parallel — this VPS is 1 CPU/4GB and
# already runs an unrelated n8n stack); runs the DB migration; starts the
# stack. It never touches the existing `n8n` or `studyoafg` Docker Compose
# projects on this VPS.
#
# Usage: ./scripts/deploy-vps.sh
# Safe to re-run.
set -euo pipefail

PROJECT_DIR="/opt/etsy-autopilot"
REPO_URL="https://github.com/akifyapayzeka/etsymagazam.git"
COMPOSE="docker compose -p etsy-autopilot -f docker-compose.prod.yml"

echo "== 1. RAM / swap check =="
free -h
TOTAL_MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "$SWAP_MB" -eq 0 ] && [ "$TOTAL_MEM_MB" -lt 6000 ]; then
  echo "No swap and RAM < 6GB — adding a 2GB swapfile for safety during builds."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  free -h
else
  echo "Swap already present (${SWAP_MB}MB) or RAM >= 6GB — skipping."
fi

echo "== 2. Clone/pull the repo (public — no token needed) =="
sudo mkdir -p "$PROJECT_DIR"
sudo chown "$(id -u):$(id -g)" "$PROJECT_DIR"
if [ -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git fetch origin main
  git checkout main
  git reset --hard origin/main
else
  git clone --branch main "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

echo "== 3. Ensure .env has the required secrets =="
touch .env
gen_if_missing() {
  local key="$1" value
  if ! grep -q "^${key}=" .env; then
    value="$2"
    echo "${key}=${value}" >> .env
    echo "Generated ${key} (internal-only secret, not an Etsy credential)."
  fi
}
gen_if_missing POSTGRES_PASSWORD "$(openssl rand -hex 24)"
gen_if_missing ENCRYPTION_KEY "$(openssl rand -base64 32)"
gen_if_missing SESSION_SECRET "$(openssl rand -base64 48)"

missing=()
for key in ETSY_API_KEYSTRING ETSY_SHARED_SECRET ADMIN_EMAIL ADMIN_PASSWORD_HASH; do
  grep -q "^${key}=.\+" .env || missing+=("$key")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "!! Missing required secrets in ${PROJECT_DIR}/.env: ${missing[*]}"
  echo "!! Edit ${PROJECT_DIR}/.env now (nano .env) and add them, e.g.:"
  echo "     ETSY_API_KEYSTRING=..."
  echo "     ETSY_SHARED_SECRET=..."
  echo "     ADMIN_EMAIL=you@example.com"
  echo "     ADMIN_PASSWORD_HASH=\$2b\$12\$... (from: pnpm --filter @etsymagazam/api run hash-password -- \"your-password\", run on YOUR machine, never here)"
  echo "!! Then re-run this script."
  exit 1
fi

echo "== 4. Confirm the existing Traefik network is reachable =="
docker network inspect n8n_default >/dev/null 2>&1 || { echo "n8n_default network not found — is the n8n stack running? Aborting."; exit 1; }

echo "== 5. Build images ONE AT A TIME (never parallel) =="
$COMPOSE build api
$COMPOSE build worker
$COMPOSE build dashboard

echo "== 6. Run database migration =="
$COMPOSE run --rm migrate

echo "== 7. Start the stack =="
$COMPOSE up -d

echo "== 8. Status =="
$COMPOSE ps

cat <<'EOF'

Done. Verify from any machine with internet access:
  curl -sS https://etsy-api.studyoafg.com/health
  curl -sSI https://etsy-admin.studyoafg.com

TLS certificate issuance by the existing shared Traefik can take a couple
of minutes after the first start — retry if you get a TLS error right away.

This never touched the existing n8n or studyoafg Docker Compose projects.
EOF
