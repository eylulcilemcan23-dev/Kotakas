#!/usr/bin/env bash
set -euo pipefail

PORT=3456 NODE_ENV=test node src/server.js >/tmp/kotakas-smoke.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in 1 2 3 4 5 6 7 8; do
  if curl --silent --fail http://127.0.0.1:3456/api/public-config >/tmp/kotakas-public.json; then
    break
  fi
  sleep 1
done

curl --silent --fail http://127.0.0.1:3456/api/public-config | grep 'KOTAKAS' >/dev/null

while IFS= read -r page; do
  [ -z "$page" ] && continue
  body="/tmp/kotakas-smoke-$(echo "$page" | tr '/.' '__').html"
  curl --silent --fail "http://127.0.0.1:3456${page}" --output "$body"
  grep 'KOTAKAS' "$body" >/dev/null || {
    echo "KOTAKAS marker missing on $page"
    exit 1
  }
done < scripts/smoke-pages.txt

curl --silent --dump-header /tmp/kotakas-headers.txt --output /dev/null http://127.0.0.1:3456/
grep -qi '^x-content-type-options: nosniff' /tmp/kotakas-headers.txt || {
  echo 'Missing X-Content-Type-Options security header'
  cat /tmp/kotakas-headers.txt
  exit 1
}
if grep -qi '^x-powered-by:' /tmp/kotakas-headers.txt; then
  echo 'x-powered-by header must not be exposed'
  exit 1
fi

UNKNOWN_STATUS=$(curl --silent --output /tmp/kotakas-unknown.json --write-out '%{http_code}' http://127.0.0.1:3456/api/definitely-not-a-route || true)
if [ "$UNKNOWN_STATUS" != "404" ]; then
  echo "Unknown API route should return 404, got: $UNKNOWN_STATUS"
  exit 1
fi

WALLET_STATUS=$(curl --silent --output /tmp/kotakas-wallet.json --write-out '%{http_code}' http://127.0.0.1:3456/api/wallet/me || true)
if [ "$WALLET_STATUS" != "401" ]; then
  echo "Unauthenticated wallet request should return 401, got: $WALLET_STATUS"
  cat /tmp/kotakas-wallet.json || true
  exit 1
fi

STATUS=$(curl --silent --output /tmp/kotakas-health.json --write-out '%{http_code}' http://127.0.0.1:3456/api/health || true)
if [ "$STATUS" != "503" ] && [ "$STATUS" != "200" ]; then
  echo "Unexpected health status: $STATUS"
  cat /tmp/kotakas-health.json || true
  exit 1
fi

echo "KOTAKAS source smoke test OK ($(grep -cve '^$' scripts/smoke-pages.txt) page routes + security guards)"
