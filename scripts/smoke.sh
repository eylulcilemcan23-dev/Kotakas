#!/usr/bin/env bash
set -euo pipefail

PORT=3456 NODE_ENV=test node src/server.js >/tmp/kotakas-smoke.log 2>&1 &
PID=$!
trap 'kill "$PID" 2>/dev/null || true' EXIT

for _ in 1 2 3 4 5; do
  if curl --silent --fail http://127.0.0.1:3456/api/public-config >/tmp/kotakas-public.json; then
    break
  fi
  sleep 1
done

curl --silent --fail http://127.0.0.1:3456/api/public-config | grep 'KOTAKAS' >/dev/null
curl --silent --fail http://127.0.0.1:3456/admin.html | grep 'KOTAKAS' >/dev/null
curl --silent --fail http://127.0.0.1:3456/kvkk.html | grep 'KOTAKAS' >/dev/null

STATUS=$(curl --silent --output /tmp/kotakas-health.json --write-out '%{http_code}' http://127.0.0.1:3456/api/health || true)
if [ "$STATUS" != "503" ] && [ "$STATUS" != "200" ]; then
  echo "Unexpected health status: $STATUS"
  cat /tmp/kotakas-health.json || true
  exit 1
fi

echo "KOTAKAS source smoke test OK"
