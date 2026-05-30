# Deployment templates

Copy-paste CI/CD and server configs for **your** hosting setup. These live in the same repo as the app — you do **not** need a second repository or a fork unless you want one.

## How this fits together

```
┌─────────────────────────────────────────────────────────┐
│  This repo (ai-kanban)                                  │
│  ├── Dockerfile          → one portable image           │
│  ├── .github/workflows/  → optional: auto-publish image │
│  └── docs/deploy/templates/ → copy what matches your host│
└─────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    Your Azure VM       Someone's Hetzner    Another team's
    (.env + compose)    (same pattern)       Coolify project
```

**Same image everywhere.** Each installation only differs by `.env`, domain, and volume path.

## Pick a template

| Template | Use when |
|----------|----------|
| [github-actions/publish-image-ghcr.yml](./github-actions/publish-image-ghcr.yml) | Build & push image to GitHub Container Registry on tag push |
| [github-actions/deploy-vm-ssh.yml](./github-actions/deploy-vm-ssh.yml) | SSH to a Linux VM, `docker compose pull`, restart |

Also see [examples/](../examples/) for compose, Caddy, and env files.

## Setup (typical team on Azure VM)

### 1. Enable image publishing

Copy the publish workflow into your repo (or use the one already at `.github/workflows/docker-publish.yml`):

```bash
cp docs/deploy/templates/github-actions/publish-image-ghcr.yml .github/workflows/docker-publish.yml
git add .github/workflows/docker-publish.yml
git commit -m "Add Docker publish workflow"
git push
```

Create a release tag to publish:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Image will be at `ghcr.io/<your-github-user>/ai-kanban:latest` (and `:v0.1.0`).

Make the package **public** in GitHub → Packages → ai-kanban → Package settings, or configure the VM to `docker login ghcr.io` for private packages.

### 2. Prepare the VM (minimal — no git clone)

On the server:

```bash
sudo mkdir -p /opt/ai-kanban/data
sudo chown "$USER:$USER" /opt/ai-kanban
cd /opt/ai-kanban

# Copy from your laptop or curl from raw GitHub:
#   docker-compose.pull.yml → docker-compose.yml
#   env.production.example  → .env (then edit)
```

Edit `.env`: set `AIKANBAN_IMAGE`, secrets, and public URL. Then:

```bash
docker compose pull
docker compose up -d
```

Full VM steps: [azure-vm.md](../azure-vm.md).

### 3. Optional — auto-deploy on tag

Copy the deploy workflow and add GitHub **repository secrets**:

| Secret | Value |
|--------|--------|
| `DEPLOY_HOST` | VM public IP or hostname |
| `DEPLOY_USER` | SSH user (e.g. `azureuser`) |
| `DEPLOY_SSH_KEY` | Private key (PEM) |
| `DEPLOY_PATH` | `/opt/ai-kanban` |
| `GHCR_USERNAME` | GitHub username (if image is private) |
| `GHCR_TOKEN` | PAT with `read:packages` (if image is private) |

```bash
cp docs/deploy/templates/github-actions/deploy-vm-ssh.yml .github/workflows/deploy-vm.yml
```

Push a tag — publish workflow builds the image, deploy workflow pulls on the VM.

## Fork?

**Not required.** Fork only if you want your own copy of the repo on GitHub. You can also:

- Use this repo as-is and add workflows + secrets here
- Clone on the VM and build locally (no registry) — see [azure-vm.md path B](../azure-vm.md#path-b--clone-and-build-on-the-vm)

## Adding templates for new platforms

Add a subfolder under `docs/deploy/templates/` (e.g. `azure-pipelines/`, `coolify/`) with a README and copy-paste YAML. Link it from [deploy/README.md](../README.md).
