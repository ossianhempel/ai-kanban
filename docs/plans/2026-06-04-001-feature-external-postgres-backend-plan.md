# Support external PostgreSQL as a database backend (alongside embedded PGlite)

> **Plan:** docs/plans/2026-06-04-001-feature-external-postgres-backend-plan.md
> **Status:** Draft
> **Type:** feature  ·  **Depth:** Standard

## Problem & Scope

AI Kanban embeds **PGlite on local disk** as its only database (`DATABASE_URL=file:./data/pglite`). This is what forces the "deploy on a single VM with local storage" guidance and rules out App Service / Container Apps, where persistent storage is network-backed (Azure Files) and unreliable for an embedded DB. The code already anticipates the swap: `.env.example` labels Postgres as "(future)", and `resolvePglitePath` explicitly throws `"PostgreSQL is not configured yet"` for `postgres://` URLs.

This plan makes **external PostgreSQL a first-class backend option, selected by the `DATABASE_URL` scheme**, with no behavior change for existing PGlite installs.

**In scope**
- Backend selection by URL scheme: `file:` → PGlite (unchanged default); `postgres://`/`postgresql://` → external Postgres.
- Runtime connection + automatic migration on startup for both backends.
- `drizzle-kit` (generate/migrate/push/studio) working against external Postgres.
- TLS/SSL handling for managed providers (Azure Flexible Server, Neon, Supabase, RDS).
- Docs: how to install against external Postgres; Azure Database for PostgreSQL + App Service path.

**Out of scope**
- Data migration tooling from an existing PGlite install into Postgres (noted in Deferred).
- Per-provider IaC/Terraform. Encrypting provider PATs at rest (separate concern).
- Changing any application/domain behavior, API shapes, or the MCP tool surface.

## Requirements Traceability

- **R1** — Operators can point AI Kanban at an external Postgres instance hosted anywhere via `DATABASE_URL=postgres://…`, instead of PGlite. — _source: this conversation_
- **R2** — Existing PGlite installs (`file:` URLs) keep working with zero config change. — _source: this conversation; current default in `packages/env/src/server.ts`_
- **R3** — Migrations run automatically on server start against whichever backend is configured, and the same migration files apply to both (Postgres dialect). — _source: current behavior in `packages/db/src/index.ts:31`; must be preserved_
- **R4** — Works with managed Postgres that requires TLS (Azure Flexible Server, Neon, Supabase). — _source: this conversation (Azure demo target)_
- **R5** — The MCP server and CLI continue to function unchanged on the Postgres backend. — _source: this conversation ("will it work with MCP as well")_
- **R6** — Documentation covers external-Postgres install and the Azure App Service + managed-Postgres deployment ("option A" demo). — _source: this conversation_

## Key Technical Decisions

- **D1 — Select the backend from the `DATABASE_URL` scheme, not a separate flag.** `file:` → PGlite; `postgres://`/`postgresql://` → postgres-js. _Rationale:_ the env contract and `.env.example` already imply this; one variable, no redundant config, and the existing default keeps PGlite.

- **D2 — Use `postgres-js` (`postgres` npm package) with `drizzle-orm/postgres-js`.** _Rationale:_ lightweight, first-class Drizzle support, built-in pooling, native `sslmode` URL parsing; works well on long-lived Node servers (App Service/VM). `node-postgres` is the alternative (see Alternatives).

- **D3 — Introduce a discriminated backend resolver** `resolveDatabaseBackend(url)` → `{ kind: "pglite", path } | { kind: "postgres", url }`, replacing the throwing `resolvePglitePath` path for Postgres. _Rationale:_ centralizes scheme parsing in `@ai-kanban/env/server` (single source of truth, already where `resolvePglitePath` lives); keeps `createDatabase` a thin switch.

- **D4 — Unify the exported `Database` type across drivers.** Both PGlite and postgres-js Drizzle instances are `PgDatabase` subtypes sharing the query-builder API used across services. Type `Database` as the common `PgDatabase<…, typeof schema>` (or a union) so `apps/server` and `apps/cli` consume one type regardless of backend. _Rationale:_ ~20 call sites take `db: Database`; they must not care which driver is underneath.

- **D5 — Replace `DatabaseContext.client: PGlite` with a backend-agnostic close handle.** Keep `db`, store an internal `close: () => Promise<void>` (PGlite `.close()` vs postgres-js `.end()`). _Rationale:_ consumers only use `db` + `closeDatabase()`; exposing the raw PGlite client blocks the union.

- **D6 — Migrations are already Postgres-dialect and portable.** `drizzle.config.ts` uses `dialect: "postgresql"` and the generated SQL is standard Postgres DDL (`CREATE TYPE … AS ENUM`, `timestamp with time zone`), verified in `0000_*.sql`. Same files apply to PGlite and real Postgres. _Rationale:_ no per-backend migration sets needed; just pick the matching Drizzle migrator at runtime.

- **D7 — TLS handling.** Honor `sslmode` in the connection string (postgres-js parses `?sslmode=require` natively). Document that managed providers need it. Avoid a custom SSL env unless a provider needs a CA cert (deferred). _Rationale:_ least surface; URL is the standard place for this.

Open questions:
- Connection pool size defaults for App Service vs VM — start with postgres-js defaults; expose `DATABASE_POOL_MAX` only if needed (left as a small optional in U2).

## High-Level Design

One seam decides everything: **`createDatabase(databaseUrl)`** in `packages/db/src/index.ts`. Today it unconditionally builds a PGlite client + pglite migrator. After this change it:

1. Calls `resolveDatabaseBackend(url)` (in `@ai-kanban/env/server`).
2. Branches:
   - `pglite` → existing path (`new PGlite(path)`, `drizzle-orm/pglite`, `drizzle-orm/pglite/migrator`).
   - `postgres` → `postgres(url)` client, `drizzle-orm/postgres-js`, `drizzle-orm/postgres-js/migrator`.
3. Runs `migrate(db, { migrationsFolder })` with the backend-matched migrator (same `../drizzle` folder).
4. Returns `{ db, close }` — the cached context.

Everything above the seam (services, auth, MCP server, scheduler, CLI) is untouched because they depend only on the `Database` type and `closeDatabase()`. `drizzle-kit` reads the same scheme in `drizzle.config.ts` so `db:generate`/`db:push`/`db:studio` target the right place. The result: changing `DATABASE_URL` is the entire operator-facing switch.

## Implementation Units

### U1 — Backend resolver in the env package

- **Goal:** One function that classifies `DATABASE_URL` into a typed backend descriptor; remove the "Postgres not configured" throw.
- **Depends on:** none
- **Files:** `packages/env/src/server.ts`
- **Approach:** Add `resolveDatabaseBackend(databaseUrl = env.DATABASE_URL)` returning `{ kind: "pglite", path: string }` for `file:` (and bare paths, current fallback) or `{ kind: "postgres", url: string }` for `postgres://`/`postgresql://`. Keep `resolvePglitePath` working for the PGlite branch (or have it delegate). Delete the `throw new Error("PostgreSQL is not configured yet…")`. Optionally tighten the `DATABASE_URL` zod field with a `.refine` that the scheme is one of the supported forms.
- **Test scenarios:**
  - Given `DATABASE_URL=file:./data/pglite`, when resolved, then `{ kind: "pglite", path }` with an absolute path under the repo root.
  - Given `DATABASE_URL=postgres://u:p@host:5432/db`, when resolved, then `{ kind: "postgres", url }` with the URL passed through verbatim.
  - Given `DATABASE_URL=postgresql://…?sslmode=require`, when resolved, then `kind: "postgres"` and the query string is preserved.
  - Given a bare relative path (legacy), when resolved, then `kind: "pglite"` (back-compat).
- **Verification:** `pnpm check-types`; a focused unit test if a test runner exists, else exercised via U2.

### U2 — Dual-backend `createDatabase` / `closeDatabase`

- **Goal:** Build the right Drizzle client + migrator from the resolved backend; expose a backend-agnostic context.
- **Depends on:** U1
- **Files:** `packages/db/src/index.ts`, `packages/db/package.json`
- **Approach:** Add `postgres` (postgres-js) to `packages/db` dependencies. In `createDatabase`, call `resolveDatabaseBackend`. For `pglite`: keep current logic (mkdir, `new PGlite`, `drizzle-orm/pglite`, pglite migrator). For `postgres`: create a `postgres(url)` client, `drizzle(client, { schema })` from `drizzle-orm/postgres-js`, and migrate with `drizzle-orm/postgres-js/migrator`, same `../drizzle` folder. Unify the exported `Database` type (D4) and change `DatabaseContext` to `{ db, close }` (D5); `closeDatabase` calls `close`. Keep the module-level `cached` singleton.
- **Test scenarios:**
  - Given a `file:` URL, when `createDatabase()` runs, then PGlite is used and migrations apply (existing dev flow unchanged: `pnpm dev` boots).
  - Given a reachable `postgres://` URL (local Docker Postgres), when `createDatabase()` runs, then it connects, applies all migrations, and returns a working `db`; a follow-up `tickets.listProjects()` query succeeds.
  - Given an unreachable `postgres://` URL, when `createDatabase()` runs, then it fails fast with a clear connection error (not a PGlite path error).
- **Verification:** Boot the server against a local `docker run postgres` instance; `curl /health` → `{"ok":true}`; create a project via the UI/CLI and confirm rows land in Postgres (`psql … \dt`, `select * from projects`).

### U3 — `drizzle-kit` config honors the Postgres URL

- **Goal:** `db:generate`, `db:migrate`, `db:push`, `db:studio` work against external Postgres.
- **Depends on:** U1
- **Files:** `packages/db/drizzle.config.ts`
- **Approach:** Branch `dbCredentials.url`: for `postgres://`/`postgresql://` pass the URL through unchanged; for `file:`/bare keep the resolved filesystem path. `dialect` stays `"postgresql"`. (Reuse the U1 resolver if importable from drizzle-kit context; otherwise mirror the small scheme check already present in the file.)
- **Test scenarios:**
  - Given `DATABASE_URL=postgres://…`, when `pnpm db:migrate` runs, then drizzle-kit applies migrations to the Postgres instance with no path coercion.
  - Given a `file:` URL, when `pnpm db:generate` runs after a schema edit, then a new migration is produced (existing behavior unchanged).
- **Verification:** Against local Docker Postgres: `pnpm db:migrate` applies cleanly; `pnpm db:studio` connects.

### U4 — Verify migration portability on real Postgres

- **Goal:** Confirm the existing `packages/db/drizzle/*.sql` apply cleanly to a stock PostgreSQL server (not just PGlite).
- **Depends on:** U2, U3
- **Files:** `packages/db/drizzle/` (read-only verification; only touched if an incompatibility is found)
- **Approach:** Run all migrations against a clean Postgres 16 container. Watch for any PGlite-tolerated-but-Postgres-strict DDL. Current scan shows standard DDL (enums, `timestamp with time zone`, text PKs) — expected to pass. If anything fails, capture it as a new corrective migration (do not edit historical ones).
- **Test scenarios:**
  - Given an empty Postgres 16 database, when all migrations run in order, then they complete with no errors and the schema matches (all tables/enums/indexes present).
- **Verification:** `pnpm db:migrate` against `postgres:16` Docker exits 0; `\dt` and `\dT` list the expected tables and enum types.

### U5 — Env, examples, and SSL guidance

- **Goal:** Make the option discoverable and correct out of the box for managed providers.
- **Depends on:** U1
- **Files:** `.env.example`, `packages/env/src/server.ts` (only if adding `DATABASE_POOL_MAX`)
- **Approach:** Update the `.env.example` `DATABASE_URL` comment from "(future)" to a real example: keep `file:./data/pglite` as default and show a commented `postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require` line with a note that managed providers (Azure Flexible Server, Neon, Supabase) require `sslmode=require`. Optionally add an optional `DATABASE_POOL_MAX` only if U2 surfaced a need.
- **Test scenarios:** `Test expectation: none — documentation/config only; behavior covered by U1/U2.`
- **Verification:** Fresh `cp .env.example .env` with a Postgres URL boots the server (manual).

### U6 — Documentation: external Postgres + Azure App Service ("option A")

- **Goal:** Operators can install against external Postgres, including the Azure managed-Postgres + App Service demo path.
- **Depends on:** U2, U5
- **Files:** `CLAUDE.md`, `README.md`, `docs/deploy/README.md`, `docs/deploy/installation-from-source.md`, `docs/deploy/azure-vm.md` / `docs/deploy/azure-quickstart.md`, and a new `docs/deploy/external-postgres.md`
- **Approach:** New `external-postgres.md`: when to use it, `DATABASE_URL` format, SSL note, provisioning Azure Database for PostgreSQL **Flexible Server** (firewall/VNet, `sslmode=require`), and deploying the container to **Azure App Service for Containers** on the existing App Service Plan (the "option A" demo) — with `DATABASE_URL`, `BETTER_AUTH_URL`/`WEB_ORIGIN`, and that `./data` no longer needs persistence when Postgres is external. Update the deploy index and the "stick with VM until external Postgres is supported" / "Postgres support lands" notes in `azure-vm.md`/`azure-quickstart.md`/`README.md` to point at the new capability. Note explicitly that **MCP (`POST /mcp`) and the CLI are unaffected** by the backend choice (R5).
- **Test scenarios:** `Test expectation: none — docs.`
- **Verification:** A reader can follow `external-postgres.md` end to end; internal doc links resolve.

### U7 — Type-check, smoke both backends, regression pass

- **Goal:** Prove both backends work and nothing regressed.
- **Depends on:** U2, U3, U4
- **Files:** none (verification unit)
- **Approach:** Run `pnpm check-types` across the monorepo. Boot once with the default `file:` URL (PGlite) and once with a `postgres://` URL (local Docker), exercising: sign-up/sign-in, create project + ticket via intake, claim via CLI, and one MCP tool call (`aikanban_list_projects`) to satisfy R5.
- **Test scenarios:**
  - Given the PGlite default, when the app boots and a ticket is created then listed, then it behaves exactly as today.
  - Given a Postgres URL, when the same flow runs (including `POST /mcp` `aikanban_list_projects`), then results are identical and rows persist in Postgres.
- **Verification:** `pnpm check-types` passes; both smoke runs green; MCP call returns the project list against Postgres.

## Risks & Mitigations

- **Driver type mismatch across PGlite vs postgres-js** (Drizzle instance types differ) → unify on the shared `PgDatabase`/union type (D4); `pnpm check-types` is the gate (U7).
- **A migration that PGlite tolerates but strict Postgres rejects** → U4 verifies on real Postgres before relying on it; fix via a new corrective migration, never by editing history.
- **TLS/firewall friction with managed providers** (most common real-world failure) → document `sslmode=require` and firewall/VNet rules in U6; fail-fast connection error in U2 makes misconfig obvious.
- **Connection limits on small managed tiers / App Service scale-out** → keep a single cached pool; expose `DATABASE_POOL_MAX` only if needed; note tier sizing in docs.

## Alternatives Considered

- **`node-postgres` (`pg`) instead of `postgres-js`** — rejected: postgres-js is lighter, parses `sslmode` from the URL, and has equally first-class Drizzle support; either would work, no strong reason to pull in `pg`.
- **A separate `DB_BACKEND=pglite|postgres` flag** — rejected: redundant with the URL scheme and a second source of truth to keep consistent (D1).
- **Keep PGlite and only fix App Service storage** (e.g. premium Azure Files) — rejected: doesn't address the documented unreliability of an embedded DB on network storage; external Postgres is the durable answer and unblocks Container Apps too.

## Deferred / Out of Scope

- **PGlite → Postgres data migration tool** (export existing local board into the new Postgres). Comes back if anyone needs to promote an existing VM install rather than start fresh.
- **Custom CA-cert SSL env** for providers needing a root cert beyond `sslmode=require`. Add when a real provider requires it.
- **Encrypting provider PATs at rest** — pre-existing concern, independent of this change.
- **IaC for the Azure Postgres + App Service stack** — could live in `~/rebtech/` (the Rebtech workspace) later.

## Sources

- `packages/db/src/index.ts`, `packages/db/src/migrate.ts` — current PGlite-only connection + startup migration seam.
- `packages/env/src/server.ts` — `DATABASE_URL` default and the `resolvePglitePath` throw to remove.
- `packages/db/drizzle.config.ts` — drizzle-kit dialect/credentials to branch.
- `packages/db/drizzle/0000_cute_centennial.sql` — confirms Postgres-dialect, portable migrations (D6).
- `apps/server/src/index.ts` — single `createDatabase(env.DATABASE_URL)` call site; consumers depend only on `Database`.
- `Dockerfile` (`CMD pnpm … start`) — migrations run on container start via `createDatabase`.
- `docs/deploy/azure-quickstart.md`, `docs/deploy/azure-vm.md` — existing "until external Postgres is supported" guidance this unblocks.
- This conversation — R1–R6, the Azure App Service demo target ("option A"), and the MCP-compatibility requirement.
```
