# External PostgreSQL backend

AI Kanban ships with an **embedded PGlite** database (`DATABASE_URL=file:…`) — zero setup, perfect for a single VM with local disk. You can instead point it at an **external PostgreSQL** server by changing one variable:

```bash
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
```

That's the entire switch. The scheme decides the backend: `file:` → PGlite (default), `postgres://` / `postgresql://` → external Postgres. Migrations run automatically on startup against whichever backend is configured, using the same migration files. **The MCP server (`POST /mcp`) and the `aikanban` CLI are unaffected by the backend choice** — they talk to the same API.

## When to use external Postgres

| Use… | When |
|------|------|
| **PGlite** (default) | Single VM with durable local disk. Simplest, no extra service to run. |
| **External Postgres** | Platform with network-backed storage (Azure **App Service for Containers**, Container Apps), multiple app instances, or you already run managed Postgres and want backups/HA there. |

PGlite on network-mounted storage (e.g. Azure Files) is unreliable — that's the case external Postgres solves, and it unblocks App Service / Container Apps as deploy targets.

## Connection string & TLS

```
postgres://<user>:<password>@<host>:<port>/<database>?sslmode=require
```

- **Managed providers require TLS.** Keep `?sslmode=require` for Azure Database for PostgreSQL (Flexible Server), Neon, Supabase, and RDS. The driver parses `sslmode` from the URL directly.
- **Connection poolers in transaction mode** (Supabase **Supavisor** on port `6543`, PgBouncer) do **not** support server-side prepared statements. The driver uses them by default, so add **`&prepare=false`** to the URL when connecting through such a pooler — otherwise migrations/queries fail with `prepared statement … already exists`. The direct connection (Supabase port `5432`) needs no extra flag.
- URL-encode special characters in the password (`@` → `%40`, etc.).
- If the host is unreachable or credentials are wrong, the server **fails fast on startup** with a clear connection error — check `DATABASE_URL`, firewall rules, and `sslmode`.

When Postgres is external, the app no longer needs a persistent `./data` volume — the database lives in Postgres. (Keep `./data` only if you also keep some installs on PGlite.)

## Migrations & drizzle-kit

Startup migrations are automatic. To run them manually or use other drizzle-kit commands against external Postgres, just set `DATABASE_URL` first:

```bash
export DATABASE_URL='postgres://user:pass@host:5432/aikanban?sslmode=require'
pnpm db:migrate    # apply migrations
pnpm db:studio     # browse the schema
```

The same migration files (`packages/db/drizzle/*.sql`) apply to both PGlite and standard PostgreSQL — they are generated in the `postgresql` dialect.

## Quick local test (Docker)

```bash
docker run --rm -d --name aikanban-pg -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres:16
export DATABASE_URL='postgres://postgres:pass@127.0.0.1:5432/postgres'
pnpm dev
curl -s http://localhost:3000/health   # {"ok":true}
```

## Azure: managed Postgres + App Service for Containers ("option A")

Deploy the AI Kanban container on **Azure App Service for Containers** backed by **Azure Database for PostgreSQL — Flexible Server**.

### 1. Provision Postgres (Flexible Server)

1. Create an **Azure Database for PostgreSQL — Flexible Server** in the same region as your App Service Plan.
2. Create a database (e.g. `aikanban`).
3. **Networking:** allow access from your App Service. Either:
   - **Public access** — add a firewall rule for the App Service outbound IPs, **or**
   - **Private access (VNet)** — integrate the App Service with the same VNet (recommended for production).
4. TLS is on by default — you'll use `?sslmode=require`.

### 2. Deploy the container to App Service

1. Create (or reuse) an **App Service Plan** (Linux) and a **Web App for Containers** pointing at your image: `ghcr.io/<owner>/ai-kanban:latest` (or your registry).
2. Set application settings (env vars):

   | Setting | Value |
   |---------|-------|
   | `DATABASE_URL` | `postgres://<user>:<pass>@<server>.postgres.database.azure.com:5432/aikanban?sslmode=require` |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | `https://<app-name>.azurewebsites.net` (your public HTTPS URL) |
   | `WEB_ORIGIN` | same as `BETTER_AUTH_URL` |
   | `WEBSITES_PORT` | `3000` |
   | `AZURE_DEVOPS_WEBHOOK_SECRET` | ADO service hook `?token=` value (if using ADO) |

3. **No persistent storage mount is needed** — the database is in Postgres. (Don't mount `/app/data`.)
4. Start the app. Migrations apply automatically on boot; check `https://<app>/health` → `{"ok":true}`.

### 3. Wire up the team

Same as any install: sign in (first account is admin), connect repositories, set **Agent settings**, and add ADO service hooks pointing at `https://<app>/api/webhooks/azure-devops?token=<secret>`.

## See also

- [Install from source](./installation-from-source.md) — operator install + update
- [Azure VM](./azure-vm.md) — the local-disk + PGlite path (still the simplest for a single host)
- [Deploy index](./README.md)
