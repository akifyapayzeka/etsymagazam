#!/usr/bin/env bash
# Read-only diagnostic for the Etsy 403 "Invalid API credentials" loop.
# Never prints the actual keystring or shared secret — only length and
# last 4 chars, enough to compare across .env / the running container /
# what Etsy itself received.
#
# Run this ONE LINE over SSH on the VPS (srv1611752.hstgr.cloud):
#   curl -fsSL "https://raw.githubusercontent.com/akifyapayzeka/etsymagazam/main/scripts/diagnose-etsy-secret.sh?nocache=$(date +%s)" | bash
set -euo pipefail

PROJECT_DIR="/opt/etsy-autopilot"
COMPOSE="docker compose -p etsy-autopilot -f docker-compose.prod.yml"

cd "$PROJECT_DIR"

echo "== 1/3  .env on disk =="
awk -F= '/^ETSY_API_KEYSTRING=/{v=$0; sub(/^ETSY_API_KEYSTRING=/,"",v); print "ENV_KEYSTRING_LENGTH="length(v); print "ENV_KEYSTRING_LAST4="substr(v,length(v)-3,4)}' .env
awk -F= '/^ETSY_SHARED_SECRET=/{v=$0; sub(/^ETSY_SHARED_SECRET=/,"",v); print "ENV_SECRET_PRESENT="(length(v)>0?"yes":"no"); print "ENV_SECRET_LENGTH="length(v); print "ENV_SECRET_LAST4="substr(v,length(v)-3,4)}' .env

echo ""
echo "== 2/3  What the running api container process actually sees =="
$COMPOSE exec -T api node -e '
  const k = process.env.ETSY_API_KEYSTRING || "";
  const s = process.env.ETSY_SHARED_SECRET || "";
  console.log("CONTAINER_KEYSTRING_LENGTH="+k.length);
  console.log("CONTAINER_KEYSTRING_LAST4="+k.slice(-4));
  console.log("CONTAINER_SECRET_PRESENT="+(s.length>0?"yes":"no"));
  console.log("CONTAINER_SECRET_LENGTH="+s.length);
  console.log("CONTAINER_SECRET_LAST4="+s.slice(-4));
'

echo ""
echo "== 3/3  What code the running container image actually has =="
$COMPOSE exec -T api sh -lc '
  echo "CONTAINER_CODE_X_API_KEY_LINE:"
  grep -n "x-api-key" /repo/packages/etsy/src/client.ts | head -5
'
