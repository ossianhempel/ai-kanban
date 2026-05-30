import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { primaryId } from "./base";

export const sourceProviderEnum = pgEnum("source_provider", ["github", "azure_devops", "gitlab"]);

export type StoredProviderCredentials = {
  kind: "github_pat" | "azure_devops_pat" | "gitlab_pat";
  accessToken: string;
  organization?: string;
  baseUrl?: string;
};

export const providerConnections = pgTable("provider_connections", {
  ...primaryId,
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: sourceProviderEnum("provider").notNull(),
  accountLogin: text("account_login").notNull(),
  accountDisplayName: text("account_display_name"),
  externalAccountId: text("external_account_id").notNull(),
  credentials: jsonb("credentials").$type<StoredProviderCredentials>().notNull(),
  scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
