import { z } from "zod";

export const ticketStatusSchema = z.enum([
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

export type TicketStatus = z.infer<typeof ticketStatusSchema>;

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

export const MCP_TOOL_NAMES = {
  listTasks: "aikanban_list_tasks",
  claimTask: "aikanban_claim_task",
  getTaskContext: "aikanban_get_task_context",
  updateTaskStatus: "aikanban_update_task_status",
  completeTask: "aikanban_complete_task",
  linkPullRequest: "aikanban_link_pull_request",
  createPullRequest: "aikanban_create_pull_request",
  getRepositoryActivity: "aikanban_get_repository_activity",
} as const;

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

export * from "./readiness.js";
