import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { primaryId } from "./base";
import { providerConnections, sourceProviderEnum } from "./provider-connections";
import { projects } from "./projects";

export type RepositoryActivitySnapshot = {
  fetchedAt: string;
  defaultBranch: string;
  openPullRequests: Array<Record<string, unknown>>;
  recentPullRequests: Array<Record<string, unknown>>;
};

export const repositories = pgTable("repositories", {
  ...primaryId,
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => providerConnections.id, { onDelete: "set null" }),
  provider: sourceProviderEnum("provider"),
  externalId: text("external_id"),
  owner: text("owner"),
  repoName: text("repo_name"),
  fullName: text("full_name"),
  visibility: text("visibility"),
  name: text("name").notNull(),
  url: text("url"),
  localPath: text("local_path"),
  defaultBranch: text("default_branch").notNull().default("main"),
  readinessScore: integer("readiness_score"),
  readinessReport: jsonb("readiness_report").$type<Record<string, unknown>>(),
  activitySnapshot: jsonb("activity_snapshot").$type<RepositoryActivitySnapshot>(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
});
