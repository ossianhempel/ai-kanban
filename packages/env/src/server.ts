import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
config({ path: resolve(repoRoot, ".env") });

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  AIKANBAN_DATA_DIR: z.string().default("./data"),
  DATABASE_URL: z.string().default("file:./data/pglite"),
  BETTER_AUTH_SECRET: z.string().min(16).default("dev-only-secret-change-me-in-prod!!"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:5173"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  AIKANBAN_API_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  AZURE_DEVOPS_WEBHOOK_SECRET: z.string().optional(),
});

export const env = serverSchema.parse(process.env);

export function resolveDataDir(dataDir = env.AIKANBAN_DATA_DIR) {
  return resolve(repoRoot, dataDir);
}

export function resolvePglitePath(databaseUrl = env.DATABASE_URL) {
  if (databaseUrl.startsWith("file:")) {
    return resolve(repoRoot, databaseUrl.slice("file:".length));
  }

  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    throw new Error("PostgreSQL is not configured yet. Use a file: DATABASE_URL for PGlite.");
  }

  return resolve(repoRoot, databaseUrl);
}
