#!/usr/bin/env bash
# Change the dashboard admin password on the live VPS.
#
# Run this ONE LINE over SSH on the VPS (srv1611752.hstgr.cloud):
#   curl -fsSL "https://raw.githubusercontent.com/akifyapayzeka/etsymagazam/main/scripts/change-admin-password.sh?nocache=$(date +%s)" | bash
#
# Asks for the new password twice (hidden input), hashes it with the
# bcryptjs already inside the built api image (the plaintext password is
# piped in over stdin and never written to .env, a log, or shell history —
# only the resulting hash is stored), replaces ADMIN_PASSWORD_HASH in .env,
# and restarts only the api container so it picks up the change. Nothing
# else in the stack is touched.
set -euo pipefail

PROJECT_DIR="/opt/etsy-autopilot"
COMPOSE="docker compose -p etsy-autopilot -f docker-compose.prod.yml"
API_IMAGE="etsy-autopilot-api"
TTY=/dev/tty

cd "$PROJECT_DIR"

if [ ! -f .env ]; then
  echo "No .env found in $PROJECT_DIR — run the main deploy script first." >&2
  exit 1
fi

while true; do
  read -r -s -p "New dashboard admin password (hidden): " pw1 < "$TTY"
  echo "" > "$TTY"
  read -r -s -p "Confirm new password: " pw2 < "$TTY"
  echo "" > "$TTY"
  if [ -n "$pw1" ] && [ "$pw1" = "$pw2" ]; then
    ADMIN_PASSWORD_PLAIN="$pw1"
    unset pw1 pw2
    break
  fi
  echo "Passwords empty or did not match — try again." > "$TTY"
  unset pw1 pw2
done

echo "Hashing with bcryptjs inside the api image..."
NEW_HASH=$(printf '%s' "$ADMIN_PASSWORD_PLAIN" | docker run --rm -i \
  --workdir /repo/apps/api --entrypoint node "$API_IMAGE" -e '
    const bcrypt = require("bcryptjs");
    let data = "";
    process.stdin.on("data", (c) => { data += c; });
    process.stdin.on("end", () => {
      process.stdout.write(bcrypt.hashSync(data, 12));
    });
  ')
unset ADMIN_PASSWORD_PLAIN

grep -v '^ADMIN_PASSWORD_HASH=' .env > .env.tmp || true
mv .env.tmp .env
echo "ADMIN_PASSWORD_HASH=${NEW_HASH}" >> .env
chmod 600 .env

echo "Restarting api..."
$COMPOSE up -d --force-recreate api

echo ""
echo "PASSWORD CHANGED"
echo "Log in again at https://etsy-admin.studyoafg.com with the new password."
