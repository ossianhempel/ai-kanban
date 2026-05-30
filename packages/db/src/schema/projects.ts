import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { primaryId } from "./base";

export const projects = pgTable(
  "projects",
  {
    ...primaryId,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    agentContext: text("agent_context").notNull().default(""),
  },
  (table) => [uniqueIndex("projects_slug_idx").on(table.slug)],
);
