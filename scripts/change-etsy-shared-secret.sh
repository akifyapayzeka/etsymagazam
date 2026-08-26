#!/usr/bin/env bash
# Re-set ETSY_SHARED_SECRET on the live VPS — a stray character (e.g. a
# typo'd l/1 or O/0 from the original manual entry) here would let OAuth
# authorize succeed (client_id is checked first, separately) but make every
# subsequent Etsy API call fail with 403 "Invalid API credentials".
#
# Run this ONE LINE over SSH on the VPS (srv1611752.hstgr.cloud):
#   curl -fsSL "https://raw.githubusercontent.com/akifyapayzeka/etsymagazam/main/scripts/change-etsy-shared-secret.sh?nocache=$(date +%s)" | bash
#
# Unlike the Keystring, the Shared Secret is genuinely confidential, so this
# prompt hides the input (read -s) and never echoes it back. The value is
# trimmed of leading/trailing whitespace, replaces the existing line in
# .env, and only the api container is restarted to pick it up.
set -euo pipefail

PROJECT_DIR="/opt/etsy-autopilot"
COMPOSE="docker compose -p etsy-autopilot -f docker-compose.prod.yml"
TTY=/dev/tty

cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  echo "No .env found in $PROJECT_DIR — run the main deploy script first." >&2
  exit 1
fi

read -r -s -p "Etsy Shared Secret (hidden): " secret < "$TTY"
echo "" > "$TTY"
secret="$(printf '%s' "$secret" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

if [ -z "$secret" ]; then
  echo "Empty shared secret entered — aborting, .env left unchanged." >&2
  exit 1
fi

grep -v '^ETSY_SHARED_SECRET=' .env > .env.tmp || true
mv .env.tmp .env
echo "ETSY_SHARED_SECRET=${secret}" >> .env
chmod 600 .env
unset secret

echo "Restarting api..."
$COMPOSE up -d --force-recreate api

echo ""
echo "SHARED SECRET UPDATED"
echo "Try Connect Etsy again from https://etsy-admin.studyoafg.com/settings"
