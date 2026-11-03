#!/usr/bin/env bash
# Runs on the production droplet. Replaces the hosted frontend and restarts
# only the CRM server. Does not recreate Postgres, Redis, or the worker.
set -euo pipefail

front_dir=/opt/twenty/front
src=/tmp/crm-front-src
if [[ ! -f "$src/index.html" ]]; then
  echo "Missing extracted frontend at $src" >&2
  exit 1
fi
if [[ ! -d "$front_dir" ]]; then
  echo "Missing $front_dir. Refusing to invent a new CRM install." >&2
  exit 1
fi

stamp=$(date +%Y%m%d%H%M%S)
cp -a "$front_dir" "/opt/twenty/front.bak-$stamp"
rsync -a --delete "$src/" "$front_dir/"
find "$front_dir" -name '._*' -delete
rm -rf "$src"

docker restart twenty-server-1 >/dev/null
for _ in $(seq 1 36); do
  code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/healthz || true)
  if [[ "$code" == "200" ]]; then
    echo "health 200"
    exit 0
  fi
  sleep 5
done

echo "Server did not become healthy. Previous frontend is at /opt/twenty/front.bak-$stamp" >&2
exit 1
