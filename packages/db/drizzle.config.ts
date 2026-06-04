import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(packageDir, "../..");
config({ path: resolve(repoRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/pglite";
const isPostgres =
  databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://");

// External Postgres: pass the URL through unchanged (drizzle-kit connects directly).
// PGlite (file: or bare path): resolve to an absolute filesystem path.
const url = isPostgres
  ? databaseUrl
  : databaseUrl.startsWith("file:")
    ? resolve(repoRoot, databaseUrl.slice("file:".length))
    : resolve(repoRoot, databaseUrl);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url,
  },
});
