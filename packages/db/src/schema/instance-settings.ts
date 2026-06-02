import { boolean, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { primaryId } from "./base";

export type StoredAgentDirectiveOverride = {
  title?: string;
  body?: string;
  priority?: "mandatory" | "recommended";
};

export const instanceSettings = pgTable("instance_settings", {
  ...primaryId,
  agentPlaybook: text("agent_playbook").notNull().default(""),
  signupAllowPublic: boolean("signup_allow_public").notNull().default(false),
  agentDirectiveOverrides: jsonb("agent_directive_overrides")
    .$type<Record<string, StoredAgentDirectiveOverride>>()
    .notNull()
    .default({}),
  /** When set, MCP tools use this project slug when projectSlug/projectId is omitted. */
  defaultProjectSlug: text("default_project_slug"),
});
