# Deployment guides

Self-host AI Kanban for a team. One **Docker image**, many **hosting recipes** — pick the guide and templates that match where you run it.

## Deployment model

| Layer | Shared? | What |
|-------|---------|------|
| **Docker image** | Same for everyone | Built from `Dockerfile` — API, UI, MCP, scheduler |
| **Install config** | Per instance | `.env`, domain, `./data` volume, webhook secrets |
| **Hosting guide** | Per platform | Azure VM, Hetzner, Coolify, … |
| **CI/CD template** | Per operator | Copy from [templates/](./templates/) into **this repo** |

You do **not** need a second repository or a fork. Add workflows and secrets to the same `ai-kanban` repo, or run compose manually on a VM.

### Three ways to get the image onto a server

| Path | When | VM needs |
|------|------|----------|
| **A — Pull image** | Production (recommended) | Docker, compose file, `.env` only |
| **B — Clone + build** | No registry, private hack | Git, Docker, full repo clone |
| **C — CI deploy** | Auto-update on git tag | Path A + GitHub Actions SSH deploy |

## Guides

| Platform | Guide |
|----------|-------|
| **Azure VM** | [azure-vm.md](./azure-vm.md) |

## Examples & templates

| File | Purpose |
|------|---------|
| [examples/docker-compose.pull.yml](./examples/docker-compose.pull.yml) | Standalone compose — pull pre-built image |
| [examples/docker-compose.prod.yml](./examples/docker-compose.prod.yml) | Override for clone + build deploy |
| [examples/env.production.example](./examples/env.production.example) | Production `.env` template |
| [examples/Caddyfile](./examples/Caddyfile) | HTTPS reverse proxy |
| [templates/](./templates/) | GitHub Actions and future CI copy-paste |

**Publish workflow:** [.github/workflows/docker-publish.yml](../../.github/workflows/docker-publish.yml) — pushes to `ghcr.io/<owner>/ai-kanban` on `v*` tags.

## Quick checklist (all platforms)

1. Pull or build the image.
2. Mount `./data` → `/app/data` (PGlite).
3. Set production env vars ([below](#environment-variables)).
4. TLS in front (Caddy or load balancer).
5. ADO service hooks (or GitHub webhooks) → your public URL.
6. Team signs in; connect repos; set **Agent settings**.

## Environment variables

Required for production:

| Variable | Description |
|----------|-------------|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public HTTPS URL, e.g. `https://kanban.example.com` |
| `WEB_ORIGIN` | Same as `BETTER_AUTH_URL` in most setups |
| `AZURE_DEVOPS_WEBHOOK_SECRET` | ADO service hook `?token=` value |

Pull-based deploy only:

| Variable | Description |
|----------|-------------|
| `AIKANBAN_IMAGE` | e.g. `ghcr.io/your-user/ai-kanban:latest` |

Defaults (usually fine):

| Variable | Default |
|----------|---------|
| `PORT` | `3000` |
| `AIKANBAN_DATA_DIR` | `/app/data` |
| `DATABASE_URL` | `file:/app/data/pglite` |

Optional: `GITHUB_WEBHOOK_SECRET`, `AIKANBAN_API_TOKEN`

## Health check

```bash
curl -s https://your-domain/health
# {"ok":true}
```

## Backup

```bash
tar -czf ai-kanban-backup-$(date +%F).tar.gz ./data
```

Stop the container first for a consistent backup.
