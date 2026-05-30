# GitHub Actions templates

## publish-image-ghcr.yml

Builds the Dockerfile and pushes to **GitHub Container Registry** (`ghcr.io`).

**Triggers:** push tag `v*` (e.g. `v0.1.0`), or manual `workflow_dispatch`.

**Permissions:** needs `packages: write` (included in workflow).

After first publish, set default image in server `.env`:

```bash
AIKANBAN_IMAGE=ghcr.io/YOUR_GITHUB_USER/ai-kanban:latest
```

## deploy-vm-ssh.yml

SSH into a Linux VM, log in to GHCR if needed, `docker compose pull`, `docker compose up -d`.

**Triggers:** after `Docker Publish` workflow succeeds on a tag, or manual `workflow_dispatch`.

**Required secrets:** see [templates/README.md](../README.md#3-optional--auto-deploy-on-tag).

The VM must already have Docker, `docker-compose.yml`, and `.env` at `DEPLOY_PATH`.
