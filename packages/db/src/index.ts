import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { resolvePglitePath } from "@ai-kanban/env/server";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { schema } from "./schema/index";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export type DatabaseContext = {
  db: Database;
  client: PGlite;
};

let cached: DatabaseContext | null = null;

export async function createDatabase(databaseUrl?: string): Promise<DatabaseContext> {
  if (cached) {
    return cached;
  }

  const dataDir = resolvePglitePath(databaseUrl);
  await mkdir(dirname(dataDir), { recursive: true });

  const client = new PGlite(dataDir);
  const db = drizzle({ client, schema });

  const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));
  await migrate(db, { migrationsFolder });

  cached = { db, client };
  return cached;
}

export async function closeDatabase() {
  if (cached) {
    await cached.client.close();
    cached = null;
  }
}

export { schema };
