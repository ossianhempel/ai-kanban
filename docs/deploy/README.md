# Self-host AI Kanban for a team. One **Docker image**, many **hosting recipes** — pick the guide that matches how you run it.

## Start here

| Goal | Guide |
|------|--------|
| **Fastest install (Azure VM, Hetzner, any Linux)** | **[Azure quickstart](./azure-quickstart.md)** — one script, Docker + HTTPS |
| **Full operator manual (git clone)** | **[Install from source](./installation-from-source.md)** — `update-installation.sh`, `pnpm cli update` |
| **Existing Coolify / PaaS** | [Coolify](./coolify.md) |

## Deployment model

| Layer | Shared? | What |
|-------|---------|------|
| **Docker image** | Same for everyone | Built from `Dockerfile` — API, UI, MCP, scheduler |
| **Install config** | Per instance | `.env`, domain, `./data` volume, webhook secrets |
| **Hosting guide** | Per platform | Azure VM, Hetzner, Coolify, … |
| **CI/CD template** | Per operator | Copy from [templates/](./templates/) into **this repo** |

You do **not** need a second repository or a fork. Add workflows and secrets to the same `ai-kanban` repo, or run compose manually on a VM.

### Three ways to get the app onto a server

| Path | When | Guide |
|------|------|-------|
| **Git clone + Docker (recommended early)** | Your own install, latest `main`, easy updates | [installation-from-source.md](./installation-from-source.md) |
| **Pull pre-built image + HTTPS** | No git; Caddy in one compose file | [azure-quickstart](./azure-quickstart.md) + `scripts/bootstrap-install.sh` |
| **Pull image (app only)** | TLS on host separately | [examples/docker-compose.pull.yml](./examples/docker-compose.pull.yml) |
| **CI auto-deploy** | Push tag → image → SSH pull on VM | [templates/](./templates/README.md) |

## Guides

| Guide | Audience |
|-------|----------|
| **[Install from source](./installation-from-source.md)** | Operators — git clone, first run, update |
| **[Azure quickstart](./azure-quickstart.md)** | Work Azure subscription — ~20 min, one script |
| [Azure VM](./azure-vm.md) | Full Azure reference (paths A/B, NSG, backup) |
| [Coolify](./coolify.md) | Self-hosted PaaS on Hetzner / VPS |
| [Microsoft SSO](./microsoft-sso.md) | Entra ID / Azure AD sign-in |
| [Agent loop (MCP)](../agent-loop.md) | Claude/Cursor setup, claim vs clarification workflow |

## Examples & templates

| File | Purpose |
|------|---------|
| [examples/docker-compose.stack.yml](./examples/docker-compose.stack.yml) | App + Caddy (HTTPS) |
| [examples/docker-compose.http.yml](./examples/docker-compose.http.yml) | App only, HTTP (behind LB) |
| [examples/docker-compose.pull.yml](./examples/docker-compose.pull.yml) | App only, bind localhost:3000 |
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

## Updates

| How you installed | Command |
|-------------------|---------|
| **Bootstrap / pull image** (`/opt/ai-kanban`, no `.git`) | `./scripts/update-stack.sh` or `docker compose pull && docker compose up -d` |
| **Git clone on server** | `./scripts/update-installation.sh` or `pnpm cli update` |
| **Coolify** | Push to `main` → redeploy in UI, or `coolify app deploy <uuid> --force` |
| **Local dev** | `git pull && pnpm install && pnpm db:migrate` then restart `pnpm dev` |

Pin releases in `.env`: `AIKANBAN_IMAGE=ghcr.io/ossianhempel/ai-kanban:v0.1.0` (image published on `v*` git tags).

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
