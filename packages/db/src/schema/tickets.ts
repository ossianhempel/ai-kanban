import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { primaryId } from "./base";
import { projects } from "./projects";
import { repositories } from "./repositories";

export const ticketStatusEnum = pgEnum("ticket_status", [
  "inbox",
  "needs_clarification",
  "ready_for_planning",
  "agent_ready",
  "running",
  "pr_open",
  "needs_human_review",
  "done",
  "blocked",
]);

export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "medium", "high", "urgent"]);

export const tickets = pgTable(
  "tickets",
  {
    ...primaryId,
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    acceptanceCriteria: text("acceptance_criteria").notNull().default(""),
    businessContext: text("business_context").notNull().default(""),
    expectedOutcome: text("expected_outcome").notNull().default(""),
    status: ticketStatusEnum("status").notNull().default("inbox"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    repositoryId: uuid("repository_id").references(() => repositories.id, { onDelete: "set null" }),
    readinessScore: integer("readiness_score"),
    readinessIssues: jsonb("readiness_issues").$type<string[]>().notNull().default([]),
    agentBrief: jsonb("agent_brief").$type<Record<string, unknown>>(),
    claimedBy: text("claimed_by"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    branchName: text("branch_name"),
    pullRequestUrl: text("pull_request_url"),
    pullRequestExternalId: text("pull_request_external_id"),
    pullRequestNumber: integer("pull_request_number"),
    pullRequestState: text("pull_request_state"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
  },
  (table) => [uniqueIndex("tickets_project_number_idx").on(table.projectId, table.number)],
);

export const ticketCommentKindEnum = ["comment", "agent_comment", "clarification_request"] as const;
export type TicketCommentKind = (typeof ticketCommentKindEnum)[number];

export const ticketComments = pgTable("ticket_comments", {
  ...primaryId,
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  kind: text("kind").notNull().default("comment"),
});
