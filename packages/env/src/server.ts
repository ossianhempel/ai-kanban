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
  ALLOW_PUBLIC_SIGNUP: z.coerce.boolean().optional(),
  SIGNUP_ALLOWED_EMAILS: z.string().optional(),
  SIGNUP_ALLOWED_DOMAINS: z.string().optional(),
  AUTH_EMAIL_PASSWORD_ENABLED: z.coerce.boolean().optional(),
  AUTH_PROVIDERS: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_ID: z.string().optional(),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const parsed = serverSchema.parse(process.env);

export const env = {
  ...parsed,
  ALLOW_PUBLIC_SIGNUP: parsed.ALLOW_PUBLIC_SIGNUP ?? parsed.NODE_ENV === "development",
};

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
