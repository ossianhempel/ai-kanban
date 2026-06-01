# AI Kanban — setup & usage

Self-hostable, AI-native Kanban: humans intake work, agents claim tickets and get structured briefs, PR activity syncs back to the board.

**Also read:** [README.md](./README.md) (overview), [docs/deploy/installation-from-source.md](./docs/deploy/installation-from-source.md) (operator install + update), [docs/deploy/](./docs/deploy/README.md) (other hosting options).

---

## Local development

### Prerequisites

- Node 22+
- pnpm 10 (`corepack enable`)

### First run

```bash
cp .env.example .env
pnpm install
pnpm dev
```

`pnpm dev` runs migrations, then starts the API and Vite web app.

| Service | URL (default `.env`) |
|---------|----------------------|
| Web UI | http://localhost:5180 |
| API / health / MCP | http://localhost:3000 (set `PORT` in `.env`) |
| CLI default | `AIKANBAN_API_URL` in `.env` — point at the API port |

Vite proxies `/api` and `/mcp` to the API. If the board shows JSON errors or sign-up fails, the API is probably down — run `pnpm dev` from the repo root and avoid multiple concurrent dev processes (PGlite file lock).

### Common commands

```bash
pnpm dev              # migrate + API + web
pnpm check-types      # TypeScript across monorepo
pnpm db:migrate       # after schema changes
pnpm db:generate      # new Drizzle migration from schema edits
pnpm build            # production build
pnpm start            # run built server only
pnpm cli doctor       # API health check
pnpm cli update       # git-clone install: pull + rebuild (see docs/deploy/installation-from-source.md)
pnpm cli list         # list tickets
```

### Environment (dev)

Key vars in `.env`:

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `3000`) |
| `WEB_DEV_PORT` | Vite port (default `5180`) |
| `BETTER_AUTH_URL` / `WEB_ORIGIN` | Must match web origin (e.g. `http://localhost:5180`) |
| `BETTER_AUTH_SECRET` | Auth signing secret (min 16 chars) |
| `DATABASE_URL` | `file:./data/pglite` for embedded PGlite |
| `AIKANBAN_API_URL` | CLI target (e.g. `http://localhost:3000`) |

Data lives under `./data/pglite`. Back up `./data` before risky experiments.

### Troubleshooting (dev)

| Problem | Fix |
|---------|-----|
| `Unexpected end of JSON input` on board | API not running — `pnpm dev` |
| `column does not exist` on API start | `pnpm db:migrate` |
| PGlite `Aborted()` / lock errors | Kill stale `tsx`/node processes; single `pnpm dev` |
| Port in use | Change `PORT` / `WEB_DEV_PORT` or free the port |

---

## Production deployment

One Docker image; per-install `.env` + `./data` volume.

| Path | When |
|------|------|
| **Pull image** (recommended) | VM has Docker only — see [docs/deploy/azure-vm.md](./docs/deploy/azure-vm.md) Path A |
| **Clone + build** | No registry — Path B in same doc |
| **CI/CD** | [docs/deploy/templates/](./docs/deploy/templates/README.md) — GHCR publish on `v*` tags |

Publish workflow: `.github/workflows/docker-publish.yml` → `ghcr.io/<owner>/ai-kanban`.

Required production env: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN` (HTTPS), `AZURE_DEVOPS_WEBHOOK_SECRET` (if using ADO hooks).

---

## Using the app (humans)

### Board (no sign-in required for intake)

Open `/` — kanban board and ticket intake.

**Intake** requires every field + a linked repository. Complete tickets land in **Agent Ready**.

### Sign in

Required for: repositories, agent settings, saving doc links, provider connections.

`/login` or `/signup`

**Auth methods** (operator-configured via env):

| Method | Env |
|--------|-----|
| Email + password | default; disable with `AUTH_EMAIL_PASSWORD_ENABLED=false` |
| Microsoft (Entra ID) | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` |
| GitHub / Google OAuth | `GITHUB_OAUTH_*`, `GOOGLE_*` |

Sign-up allowlist (`SIGNUP_ALLOWED_DOMAINS`, etc.) applies to SSO too. First account is admin. See [docs/deploy/microsoft-sso.md](docs/deploy/microsoft-sso.md).

### Repositories (`/repositories`)

1. Connect **GitHub** or **Azure DevOps** (org + PAT).
2. Import repos into a project.
3. Optional: set **local path** on the server for readiness scan and agent brief `cd` commands.

Provider connections are **per user** today.

### Agent settings (`/settings`)

Team-wide context injected into every agent brief:

| Setting | Scope |
|---------|-------|
| **Instance agent guide** | All tickets — repo map, architecture, norms |
| **Instance doc links** | All tickets — label + URL |
| **Project context** | One kanban project |
| **Project doc links** | All tickets in that project |

Per-ticket doc links: open a ticket → detail panel → **Ticket doc links**.

If a repo has a local path, `AGENTS.md` / `CLAUDE.md` from that path are appended to the brief automatically.

### Ticket workflow (columns)

```
Inbox → Needs Clarification → Ready for Planning → Agent Ready → Running
  → PR Open → Needs Human Review → Done / Blocked
```

Strict intake skips incomplete work to **Agent Ready** when all fields + repo are present.

**Claim / start work:** ticket detail → **Start work** (UI), or agent MCP/CLI claim → moves to **Running** (only from `agent_ready`).

### Azure DevOps (team)

**Connect:** Repositories → Azure DevOps → organization + PAT.

**PAT scopes:** Code (read & write), Project and team (read), Profile (read).

**PR ↔ ticket sync (production):** ADO service hook on each project:

```
https://<your-domain>/api/webhooks/azure-devops?token=<AZURE_DEVOPS_WEBHOOK_SECRET>
```

Ticket matched by: linked PR → branch name → ticket key in PR title/body (e.g. `D-1`).

---

## Agent workflow (MCP / CLI)

### Typical loop

1. `aikanban_list_tasks` — find `agent_ready` work
2. `aikanban_get_task_context` — full brief (instance guide, project context, docs, repo path, acceptance criteria, test commands)
3. `aikanban_claim_task` — status → `running`
4. Do the work in the linked repo
5. `aikanban_create_pull_request` or `aikanban_link_pull_request`
6. `aikanban_update_task_status` / `aikanban_complete_task` as needed

Webhooks move tickets when PRs change state (if configured).

### MCP

- **Endpoint:** `POST https://<host>/mcp` (dev: proxied via Vite at `:5180/mcp`, or direct API port)
- **Tools:** `aikanban_list_tasks`, `aikanban_claim_task`, `aikanban_get_task_context`, `aikanban_update_task_status`, `aikanban_complete_task`, `aikanban_link_pull_request`, `aikanban_create_pull_request`, `aikanban_get_repository_activity`

Configure in Cursor / Claude Desktop / other MCP clients pointing at your instance URL.

### CLI

```bash
export AIKANBAN_API_URL=https://kanban.example.com   # or http://localhost:3000

pnpm cli doctor
pnpm cli list --status agent_ready
pnpm cli get-task D-1
pnpm cli claim D-1 --agent-id cursor
pnpm cli set-status D-1 --status running
pnpm cli link-pr D-1 --url "https://dev.azure.com/org/project/_git/repo/pullrequest/123"
pnpm cli create-pr D-1 --head feature/my-branch --draft
pnpm cli complete D-1 --summary "Done"

# Provider setup (requires auth cookie or future API token)
pnpm cli connect --provider azure_devops --token "$PAT" --organization my-org
pnpm cli connections
```

Ticket refs: project key + number (e.g. `D-1`) or UUID.

### Agent brief contents

Built live in `get_task_context` from:

- Instance playbook + project context
- Knowledge refs (instance / project / ticket)
- Ticket fields (description, acceptance criteria, business context, expected outcome)
- Repository name, URL, local path, default branch
- Repo `AGENTS.md` / `CLAUDE.md` when local path is set

Stored `agentBrief` on tickets is refreshed when team context or knowledge refs change.

---

## Architecture (for code changes)

```
apps/server/     Hono API, auth, MCP, webhooks, scheduler
apps/web/        React UI — import @ai-kanban/agent-protocol only (not @ai-kanban/core in browser)
apps/cli/        aikanban CLI
packages/core/   Brief generation, ticket key parsing, domain errors
packages/agent-protocol/   Readiness rules, MCP schemas, shared with web
packages/db/     Drizzle schema + migrations (packages/db/drizzle/)
packages/integrations/   GitHub, Azure DevOps adapters; GitLab stubbed
```

**Readiness:** `packages/agent-protocol/src/readiness.ts` — intake must pass before create.

**Claim guard:** only `agent_ready` → `running` via claim.

**Auth:** Better Auth at `/api/auth/*`; session cookie for web; `AIKANBAN_API_TOKEN` Bearer acts as first admin for CLI/MCP when set.

### Monorepo conventions

- pnpm workspaces + Turborepo
- Strict TypeScript — no `any`
- Minimize scope; match existing patterns
- Run `pnpm check-types` before handoff
- Migrations: edit schema → `pnpm db:generate` → `pnpm db:migrate`
- Do not commit `.env` or secrets

### Key API routes

| Route | Auth | Purpose |
|-------|------|---------|
| `GET /health` | No | Health check |
| `GET /api/tickets` | No | List tickets |
| `POST /api/tickets` | Optional | Create (strict intake) |
| `GET /api/tickets/:ref` | No | Full context + brief |
| `POST /api/tickets/:ref/claim` | No | Agent claim |
| `GET /api/auth/config` | No | Sign-up policy + OAuth providers |
| `GET/PATCH /api/instance/settings` | PATCH: admin | Team playbook |
| `GET/PATCH /api/users/:id/role` | Admin | Member roles |
| `GET/POST/DELETE /api/knowledge-refs` | POST/DELETE: auth (+ admin for instance/project) | Doc links |
| `POST /api/webhooks/azure-devops` | Token query param | ADO PR sync |

---

## Multiplayer / team notes

- One instance = one shared board (PGlite in `./data`).
- Onboard: admin sets **Agent settings** → each dev signs in → **Repositories** → ADO import → ADO service hooks on each project.
- Credentials stored plaintext in DB today — encrypt before production org PATs on a shared VM.

---

## Related docs

| Doc | Contents |
|-----|----------|
| [README.md](./README.md) | Stack, MCP tool list, webhook details |
| [docs/deploy/installation-from-source.md](./docs/deploy/installation-from-source.md) | Operator install + update |
| [docs/deploy/README.md](./docs/deploy/README.md) | Deploy index |
| [docs/deploy/azure-vm.md](./docs/deploy/azure-vm.md) | Azure VM specifics |
| [docs/deploy/templates/](./docs/deploy/templates/README.md) | GitHub Actions CI/CD copy-paste |
