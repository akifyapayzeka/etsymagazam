#!/usr/bin/env bash
# Re-set ETSY_API_KEYSTRING on the live VPS (in case a stray space/newline
# from the original entry is silently getting sent to Etsy, even though the
# value looks correct when read back).
#
# Run this ONE LINE over SSH on the VPS (srv1611752.hstgr.cloud):
#   curl -fsSL "https://raw.githubusercontent.com/akifyapayzeka/etsymagazam/main/scripts/change-etsy-keystring.sh?nocache=$(date +%s)" | bash
#
# Etsy's API Keystring is the OAuth client_id — it's meant to appear in the
# browser URL during the Etsy consent screen, so (unlike the Shared Secret)
# it's fine for this prompt to show it as you type. The value is trimmed of
# leading/trailing whitespace before being written, replaces the existing
# line in .env, and only the api container is restarted to pick it up.
set -euo pipefail

PROJECT_DIR="/opt/etsy-autopilot"
COMPOSE="docker compose -p etsy-autopilot -f docker-compose.prod.yml"
TTY=/dev/tty

cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  echo "No .env found in $PROJECT_DIR — run the main deploy script first." >&2
  exit 1
fi

read -r -p "Etsy API Keystring: " keystring < "$TTY"
# Trim leading/trailing whitespace (a stray space/newline here is exactly
# the kind of thing that makes Etsy reject the app as "not recognized" even
# though the value looks right when you read it back).
keystring="$(printf '%s' "$keystring" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

if [ -z "$keystring" ]; then
  echo "Empty keystring entered — aborting, .env left unchanged." >&2
  exit 1
fi

grep -v '^ETSY_API_KEYSTRING=' .env > .env.tmp || true
mv .env.tmp .env
echo "ETSY_API_KEYSTRING=${keystring}" >> .env
chmod 600 .env

echo "Restarting api..."
$COMPOSE up -d --force-recreate api

echo ""
echo "KEYSTRING UPDATED"
echo "Try Connect Etsy again from https://etsy-admin.studyoafg.com/settings"
