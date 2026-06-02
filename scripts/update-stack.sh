#!/usr/bin/env bash
# Update a pull-based AI Kanban install (bootstrap / docker-compose.stack.yml).
# No git required — pulls a new container image and recreates containers.
#
# Usage:
#   cd /opt/ai-kanban && ./scripts/update-stack.sh
#   AIKANBAN_INSTALL_DIR=/opt/ai-kanban ./scripts/update-stack.sh
#
# Pin a version in .env first, e.g. AIKANBAN_IMAGE=ghcr.io/ossianhempel/ai-kanban:v0.1.0

set -euo pipefail

INSTALL_DIR="${AIKANBAN_INSTALL_DIR:-$(pwd)}"
REPO_RAW="${AIKANBAN_REPO_RAW:-https://raw.githubusercontent.com/ossianhempel/ai-kanban/main}"
REFRESH_CONFIG="${AIKANBAN_REFRESH_CONFIG:-0}"

usage() {
  cat <<'EOF'
Update AI Kanban (Docker pull deploy)

  --install-dir <path>   Install directory (default: current directory)
  --refresh-config       Re-download compose + Caddyfile from upstream (keeps .env and data/)
  -h, --help

Requires: existing .env and docker-compose.yml in the install directory.

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --refresh-config)
      REFRESH_CONFIG=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

cd "$INSTALL_DIR"

if [[ ! -f docker-compose.yml ]]; then
  echo "error: docker-compose.yml not found in $INSTALL_DIR" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "error: missing .env in $INSTALL_DIR" >&2
  exit 1
fi

if [[ "$REFRESH_CONFIG" == "1" ]]; then
  echo "==> Refreshing compose files from $REPO_RAW"
  if grep -q "caddy" docker-compose.yml 2>/dev/null; then
    curl -fsSL "$REPO_RAW/docs/deploy/examples/docker-compose.stack.yml" -o docker-compose.yml
    curl -fsSL "$REPO_RAW/docs/deploy/examples/Caddyfile.docker" -o Caddyfile
  else
    curl -fsSL "$REPO_RAW/docs/deploy/examples/docker-compose.http.yml" -o docker-compose.yml
  fi
fi

# shellcheck disable=SC1091
source .env 2>/dev/null || true
IMAGE="${AIKANBAN_IMAGE:-ghcr.io/ossianhempel/ai-kanban:latest}"
echo "==> Pulling $IMAGE"
export AIKANBAN_IMAGE="$IMAGE"
docker compose pull

echo "==> Recreating containers (data volume unchanged)"
docker compose up -d

echo "==> Waiting for health"
HEALTH_URL="http://127.0.0.1:3000/health"
if [[ -n "${DOMAIN:-}" ]]; then
  HEALTH_URL="https://${DOMAIN}/health"
fi

for _ in $(seq 1 40); do
  if curl -kfsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "OK — healthy ($HEALTH_URL)"
    exit 0
  fi
  if curl -fsS http://127.0.0.1:3000/health >/dev/null 2>&1; then
    echo "OK — healthy (http://127.0.0.1:3000/health)"
    exit 0
  fi
  sleep 2
done

echo "warning: health check did not pass — inspect logs:" >&2
echo "  docker compose -f $INSTALL_DIR/docker-compose.yml logs -f ai-kanban" >&2
exit 1
