import { z } from "zod";
import { ticketStatusSchema } from "./status.js";

export { MCP_TOOL_NAMES } from "./tools.js";
export type { McpToolName } from "./tools.js";
export { ticketStatusSchema, type TicketStatus } from "./status.js";

export const agentBriefSchema = z.object({
  task: z.string(),
  context: z.string(),
  relevantDocumentation: z.array(z.string()),
  relevantFiles: z.array(z.string()),
  constraints: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
  testCommands: z.array(z.string()),
  definitionOfDone: z.array(z.string()),
  forbiddenChanges: z.array(z.string()),
});

export type AgentBrief = z.infer<typeof agentBriefSchema>;

export const ticketCommentKindSchema = z.enum(["comment", "agent_comment", "clarification_request"]);
export type TicketCommentKind = z.infer<typeof ticketCommentKindSchema>;

export const updateTaskStatusInputSchema = z.object({
  taskRef: z.string().min(1).describe("Ticket id or key like PROJ-123"),
  status: ticketStatusSchema,
});

export const claimTaskInputSchema = z.object({
  taskRef: z.string().min(1).describe("Ticket id or key like PROJ-123"),
  agentId: z.string().min(1).describe("Agent or user identifier claiming the task"),
});

export const getTaskContextInputSchema = z.object({
  taskRef: z.string().min(1).describe("Ticket id or key like PROJ-123"),
});

export const completeTaskInputSchema = z.object({
  taskRef: z.string().min(1).describe("Ticket id or key like PROJ-123"),
  summary: z.string().optional().describe("Optional completion summary"),
});

export const listTasksInputSchema = z.object({
  projectSlug: z.string().optional().describe("Filter by project slug"),
  status: ticketStatusSchema.optional().describe("Filter by ticket status"),
});

export const linkPullRequestInputSchema = z.object({
  taskRef: z.string().min(1).describe("Ticket id or key like PROJ-123"),
  url: z.string().url().describe("Pull request URL from the connected provider"),
  branchName: z.string().optional().describe("Optional branch name override"),
});

export const createPullRequestInputSchema = z.object({
  taskRef: z.string().min(1).describe("Ticket id or key like PROJ-123"),
  headBranch: z.string().min(1).describe("Branch containing the changes"),
  title: z.string().optional().describe("Pull request title"),
  body: z.string().optional().describe("Pull request body"),
  baseBranch: z.string().optional().describe("Target branch (defaults to repo default)"),
  draft: z.boolean().optional().describe("Open as draft pull request"),
});

export const getRepositoryActivityInputSchema = z.object({
  repositoryId: z.string().uuid().describe("Repository id"),
  refresh: z.boolean().optional().describe("Force refresh from provider API"),
});

export const addTicketCommentInputSchema = z.object({
  taskRef: z.string().min(1).describe("Ticket id or key like PROJ-123"),
  body: z.string().min(1).describe("Comment text"),
  agentId: z.string().optional().describe("Agent identifier when posting as an automated agent"),
  kind: ticketCommentKindSchema.optional().describe("comment, agent_comment, or clarification_request"),
});

export const createTaskInputSchema = z.object({
  projectSlug: z
    .string()
    .min(1)
    .optional()
    .describe("Project slug (e.g. default). Required unless projectId is set."),
  projectId: z.string().uuid().optional().describe("Project UUID"),
  title: z.string().min(1).describe("Short task title"),
  description: z.string().optional().describe("What needs to be done"),
  acceptanceCriteria: z.string().optional().describe("How we know it is done"),
  businessContext: z.string().optional().describe("Why this matters"),
  expectedOutcome: z.string().optional().describe("Expected result when complete"),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional().describe("Ticket priority"),
  repositoryId: z.string().uuid().nullable().optional().describe("Linked repository id"),
  intakeMode: z
    .enum(["inbox", "strict"])
    .optional()
    .describe("inbox = draft ticket; strict = require full intake (defaults to agent_ready or needs_clarification)"),
});

export const listProjectsInputSchema = z.object({});

export * from "./readiness.js";
export * from "./directives/index.js";
