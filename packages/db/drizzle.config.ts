import { config } from "dotenv";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(packageDir, "../..");
config({ path: resolve(repoRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/pglite";
const pglitePath = databaseUrl.startsWith("file:")
  ? resolve(repoRoot, databaseUrl.slice("file:".length))
  : resolve(repoRoot, databaseUrl);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: pglitePath,
  },
});
