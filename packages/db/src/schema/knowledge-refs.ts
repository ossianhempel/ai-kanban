import { integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { primaryId } from "./base";
import { projects } from "./projects";
import { tickets } from "./tickets";

export const knowledgeScopeEnum = pgEnum("knowledge_scope", ["instance", "project", "ticket"]);

export const knowledgeRefs = pgTable("knowledge_refs", {
  ...primaryId,
  scope: knowledgeScopeEnum("scope").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  resolvedContent: text("resolved_content"),
  sortOrder: integer("sort_order").notNull().default(0),
});
