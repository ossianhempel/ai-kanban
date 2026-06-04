import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { resolveDatabaseBackend } from "@ai-kanban/env/server";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schema } from "./schema/index";

// Both PGlite and postgres-js Drizzle instances are PgDatabase subtypes sharing
// the query-builder API used across services, so consumers take one type
// regardless of which driver is underneath.
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export type DatabaseContext = {
  db: Database;
  close: () => Promise<void>;
};

let cached: DatabaseContext | null = null;

function migrationsFolder() {
  return fileURLToPath(new URL("../drizzle", import.meta.url));
}

async function createPgliteContext(path: string): Promise<DatabaseContext> {
  await mkdir(dirname(path), { recursive: true });

  const client = new PGlite(path);
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder: migrationsFolder() });

  return { db: db as Database, close: () => client.close() };
}

async function createPostgresContext(url: string): Promise<DatabaseContext> {
  const client = postgres(url);
  const db = drizzlePostgres(client, { schema });
  await migratePostgres(db, { migrationsFolder: migrationsFolder() });

  return { db: db as Database, close: () => client.end() };
}

export async function createDatabase(databaseUrl?: string): Promise<DatabaseContext> {
  if (cached) {
    return cached;
  }

  const backend = resolveDatabaseBackend(databaseUrl);
  cached =
    backend.kind === "postgres"
      ? await createPostgresContext(backend.url)
      : await createPgliteContext(backend.path);

  return cached;
}

export async function closeDatabase() {
  if (cached) {
    await cached.close();
    cached = null;
  }
}

export { schema };
