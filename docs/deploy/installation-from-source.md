# Install from source (git clone)

Step-by-step guide for **operators** — run your own AI Kanban instance for your team. You do **not** need to fork the repo or contribute code.

**Time:** ~30–45 minutes for a first install on a Linux server with Docker.

---

## What you are installing

| Concept | Explanation |
|---------|-------------|
| **Source repo** | [github.com/ossianhempel/ai-kanban](https://github.com/ossianhempel/ai-kanban) — where the app is developed |
| **Your installation** | A **git clone** on your server + **your** `.env` + **your** `data/` folder |
| **Fork?** | **No** — clone upstream directly unless your company requires a private fork |

Think of it like OpenClaw’s **from-source / dev channel**: clone once, keep config and database **outside** git, run `update` to pull latest `main`.

```
github.com/ossianhempel/ai-kanban     your server (/opt/ai-kanban)
─────────────────────────────────     ─────────────────────────────
app code (updated via git pull)   →   git clone
                                      .env          ← your secrets (never commit)
                                      data/         ← your database (never commit)
                                      docker compose up
```

---

## Prerequisites

On the machine that will **host** the board (Azure VM, Hetzner, office Linux box, etc.):

| Requirement | Notes |
|-------------|--------|
| **Linux** (recommended) | Ubuntu 22.04+ works well |
| **Docker** | Engine + Compose plugin v2 |
| **git** | To clone and update |
| **curl** | For health checks |
| **Domain** (production) | e.g. `kanban.yourcompany.com` → server IP |
| **Ports** | 80 and 443 open to the internet (HTTPS); 22 for SSH |

You do **not** need Node.js or pnpm on the server for the Docker install path.

Optional for HTTPS: **Caddy** or nginx (steps below use Caddy).

---

## Step 1 — Install Docker and git

On Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates

# Docker — see https://docs.docker.com/engine/install/ubuntu/
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in so `docker` works without sudo.

Verify:

```bash
docker --version
docker compose version
git --version
```

---

## Step 2 — Choose an install directory and clone

Pick a permanent path. Example: `/opt/ai-kanban`.

```bash
sudo mkdir -p /opt/ai-kanban
sudo chown "$USER:$USER" /opt/ai-kanban
cd /opt/ai-kanban

git clone https://github.com/ossianhempel/ai-kanban.git .
```

This directory **is** your installation. All commands below assume you are in `/opt/ai-kanban`.

To install a **specific release** instead of latest `main`:

```bash
git fetch --tags
git checkout v0.1.0    # use the tag you want
```

---

## Step 3 — Create your config (`.env`)

Copy the production template:

```bash
cp docs/deploy/examples/env.production.example .env
```

Edit `.env` with your values:

```bash
nano .env
```

**Required for a real deployment:**

| Variable | How to set |
|----------|------------|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public URL users open, e.g. `https://kanban.yourcompany.com` |
| `WEB_ORIGIN` | Same as `BETTER_AUTH_URL` |
| `AZURE_DEVOPS_WEBHOOK_SECRET` | `openssl rand -hex 16` (if using Azure DevOps hooks) |

**For local / IP testing only** (no HTTPS yet):

```bash
BETTER_AUTH_URL=http://YOUR_SERVER_IP:3000
WEB_ORIGIN=http://YOUR_SERVER_IP:3000
```

Remove or ignore `AIKANBAN_IMAGE` — that is only for pull-based installs, not git clone.

**Important:** `.env` is gitignored. Never commit it. This file is **yours**, not part of the upstream repo.

---

## Step 4 — Prepare Docker Compose for production

Copy the production override:

```bash
cp docs/deploy/examples/docker-compose.prod.yml docker-compose.prod.yml
```

This binds the app to `127.0.0.1:3000` on the host (so only Caddy/nginx exposes it publicly) and mounts `./data` for the database.

Create the data directory:

```bash
mkdir -p data
```

**Important:** `data/` is gitignored. It holds your tickets, users, and settings. Back it up regularly.

---

## Step 5 — Start the application

From `/opt/ai-kanban`:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

First start builds the image (may take several minutes) and runs database migrations automatically.

Watch logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f ai-kanban
```

Wait until you see `AI Kanban listening on http://localhost:3000`.

---

## Step 6 — Verify it works

On the server:

```bash
curl -s http://127.0.0.1:3000/health
```

Expected: `{"ok":true}`

Open in a browser (if you exposed port 3000 for testing):

- `http://YOUR_SERVER_IP:3000` — board should load
- Sign up / sign in should work if `BETTER_AUTH_URL` matches what you type in the address bar

---

## Step 7 — HTTPS with Caddy (production)

For team use you need HTTPS (auth cookies and webhooks require it).

Point DNS: `kanban.yourcompany.com` → your server’s public IP.

Install Caddy on the **host** (not inside the app container):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile` (see [examples/Caddyfile](./examples/Caddyfile)):

```caddy
kanban.yourcompany.com {
    reverse_proxy 127.0.0.1:3000
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
sudo systemctl enable caddy
```

Update `.env` so both URLs use HTTPS:

```bash
BETTER_AUTH_URL=https://kanban.yourcompany.com
WEB_ORIGIN=https://kanban.yourcompany.com
```

Restart the app:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Verify: `curl -s https://kanban.yourcompany.com/health`

---

## Step 8 — Team setup (first login)

1. Open your public URL in a browser.
2. **Sign up** — create the first admin account.
3. **Agent settings** (`/settings`) — paste your team playbook (repo map, norms, shared doc links).
4. **Repositories** (`/repositories`) — connect GitHub or **Azure DevOps** (org + PAT), import repos.
5. **Intake** — create a test ticket with all fields + a repository linked.
6. **Azure DevOps service hooks** (optional but recommended) — per ADO project:

   ```
   https://kanban.yourcompany.com/api/webhooks/azure-devops?token=YOUR_AZURE_DEVOPS_WEBHOOK_SECRET
   ```

   Use the same token as in `.env`.

More detail: [azure-vm.md](./azure-vm.md) sections 6–7, [AGENTS.md](../../AGENTS.md).

---

## Step 9 — Updating to the latest version

When new features land on GitHub, update **your installation** without losing data.

Your `.env` and `data/` are untouched. Only application code is replaced.

### Option A — Update script (recommended on the server)

From your installation directory:

```bash
cd /opt/ai-kanban
./scripts/update-installation.sh
```

Or via pnpm wrapper from a machine that has the repo + Node:

```bash
pnpm update-installation
```

What it does:

1. `git pull origin main` (fast-forward only)
2. `docker compose … up -d --build`
3. Health check on `http://127.0.0.1:3000/health`

**Environment overrides:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `AIKANBAN_INSTALL_DIR` | current directory | Install path |
| `AIKANBAN_UPDATE_BRANCH` | `main` | Branch to pull |
| `AIKANBAN_COMPOSE_PROD` | `docker-compose.prod.yml` | Compose override file |

Example — track `main` explicitly:

```bash
AIKANBAN_UPDATE_BRANCH=main ./scripts/update-installation.sh
```

### Option B — CLI update command

If you have Node/pnpm available (e.g. on a dev machine that also hosts the clone):

```bash
cd /opt/ai-kanban
pnpm install          # first time only, if using CLI from this clone
pnpm cli update
```

Flags:

```bash
pnpm cli update --branch main
pnpm cli update --install-dir /opt/ai-kanban
pnpm cli update --dev    # git pull + pnpm install + migrate — no Docker (local dev)
```

### Option C — Manual update

```bash
cd /opt/ai-kanban
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
curl -s http://127.0.0.1:3000/health
```

### Pinning to releases instead of `main`

To avoid unreleased changes, checkout a tag before updating:

```bash
git fetch --tags
git checkout v0.2.0
./scripts/update-installation.sh
```

Or stay on `main` for latest (OpenClaw-style **dev channel**).

---

## Backup before you update (recommended)

```bash
cd /opt/ai-kanban
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop ai-kanban
tar -czf "../ai-kanban-backup-$(date +%F).tar.gz" data .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml start ai-kanban
```

Store the tarball off-server.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Sign-in fails | `BETTER_AUTH_URL` and `WEB_ORIGIN` must **exactly** match the browser URL (including `https://`) |
| `Unexpected end of JSON input` on board | Container not running — `docker compose … ps` and check logs |
| `git pull` conflicts | You edited tracked files in the clone — stash or reset; keep changes only in `.env` / `data/` |
| Port 3000 in use | Another process or old container — `docker ps`, stop conflicts |
| Database migration error | Pull latest, run update again; check logs on first boot |
| ADO webhooks 401 | `token=` query param must match `AZURE_DEVOPS_WEBHOOK_SECRET` in `.env` |

Logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f ai-kanban
```

---

## What not to put in the git clone

Keep the clone **clean** so `git pull` always works:

| Put here | Do **not** put here |
|----------|---------------------|
| `.env` | Secrets in committed files |
| `data/` | Database dumps in the repo |
| (optional) `docker-compose.prod.yml` | Custom app code unless you maintain a fork |

If you need heavy customizations, fork on GitHub and point `git pull` at your fork — that is advanced and not required for normal team use.

---

## Other deployment paths

| Path | Doc |
|------|-----|
| **Git clone (this guide)** | You are here |
| Azure VM walkthrough (DNS, NSG, Caddy) | [azure-vm.md](./azure-vm.md) |
| Pull pre-built Docker image (no git on server) | [examples/docker-compose.pull.yml](./examples/docker-compose.pull.yml) |
| CI/CD templates | [templates/](./templates/README.md) |

---

## Quick reference

```bash
# First install
git clone https://github.com/ossianhempel/ai-kanban.git /opt/ai-kanban
cd /opt/ai-kanban
cp docs/deploy/examples/env.production.example .env    # edit this
cp docs/deploy/examples/docker-compose.prod.yml docker-compose.prod.yml
mkdir -p data
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Update later
./scripts/update-installation.sh
# or: pnpm cli update
```
