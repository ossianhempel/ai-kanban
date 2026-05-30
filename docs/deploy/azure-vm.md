# Deploy on Azure VM

Deploy AI Kanban on an **Azure Linux VM** with Docker Compose and Caddy for HTTPS. This is the recommended Azure path for team use with **Azure DevOps** webhooks and embedded PGlite storage.

## Why a VM (not Container Apps / App Service)

| Approach | Verdict |
|----------|---------|
| **Azure VM + Docker** | Recommended — local disk for PGlite, stable URL for ADO hooks, matches how the app is built |
| Container Apps | PGlite on network storage is unreliable; better after Postgres support lands |
| App Service | Awkward persistent disk story for embedded DB |
| AKS | Overkill for a small team control plane |

## Architecture

```
Internet
   │
   ▼
Azure NSG (80, 443)
   │
   ▼
Ubuntu VM
   ├── Caddy (:443 → :3000, Let's Encrypt)
   └── Docker: ai-kanban (:3000)
         └── volume /app/data  →  PGlite + auth data
```

ADO service hooks POST to:

`https://<your-domain>/api/webhooks/azure-devops?token=<AZURE_DEVOPS_WEBHOOK_SECRET>`

## 1. Create the VM

**Portal:** Virtual machines → Create → Azure virtual machine

| Setting | Recommendation |
|---------|----------------|
| Image | Ubuntu Server 22.04 LTS |
| Size | **Standard_B2s** (2 vCPU, 4 GiB) for a small team |
| Authentication | SSH public key |
| Public inbound ports | SSH (22), HTTP (80), HTTPS (443) |
| Region | Close to your team (e.g. **West Europe**) |

**Disk:** 32 GiB OS disk is enough to start. PGlite data stays on the OS disk inside Docker’s volume mount.

### Network security group

Restrict SSH to your IP if possible:

- **Inbound 22** — your IP only
- **Inbound 80, 443** — Any (needed for Let’s Encrypt and users)

## 2. Prepare the VM

SSH in:

```bash
ssh azureuser@<vm-public-ip>
```

Install Docker:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
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

Log out and back in so the `docker` group applies.

## 3. DNS

Point a hostname at the VM’s public IP, e.g.:

```
kanban.yourcompany.com  →  <vm-public-ip>
```

Caddy will obtain a Let’s Encrypt certificate for this name.

## 4. Deploy the app

Choose **Path A** (pull a pre-built image — recommended) or **Path B** (clone repo and build on the VM).

### Path A — Pull image (recommended)

No git clone on the server. Use after [publishing an image](../templates/README.md#1-enable-image-publishing) to GHCR, or pull from whoever publishes `ai-kanban` images.

On the VM:

```bash
sudo mkdir -p /opt/ai-kanban/data
sudo chown "$USER:$USER" /opt/ai-kanban
cd /opt/ai-kanban
```

Copy two files onto the server (scp, rsync, or paste):

- [docs/deploy/examples/docker-compose.pull.yml](./examples/docker-compose.pull.yml) → `/opt/ai-kanban/docker-compose.yml`
- [docs/deploy/examples/env.production.example](./examples/env.production.example) → `/opt/ai-kanban/.env`

Edit `.env`:

```bash
NODE_ENV=production
AIKANBAN_IMAGE=ghcr.io/YOUR_GITHUB_USER/ai-kanban:latest

# openssl rand -base64 32
BETTER_AUTH_SECRET=replace-with-long-random-secret

BETTER_AUTH_URL=https://kanban.yourcompany.com
WEB_ORIGIN=https://kanban.yourcompany.com

# openssl rand -hex 16
AZURE_DEVOPS_WEBHOOK_SECRET=replace-with-webhook-token
```

If the GHCR package is **private**, log in once on the VM:

```bash
echo "$GITHUB_PAT" | docker login ghcr.io -u YOUR_GITHUB_USER --password-stdin
```

Start:

```bash
cd /opt/ai-kanban
docker compose pull
docker compose up -d
docker compose logs -f
```

**Updates:**

```bash
cd /opt/ai-kanban
docker compose pull
docker compose up -d
```

Or enable [automated deploy](../templates/README.md#3-optional--auto-deploy-on-tag) via GitHub Actions.

---

### Path B — Clone and build on the VM

Good when you do not use a registry, or you are iterating on a private fork.

```bash
sudo mkdir -p /opt/ai-kanban
sudo chown "$USER:$USER" /opt/ai-kanban
cd /opt/ai-kanban

git clone https://github.com/YOUR_ORG/ai-kanban.git .
cp .env.example .env
# edit .env (same variables as Path A, omit AIKANBAN_IMAGE)
```

Run with the build override:

```bash
cp docs/deploy/examples/docker-compose.prod.yml docker-compose.prod.yml
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose logs -f ai-kanban
```

**Updates:**

```bash
cd /opt/ai-kanban
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

Verify locally on the VM (both paths):

```bash
curl -s http://127.0.0.1:3000/health
# {"ok":true}
```

Migrations run automatically on first server start.

## 5. HTTPS with Caddy

Install Caddy on the host (not inside the app container):

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

Reload:

```bash
sudo systemctl reload caddy
sudo systemctl enable caddy
```

Open `https://kanban.yourcompany.com` — you should see the board and `curl https://kanban.yourcompany.com/health` should return `{"ok":true}`.

## 6. Azure DevOps integration

### Connect repositories (each user, for now)

1. Sign in at your public URL.
2. **Repositories** → provider **Azure DevOps**.
3. Enter **organization name** and a **PAT**.

**PAT scopes:** Code (read & write), Project and team (read), Profile (read).

4. Import the repos your team uses into a kanban project.
5. Optionally set a **local clone path** on the VM if agents run on the same machine (e.g. `/opt/repos/my-app`).

> **Note:** Provider connections are per user today. Each teammate connects their own PAT until shared instance connections ship.

### Service hooks (PR ↔ ticket sync)

For each **Azure DevOps project** that contains imported repos:

1. **Project settings** → **Service hooks** → **Create subscription**.
2. Publisher: **Web Hooks**.
3. Events: pull request **created**, **updated**, **merged** (and related events you care about).
4. URL:

   ```
   https://kanban.yourcompany.com/api/webhooks/azure-devops?token=YOUR_AZURE_DEVOPS_WEBHOOK_SECRET
   ```

   Use the same value as `AZURE_DEVOPS_WEBHOOK_SECRET` in `.env`.

5. Save and use **Test** to confirm the VM receives events (`docker compose logs -f ai-kanban`).

Ticket matching (same as GitHub):

1. Ticket already linked to that PR
2. Branch name on the ticket
3. Ticket key in PR title/body (e.g. `D-42`)

Status mapping:

| ADO PR state | Ticket status |
|--------------|---------------|
| Active | `pr_open` |
| Review / policy | `needs_human_review` |
| Merged | `done` |
| Abandoned | `running` |

## 7. Team multiplayer setup

After deploy, onboard the team:

| Step | Who | Action |
|------|-----|--------|
| 1 | Admin | Set **Agent settings** → instance guide (repo map, norms) + shared doc links |
| 2 | Each dev | Sign up / sign in |
| 3 | Each dev | **Repositories** → connect ADO → import repos (or admin imports once) |
| 4 | Team | Create tickets via intake; agents claim via UI, MCP, or CLI |
| 5 | ADO admin | Service hooks on each ADO project |

**MCP endpoint:** `POST https://kanban.yourcompany.com/mcp`

**CLI from a laptop:**

```bash
export AIKANBAN_API_URL=https://kanban.yourcompany.com
pnpm cli list
```

## 8. CI/CD (optional)

Automate image build and VM deploy from **this repo** — no fork required.

| Step | Action |
|------|--------|
| Publish | [.github/workflows/docker-publish.yml](../../.github/workflows/docker-publish.yml) runs on `v*` tags → `ghcr.io/<owner>/ai-kanban` |
| Deploy | Copy [templates/github-actions/deploy-vm-ssh.yml](./templates/github-actions/deploy-vm-ssh.yml) → `.github/workflows/deploy-vm.yml` |
| Secrets | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH` (+ GHCR login if private) |

Full walkthrough: [templates/README.md](./templates/README.md).

```bash
git tag v0.1.0 && git push origin v0.1.0
# → builds image → (optional) SSH deploy pulls on VM
```

## 9. Backup and restore

**Backup** (schedule with cron):

```bash
cd /opt/ai-kanban
docker compose stop ai-kanban
tar -czf "/backups/ai-kanban-$(date +%F).tar.gz" data
docker compose start ai-kanban
```

Or backup while running (brief inconsistency possible):

```bash
tar -czf ai-kanban-data.tar.gz /opt/ai-kanban/data
```

**Restore:** stop container → replace `data/` → start container.

Consider Azure Backup or periodic blob upload of the tarball for off-VM copies.

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Sign-in fails / cookies dropped | `BETTER_AUTH_URL` or `WEB_ORIGIN` not HTTPS public URL | Match exact browser URL in `.env`, rebuild/restart |
| ADO webhooks 401/403 | Wrong `token` query param | Match `AZURE_DEVOPS_WEBHOOK_SECRET` |
| ADO webhooks never arrive | URL not reachable | Test from outside; check NSG 443 |
| Empty board after deploy | Fresh DB | Expected; create project/tickets or restore backup |
| `column does not exist` on start | Migrations not applied | Ensure container starts cleanly; check logs on first boot |
| PR actions fail | User not signed in or no PAT | Connect ADO on Repositories while signed in |

## Cost estimate

**Standard_B2s** in West Europe: roughly **$30–40/month** (VM + disk + egress). Scale to **B2ms** if MCP/agent load grows.

## Security notes (before production PATs)

- Rotate `BETTER_AUTH_SECRET` and webhook secrets if compromised.
- Restrict SSH to known IPs.
- Provider PATs are stored **in plaintext** in PGlite today — encrypt at rest before storing org-wide tokens on a shared VM.
- Prefer a dedicated VM or resource group per environment (staging vs prod).

## Related

- [Deploy index](./README.md)
- [CI/CD templates](./templates/README.md)
- [Main README — Docker](../../README.md#docker)
