---
summary: Deploy AI Kanban on Coolify (Docker app from GitHub).
read_when: Self-hosting on a Coolify server; sslip.io HTTPS issues; persistent volume setup.
---

# Coolify deployment

Deploy the single-container app from GitHub on a [Coolify](https://coolify.io) server (e.g. your Hetzner VM).

## Prerequisites

- Coolify v4 with a destination (e.g. `localhost-coolify`)
- Public domain or `*.sslip.io` hostname
- GitHub repo access (public or Coolify deploy key)

## Create the app

```bash
coolify context use myserver   # your Coolify context name
coolify app create \
  --project-uuid <project-uuid> \
  --destination-uuid <destination-uuid> \
  --name ai-kanban \
  --git-repository https://github.com/ossianhempel/ai-kanban \
  --git-branch main \
  --build-pack dockerfile \
  --ports-exposes 3000
```

If you have multiple destinations, `--destination-uuid` is required.

## Environment variables

Set in the Coolify UI (or API on newer CLI versions):

| Variable | Example |
|----------|---------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `AIKANBAN_DATA_DIR` | `/app/data` |
| `DATABASE_URL` | `file:/app/data/pglite` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `https://kanban.yourcompany.com` |
| `WEB_ORIGIN` | same as `BETTER_AUTH_URL` |
| `ALLOW_PUBLIC_SIGNUP` | `false` |
| `SIGNUP_ALLOWED_DOMAINS` | `yourcompany.com` |

See [env.production.example](./examples/env.production.example) and [Microsoft SSO](./microsoft-sso.md) for OAuth vars.

## Persistent storage

Mount a volume so PGlite survives redeploys:

| Host path | Container path |
|-----------|----------------|
| (Coolify-managed) | `/app/data` |

Use the Coolify UI → **Storages** on the app. The CLI `app storage` command needs Coolify **v4.0.0-beta.470+**.

## Health check

The Dockerfile includes `curl` for health checks. If an older image failed health checks (no `curl`), disable the health check in Coolify until you redeploy a current image.

## Domain & HTTPS

### Own domain (recommended for work)

Point DNS to the server, add the domain in Coolify, and Let's Encrypt will issue a cert.

### sslip.io (quick test only)

`65.108.88.160.sslip.io` resolves to your IP. **Do not rely on HTTPS here:** Let's Encrypt rate-limits the entire `sslip.io` zone (~250k certs / 7 days globally). You may get a browser warning or Traefik's default cert.

**HTTP works** for smoke tests: `http://ai-kanban.<your-ip>.sslip.io`

For production / Microsoft SSO, use a real domain with trusted HTTPS.

## After deploy

1. Open the URL → sign up (first user becomes **admin**).
2. **Settings** → configure instance agent guide and member roles.
3. Set `AIKANBAN_API_TOKEN` for headless CLI/MCP access.
4. Redeploy after env changes.

## Update

Push to `main` → Coolify auto-builds if webhook is configured, or trigger **Redeploy** in the UI.

For git-clone installs outside Coolify, see [installation-from-source.md](./installation-from-source.md).
