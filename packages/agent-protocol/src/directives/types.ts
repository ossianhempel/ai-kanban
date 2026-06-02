import type { TicketStatus } from "../status.js";

export type AgentDirectivePhase =
  | "pre_execution_review"
  | "planning_review"
  | "execution"
  | "resume_work"
  | "read_only"
  | "pr_hygiene"
  | "human_review"
  | "list_agent_ready"
  | "list_default"
  | "comment_added"
  | "status_updated"
  | "task_completed";

export type AgentDirectivePriority = "mandatory" | "recommended";

import type { McpToolName } from "../tools.js";

export type DirectiveToolKey =
  | "listTasks"
  | "claimTask"
  | "getTaskContext"
  | "updateTaskStatus"
  | "completeTask"
  | "linkPullRequest"
  | "createPullRequest"
  | "getRepositoryActivity"
  | "addTicketComment";

export type AgentDirective = {
  phase: AgentDirectivePhase;
  priority: AgentDirectivePriority;
  title: string;
  instructions: string;
  allowedNextTools?: McpToolName[];
  blockedUntilComplete?: McpToolName[];
  /** Stable id for admin overrides / debugging (e.g. get_task_context.agent_ready). */
  templateId?: string;
};

/**
 * Editable prompt definition. One file per status/action keeps copy easy to change.
 * `body` supports {{ticketKey}}, {{statusLabel}}, {{tools.claimTask}}, etc.
 */
export type DirectiveTemplate = {
  id: string;
  phase: AgentDirectivePhase;
  priority: AgentDirectivePriority;
  title: string;
  body: string;
  allowedNextTools?: DirectiveToolKey[];
  blockedUntilComplete?: DirectiveToolKey[];
};

export type DirectiveRenderContext = {
  ticketKey?: string;
  status?: TicketStatus;
  statusLabel?: string;
  filterStatus?: TicketStatus;
  filterStatusLabel?: string;
  nextStatus?: TicketStatus;
  nextStatusLabel?: string;
  commentKind?: string;
  projectSlug?: string;
  projectName?: string;
  tools: Record<DirectiveToolKey, McpToolName>;
};

export type DirectiveContext = {
  ticketKey?: string;
  status?: TicketStatus;
  filterStatus?: TicketStatus;
  nextStatus?: TicketStatus;
  commentKind?: string;
  projectSlug?: string;
  projectName?: string;
};

export type DirectiveTrigger =
  | { tool: "getTaskContext"; status: TicketStatus }
  | { tool: "listTasks"; filterStatus?: TicketStatus }
  | { tool: "claimTask" }
  | { tool: "addTicketComment"; commentKind?: string; status?: TicketStatus }
  | { tool: "updateTaskStatus"; nextStatus: TicketStatus }
  | { tool: "completeTask" };

/** Fields an admin can override per template id (stored in instance_settings). */
export type DirectiveTemplateOverride = {
  title?: string;
  body?: string;
  priority?: AgentDirectivePriority;
};

/** Partial overrides keyed by template id — for instance admin UI and DB storage. */
export type DirectiveTemplateOverrides = Partial<Record<string, DirectiveTemplateOverride>>;
