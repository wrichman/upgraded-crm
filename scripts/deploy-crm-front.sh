#!/usr/bin/env bash
# Ship packages/twenty-front/build to the local Docker CRM, the production
# droplet, or both. Frontend only: database volumes are not touched.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
target=${1:-}
build="$root/packages/twenty-front/build"
host=${CRM_HOST:-146.190.213.128}
local_compose="$root/upgraded-crm/docker-compose.yml"
local_front="$root/upgraded-crm/front"

usage() {
  echo "Usage: $0 local|production|both" >&2
  exit 2
}

[[ "$target" == "local" || "$target" == "production" || "$target" == "both" ]] || usage

if [[ "${SKIP_BUILD:-}" != "1" ]]; then
  echo "Building frontend"
  (cd "$root" && NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}" npx nx build twenty-front)
fi

if [[ ! -f "$build/index.html" ]]; then
  echo "No frontend build at $build" >&2
  exit 1
fi
if ! grep -q "Run Revenue Agent" "$build"/assets/*.js; then
  echo "Build is missing the People header labels. Refusing to deploy it." >&2
  exit 1
fi

deploy_local() {
  if [[ ! -f "$local_compose" ]]; then
    echo "Local compose not found at $local_compose" >&2
    exit 1
  fi
  python3 - "$local_compose" <<'PY'
import pathlib, sys
path = pathlib.Path(sys.argv[1])
text = path.read_text()
needle = "      - server-local-data:/app/packages/twenty-server/.local-storage\n"
mount = needle + "      - ./front:/app/packages/twenty-server/dist/front:ro\n"
if "dist/front" not in text:
    if needle not in text:
        raise SystemExit("Could not find the server storage volume in docker-compose.yml")
    path.write_text(text.replace(needle, mount, 1))
    print("Added local frontend mount")
else:
    print("Local frontend mount already present")
PY
  mkdir -p "$local_front"
  rsync -a --delete "$build/" "$local_front/"
  find "$local_front" -name '._*' -delete
  (
    cd "$(dirname "$local_compose")"
    docker compose up -d --no-deps --force-recreate server
  )
  for _ in $(seq 1 36); do
    code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3020/healthz || true)
    if [[ "$code" == "200" ]]; then
      echo "local health 200"
      return 0
    fi
    sleep 5
  done
  echo "Local server did not become healthy on port 3020" >&2
  exit 1
}

deploy_production() {
  ssh_opts=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
  keyfile=""
  if [[ -n "${CRM_SSH_KEY:-}" ]]; then
    keyfile=$(mktemp)
    trap 'rm -f "$keyfile"' RETURN
    printf '%s\n' "$CRM_SSH_KEY" > "$keyfile"
    chmod 600 "$keyfile"
    ssh_opts+=(-i "$keyfile")
  fi
  echo "Copying frontend to $host"
  COPYFILE_DISABLE=1 tar --no-xattrs -C "$build" -czf - . | ssh "${ssh_opts[@]}" "root@$host" 'rm -rf /tmp/crm-front-src && mkdir -p /tmp/crm-front-src && tar -xzf - -C /tmp/crm-front-src'
  ssh "${ssh_opts[@]}" "root@$host" 'bash -s' < "$root/scripts/install-crm-front.sh"
}

case "$target" in
  local) deploy_local ;;
  production) deploy_production ;;
  both)
    deploy_local
    deploy_production
    ;;
esac
