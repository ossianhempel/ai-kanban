#!/usr/bin/env bash
# Bootstrap a production AI Kanban install (Docker pull + optional HTTPS via Caddy).
#
# Usage (on a fresh Linux VM — Azure, Hetzner, etc.):
#   curl -fsSL https://raw.githubusercontent.com/ossianhempel/ai-kanban/main/scripts/bootstrap-install.sh -o bootstrap-install.sh
#   chmod +x bootstrap-install.sh
#   sudo ./bootstrap-install.sh --domain kanban.yourcompany.com --allow-domain yourcompany.com
#
# Or from a git clone:
#   ./scripts/bootstrap-install.sh --domain kanban.yourcompany.com
#
# Environment (non-interactive):
#   DOMAIN, SIGNUP_ALLOWED_DOMAINS, INSTALL_DIR, AIKANBAN_IMAGE, AIKANBAN_HTTP_ONLY=1

set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/ai-kanban}"
REPO_RAW="${AIKANBAN_REPO_RAW:-https://raw.githubusercontent.com/ossianhempel/ai-kanban/main}"
IMAGE="${AIKANBAN_IMAGE:-ghcr.io/ossianhempel/ai-kanban:latest}"
DOMAIN=""
ALLOW_DOMAIN=""
HTTP_ONLY="${AIKANBAN_HTTP_ONLY:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FROM_CLONE=""

usage() {
  cat <<'EOF'
AI Kanban bootstrap installer

  --domain <host>           Public hostname (e.g. kanban.contoso.com). Required unless --http-only.
  --allow-domain <domain>   Email domain allowed to sign up (e.g. contoso.com). Repeatable.
  --http-only               Expose port 3000 without Caddy (set WEB_ORIGIN / BETTER_AUTH_URL in .env).
  --install-dir <path>      Install directory (default: /opt/ai-kanban)
  --image <ref>             Container image (default: ghcr.io/ossianhempel/ai-kanban:latest)
  -h, --help                Show this help

Requires: Docker Engine + Compose plugin v2, curl, openssl.

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --allow-domain)
      ALLOW_DOMAIN="${ALLOW_DOMAIN:+$ALLOW_DOMAIN,}$2"
      shift 2
      ;;
    --http-only)
      HTTP_ONLY=1
      shift
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --image)
      IMAGE="$2"
      shift 2
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

if [[ -z "$DOMAIN" && "$HTTP_ONLY" != "1" ]]; then
  echo "error: --domain is required (or use --http-only for testing)" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found. Install Docker Engine first:" >&2
  echo "  https://docs.docker.com/engine/install/ubuntu/" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose plugin not found" >&2
  exit 1
fi

if [[ -f "$SCRIPT_DIR/../docs/deploy/examples/docker-compose.stack.yml" ]]; then
  FROM_CLONE="$SCRIPT_DIR/.."
fi

OWNER="${SUDO_USER:-$USER}"
echo "==> Installing to $INSTALL_DIR (owner: $OWNER)"
sudo mkdir -p "$INSTALL_DIR/data"
sudo chown "$OWNER:$OWNER" "$INSTALL_DIR" "$INSTALL_DIR/data"

fetch() {
  local dest="$1"
  local url="$2"
  curl -fsSL "$url" -o "$dest"
}

copy_or_fetch() {
  local name="$1"
  local dest="$INSTALL_DIR/$2"
  if [[ -n "$FROM_CLONE" && -f "$FROM_CLONE/docs/deploy/examples/$name" ]]; then
    cp "$FROM_CLONE/docs/deploy/examples/$name" "$dest"
  else
    fetch "$dest" "$REPO_RAW/docs/deploy/examples/$name"
  fi
}

if [[ "$HTTP_ONLY" == "1" ]]; then
  copy_or_fetch "docker-compose.http.yml" "docker-compose.yml"
else
  copy_or_fetch "docker-compose.stack.yml" "docker-compose.yml"
  copy_or_fetch "Caddyfile.docker" "Caddyfile"
fi

ENV_FILE="$INSTALL_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Creating $ENV_FILE with generated secrets"
  AUTH_SECRET="$(openssl rand -base64 32)"
  WEBHOOK_SECRET="$(openssl rand -hex 16)"
  API_TOKEN="$(openssl rand -hex 32)"

  if [[ "$HTTP_ONLY" == "1" ]]; then
    ORIGIN="${WEB_ORIGIN:-http://127.0.0.1:3000}"
  else
    ORIGIN="https://${DOMAIN}"
  fi

  {
    echo "NODE_ENV=production"
    echo "AIKANBAN_IMAGE=$IMAGE"
    echo "DOMAIN=${DOMAIN:-}"
    echo ""
    echo "BETTER_AUTH_SECRET=$AUTH_SECRET"
    echo "BETTER_AUTH_URL=$ORIGIN"
    echo "WEB_ORIGIN=$ORIGIN"
    echo ""
    echo "AZURE_DEVOPS_WEBHOOK_SECRET=$WEBHOOK_SECRET"
    echo "AIKANBAN_API_TOKEN=$API_TOKEN"
    echo ""
    echo "ALLOW_PUBLIC_SIGNUP=false"
    if [[ -n "$ALLOW_DOMAIN" ]]; then
      echo "SIGNUP_ALLOWED_DOMAINS=$ALLOW_DOMAIN"
    else
      echo "# SIGNUP_ALLOWED_DOMAINS=yourcompany.com"
    fi
    echo ""
    echo "# Microsoft Entra (work Azure) — see docs/deploy/microsoft-sso.md"
    echo "# AUTH_PROVIDERS=microsoft"
    echo "# MICROSOFT_CLIENT_ID="
    echo "# MICROSOFT_CLIENT_SECRET="
    echo "# MICROSOFT_TENANT_ID="
    echo ""
    echo "# Optional: Slack/Teams webhook for agent clarification pings"
    echo "# AIKANBAN_WEBHOOK_URL="
  } >"$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "    Saved secrets to .env (chmod 600). Edit before production if needed."
else
  echo "==> Using existing $ENV_FILE"
fi

cd "$INSTALL_DIR"
# Compose writes .env as root when invoked via sudo — keep data dir owned by the SSH user
sudo chown "$OWNER:$OWNER" "$ENV_FILE" 2>/dev/null || true

echo "==> Pulling image $IMAGE"
export AIKANBAN_IMAGE="$IMAGE"
docker compose pull

echo "==> Starting stack"
docker compose up -d

echo "==> Waiting for health"
for _ in $(seq 1 40); do
  if docker compose exec -T ai-kanban curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [[ "$HTTP_ONLY" == "1" ]]; then
  echo ""
  echo "OK — AI Kanban is running (HTTP)."
  echo "  Health:  curl -s http://127.0.0.1:3000/health"
  echo "  Set WEB_ORIGIN and BETTER_AUTH_URL in .env to your public URL, then: docker compose up -d"
else
  echo ""
  echo "OK — AI Kanban stack is up."
  echo "  URL:     https://${DOMAIN}"
  echo "  Health:  curl -s https://${DOMAIN}/health"
  echo "  ADO hook: https://${DOMAIN}/api/webhooks/azure-devops?token=<AZURE_DEVOPS_WEBHOOK_SECRET from .env>"
  echo "  MCP:     https://${DOMAIN}/mcp  (Bearer AIKANBAN_API_TOKEN from .env)"
fi

echo ""
echo "Next: open the URL, sign up (first user = admin), connect repos, copy MCP config from Settings."
echo "Docs:  $REPO_RAW/docs/deploy/azure-quickstart.md"
