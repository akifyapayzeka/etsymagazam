#!/usr/bin/env bash
# Etsy AI Autopilot — one-command VPS deploy.
#
# Run this ONE LINE over SSH on the VPS (srv1611752.hstgr.cloud):
#   curl -fsSL https://raw.githubusercontent.com/akifyapayzeka/etsymagazam/main/scripts/deploy-vps.sh | bash
#
# It asks a few questions (Etsy keystring, Etsy shared secret — hidden
# input, dashboard admin email, dashboard admin password — hidden input,
# typed twice), then does everything else on its own: checks RAM/swap and
# adds a safety swapfile only if needed; clones this public repo (no
# token); builds the api image first and uses the bcryptjs already inside
# it to hash your dashboard password (the plaintext password is piped in
# over stdin and never written to .env, a log, or shell history — only the
# resulting hash is stored); builds worker and dashboard one at a time
# (never in parallel — this VPS is 1 CPU/4GB and already runs an unrelated
# n8n stack this script never touches); runs the database migration;
# starts the stack; verifies both public HTTPS URLs itself over real
# requests before declaring success.
#
# Safe to re-run — anything already answered/generated is kept as-is.
set -euo pipefail

PROJECT_DIR="/opt/etsy-autopilot"
REPO_URL="https://github.com/akifyapayzeka/etsymagazam.git"
API_URL="https://etsy-api.studyoafg.com"
DASHBOARD_URL="https://etsy-admin.studyoafg.com"
COMPOSE="docker compose -p etsy-autopilot -f docker-compose.prod.yml"
API_IMAGE="etsy-autopilot-api"

# `read` needs the real terminal, not the pipe this script may have been
# read from (e.g. `curl ... | bash`) — every prompt below reads from
# /dev/tty explicitly so piping this script still works interactively.
TTY=/dev/tty

echo "== 1/9  RAM / swap check =="
free -h
TOTAL_MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [ "$SWAP_MB" -eq 0 ] && [ "$TOTAL_MEM_MB" -lt 6000 ]; then
  echo "No swap and RAM < 6GB — adding a 2GB swapfile for safety during builds."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
else
  echo "Swap already present (${SWAP_MB}MB) or RAM >= 6GB — skipping."
fi

echo "== 2/9  Getting the code (public repo, no token needed) =="
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

echo "== 3/9  Confirming the existing Traefik network is reachable =="
docker network inspect n8n_default >/dev/null 2>&1 || { echo "n8n_default network not found — is the n8n stack running? Aborting." >&2; exit 1; }

echo "== 4/9  Checking .env =="
touch .env
chmod 600 .env

gen_if_missing() {
  local key="$1" value
  if ! grep -q "^${key}=" .env; then
    value="$2"
    echo "${key}=${value}" >> .env
    echo "  Generated ${key} (internal secret, not shown)."
  fi
}
gen_if_missing POSTGRES_PASSWORD "$(openssl rand -hex 24)"
gen_if_missing ENCRYPTION_KEY "$(openssl rand -base64 32)"
gen_if_missing SESSION_SECRET "$(openssl rand -base64 48)"

if ! grep -q "^ETSY_API_KEYSTRING=.\+" .env; then
  read -r -p "Etsy API Keystring: " keystring < "$TTY"
  echo "ETSY_API_KEYSTRING=${keystring}" >> .env
fi

if ! grep -q "^ETSY_SHARED_SECRET=.\+" .env; then
  read -r -s -p "Etsy Shared Secret (hidden): " shared_secret < "$TTY"
  echo "" > "$TTY"
  echo "ETSY_SHARED_SECRET=${shared_secret}" >> .env
  unset shared_secret
fi

if ! grep -q "^ADMIN_EMAIL=.\+" .env; then
  read -r -p "Dashboard admin email: " admin_email < "$TTY"
  echo "ADMIN_EMAIL=${admin_email}" >> .env
fi

NEED_PASSWORD_HASH=0
if ! grep -q "^ADMIN_PASSWORD_HASH=.\+" .env; then
  NEED_PASSWORD_HASH=1
  while true; do
    read -r -s -p "Dashboard admin password (hidden): " pw1 < "$TTY"
    echo "" > "$TTY"
    read -r -s -p "Confirm password: " pw2 < "$TTY"
    echo "" > "$TTY"
    if [ -n "$pw1" ] && [ "$pw1" = "$pw2" ]; then
      ADMIN_PASSWORD_PLAIN="$pw1"
      unset pw1 pw2
      break
    fi
    echo "Passwords empty or did not match — try again." > "$TTY"
    unset pw1 pw2
  done
fi

chmod 600 .env

echo "== 5/9  Building api image (also used to hash the admin password) =="
$COMPOSE build api

if [ "$NEED_PASSWORD_HASH" = "1" ]; then
  echo "  Hashing dashboard password with bcryptjs inside the built api image..."
  ADMIN_PASSWORD_HASH=$(printf '%s' "$ADMIN_PASSWORD_PLAIN" | docker run --rm -i \
    --workdir /repo/apps/api --entrypoint node "$API_IMAGE" -e '
      const bcrypt = require("bcryptjs");
      let data = "";
      process.stdin.on("data", (c) => { data += c; });
      process.stdin.on("end", () => {
        process.stdout.write(bcrypt.hashSync(data, 12));
      });
    ')
  unset ADMIN_PASSWORD_PLAIN
  echo "ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}" >> .env
  chmod 600 .env
  echo "  Password hashed and stored — the plain password was never written to .env, a log, or shell history."
fi

echo "== 6/9  Building worker and dashboard (one at a time) =="
$COMPOSE build worker
$COMPOSE build dashboard

echo "== 7/9  Running database migration =="
$COMPOSE run --rm migrate

echo "== 8/9  Starting the stack =="
$COMPOSE up -d

echo "== 9/9  Verifying HTTPS (this can take a couple of minutes for TLS issuance) =="
VERIFIED=0
for _ in $(seq 1 25); do
  if curl -fsS --max-time 5 "${API_URL}/health" >/dev/null 2>&1 \
    && curl -fsS --max-time 5 -o /dev/null "${DASHBOARD_URL}"; then
    VERIFIED=1
    break
  fi
  sleep 6
done

if [ "$VERIFIED" != "1" ]; then
  echo "HTTPS verification did not succeed in time. Check: docker compose -p etsy-autopilot logs" >&2
  exit 1
fi

echo ""
echo "DEPLOY SUCCESS"
echo "${API_URL}/health"
echo "${DASHBOARD_URL}"
