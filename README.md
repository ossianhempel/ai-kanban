# AI Kanban

Open-source, self-hostable AI-native Kanban platform — the control plane between humans, knowledge sources, repositories, and AI agents.

**Setup & usage (humans + agents):** [AGENTS.md](./AGENTS.md)

## Stack

- **Server:** Hono (Node) — API, scheduler, MCP endpoint, static UI
- **Web:** Vite + React Router + Tailwind + shadcn-style components
- **Database:** PGlite + Drizzle ORM
- **Auth:** Better Auth
- **CLI:** `aikanban` (commander)
- **Jobs:** DB-backed job table + node-cron worker loop

## Monorepo layout

```
apps/
  server/   Hono API, scheduler, MCP, PGlite
  web/      React UI
  cli/      aikanban CLI
packages/
  core/             domain logic (readiness, briefs, jobs)
  db/               Drizzle schema + migrations
  agent-protocol/   MCP tools + CLI contracts
  integrations/     GitHub, knowledge connectors (stubs)
  env/              typed environment
  config/           shared TS config
```

## Local development

```bash
cp .env.example .env
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm dev
```

- Web UI: http://localhost:5173 (proxies API to :3000)
- API / MCP / production-style UI: http://localhost:3000

## CLI

```bash
pnpm cli doctor
pnpm cli list
pnpm cli get-task TASK-1
pnpm cli claim TASK-1 --agent-id cursor
pnpm cli update TASK-1 --status running
pnpm cli complete TASK-1 --summary "Done"
```

Environment:

- `AIKANBAN_API_URL` (default `http://localhost:3000`)
- `AIKANBAN_API_TOKEN` (optional)

## Docker

```bash
docker compose up --build
```

Or:

```bash
docker run \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e BETTER_AUTH_SECRET=your-secret-here \
  ai-kanban
```

PGlite data persists under `./data/pglite`.

**Production deploy:** [docs/deploy](./docs/deploy/README.md) — Azure VM guide, pull vs build paths, GitHub Actions templates, GHCR publish on `v*` tags.

## Database switching

Default (embedded):

```
DATABASE_URL=file:./data/pglite
```

Future external Postgres:

```
DATABASE_URL=postgres://user:pass@host:5432/aikanban
```

## MCP

HTTP endpoint: `POST /mcp`

Tools:

- `aikanban_list_tasks`
- `aikanban_claim_task`
- `aikanban_get_task_context`
- `aikanban_update_task_status`
- `aikanban_complete_task`
- `aikanban_link_pull_request`
- `aikanban_create_pull_request`
- `aikanban_get_repository_activity`

## Source providers (GitHub first)

Provider-agnostic integration layer in `packages/integrations`. Each adapter implements the same contract: validate connection, list repos, fetch activity, create/link PRs.

Supported today:

- **GitHub** — PAT connect, import repos, sync open/recent PRs, create/link PRs from tickets, webhooks
- **Azure DevOps** — PAT connect (organization + token), import repos, sync PR activity, create/link PRs, service hooks
- **GitLab** — connection model in place; adapter stubbed

### Connect & import (UI)

1. Sign in → `/repositories`
2. Connect provider with a personal access token
3. Import a remote repository into a project
4. Optional: add a local clone path for readiness scanning

### CLI

```bash
pnpm cli connect --provider github --token ghp_...
pnpm cli connect --provider azure_devops --token <pat> --organization my-org
pnpm cli connections
pnpm cli repo-activity <repository-id> --refresh
pnpm cli link-pr D-1 --url https://github.com/org/repo/pull/42
pnpm cli create-pr D-1 --head feature/my-branch --draft
```

### REST

- `GET /api/providers`
- `GET|POST|DELETE /api/connections`
- `GET /api/connections/:id/repositories`
- `POST /api/repositories/import`
- `GET /api/repositories/:id/activity`
- `POST /api/repositories/:id/sync`
- `POST /api/tickets/:ref/link-pull-request`
- `POST /api/tickets/:ref/create-pull-request`

Credentials are stored per user in `provider_connections` (encrypt at rest before production).

### GitHub webhooks (PR ↔ ticket sync)

Configure a webhook on each imported GitHub repository:

- **URL:** `https://your-host/api/webhooks/github` (dev: `http://localhost:3002/api/webhooks/github`)
- **Content type:** `application/json`
- **Secret:** same value as `GITHUB_WEBHOOK_SECRET` in `.env`
- **Events:** Pull requests

When GitHub sends events, AI Kanban matches tickets by:

1. Existing PR link (number or GitHub PR id)
2. Branch name on the ticket
3. Ticket key in the PR title/body (e.g. `D-1`)

Status mapping:

| GitHub event | Ticket status |
|--------------|---------------|
| PR opened / updated | `pr_open` |
| Review requested | `needs_human_review` |
| PR merged | `done` |
| PR closed (not merged) | `running` |

### Azure DevOps service hooks (PR ↔ ticket sync)

Configure a service hook on each imported Azure DevOps **project** (Project settings → Service hooks):

- **URL:** `https://your-host/api/webhooks/azure-devops?token=YOUR_SECRET` (dev: `http://localhost:3002/api/webhooks/azure-devops?token=YOUR_SECRET`)
- **Events:** Pull request created, updated, merged
- **Token:** same value as `AZURE_DEVOPS_WEBHOOK_SECRET` in `.env` (query param; Azure does not support GitHub-style HMAC)

**PAT scopes:** Code (read & write), Project and team (read), Profile (read).

Ticket matching and status mapping follow the same rules as GitHub (linked PR → branch → ticket key in title/body).

Statuses: Inbox → Needs Clarification → Ready for Planning → Agent Ready → Running → PR Open → Needs Human Review → Done / Blocked

OSS readiness evaluation is heuristic-based (acceptance criteria, repository, business context, expected outcome). Hosted SaaS can add an AI coordinator later.

## License

MIT (placeholder — add LICENSE before public release)
