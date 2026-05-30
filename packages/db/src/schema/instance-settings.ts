import { pgTable, text } from "drizzle-orm/pg-core";
import { primaryId } from "./base";

export const instanceSettings = pgTable("instance_settings", {
  ...primaryId,
  agentPlaybook: text("agent_playbook").notNull().default(""),
});
