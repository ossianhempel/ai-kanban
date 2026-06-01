#!/usr/bin/env bash
# Update a git-clone AI Kanban installation (Docker production path).
# Requires: git, docker, docker compose plugin.
# Run from the installation directory, or set AIKANBAN_INSTALL_DIR.
#
# Usage:
#   ./scripts/update-installation.sh
#   AIKANBAN_UPDATE_BRANCH=main ./scripts/update-installation.sh

set -euo pipefail

INSTALL_DIR="${AIKANBAN_INSTALL_DIR:-$(pwd)}"
BRANCH="${AIKANBAN_UPDATE_BRANCH:-main}"
COMPOSE_PROD="${AIKANBAN_COMPOSE_PROD:-docker-compose.prod.yml}"

cd "$INSTALL_DIR"

if [[ ! -d .git ]]; then
  echo "error: not a git repository ($INSTALL_DIR)" >&2
  echo "Run this from your installation directory (where you cloned ai-kanban)." >&2
  exit 1
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "error: docker-compose.yml not found in $INSTALL_DIR" >&2
  exit 1
fi

if [[ ! -f "$COMPOSE_PROD" ]] && [[ -f docs/deploy/examples/docker-compose.prod.yml ]]; then
  echo "Copying docs/deploy/examples/docker-compose.prod.yml -> $COMPOSE_PROD"
  cp docs/deploy/examples/docker-compose.prod.yml "$COMPOSE_PROD"
fi

if [[ ! -f "$COMPOSE_PROD" ]]; then
  echo "error: missing $COMPOSE_PROD (copy from docs/deploy/examples/docker-compose.prod.yml)" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "error: missing .env (copy from .env.example or docs/deploy/examples/env.production.example)" >&2
  exit 1
fi

echo "==> Fetching latest from origin/$BRANCH"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Rebuilding and restarting containers"
docker compose -f docker-compose.yml -f "$COMPOSE_PROD" up -d --build

echo "==> Waiting for health check"
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then
    echo "OK — AI Kanban is healthy at http://127.0.0.1:3000/health"
    exit 0
  fi
  sleep 2
done

echo "warning: container started but health check did not pass within 60s" >&2
echo "Run: docker compose -f docker-compose.yml -f $COMPOSE_PROD logs -f ai-kanban" >&2
exit 1
