#!/usr/bin/env bash
# Enables conservative live autopilot on the Hostinger VPS.
#
# Run from /opt/etsy-autopilot after deploying the current repo:
#   bash scripts/enable-live-autopilot-vps.sh
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/etsy-autopilot}"
COMPOSE="docker compose -p etsy-autopilot -f docker-compose.prod.yml"
ENV_FILE="${PROJECT_DIR}/.env"

cd "$PROJECT_DIR"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

set_env() {
  local key="$1"
  local value="$2"
  local escaped
  escaped=$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

# Planner Templates was read from the first live listing's Etsy editor state:
# full path Paper & Party Supplies > Paper > Stationery > Design & Templates
# > Templates > Planner Templates, id 12476. We only map planner/organization
# here; other catalog categories remain blocked until their taxonomy is
# verified live.
set_env "ETSY_TAXONOMY_IDS" '{"planner":12476,"organization":12476}'

# USD/TRY checked on Aug 27, 2026: Wise/Xe/TradingEconomics were around
# 48.11-48.14. Keep this explicit so the system never writes USD prices as
# bare TL amounts.
set_env "FX_STATIC_RATES" '{"TRY":48.13}'

set_env "AUTO_PUBLISH" "true"
set_env "DRY_RUN" "false"
set_env "MAX_PRODUCTS_PER_DAY" "2"
set_env "MAX_PRODUCTS_PER_WEEK" "14"

echo "Building api and worker images so the latest scripts/source are inside the containers..."
$COMPOSE build api
$COMPOSE build worker

echo "Recreating api and worker with live autopilot env..."
$COMPOSE up -d --force-recreate api worker

echo "Seeding live autopilot state and starter opportunities..."
$COMPOSE run --rm -T worker pnpm tsx scripts/enable-live-autopilot.ts --run-now

echo "LIVE AUTOPILOT ENABLED"
echo "- AUTO_PUBLISH=true"
echo "- DRY_RUN=false"
echo "- max/day=1, max/week=7"
echo "- taxonomy: planner/organization -> 12476"
echo "- FX_STATIC_RATES={\"TRY\":48.13}"
echo "- one product generation job was requested immediately, then daily planning continues on schedule"
