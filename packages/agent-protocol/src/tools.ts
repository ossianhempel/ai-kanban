export const MCP_TOOL_NAMES = {
  listTasks: "aikanban_list_tasks",
  claimTask: "aikanban_claim_task",
  getTaskContext: "aikanban_get_task_context",
  updateTaskStatus: "aikanban_update_task_status",
  completeTask: "aikanban_complete_task",
  linkPullRequest: "aikanban_link_pull_request",
  createPullRequest: "aikanban_create_pull_request",
  getRepositoryActivity: "aikanban_get_repository_activity",
  addTicketComment: "aikanban_add_ticket_comment",
  createTask: "aikanban_create_task",
  listProjects: "aikanban_list_projects",
  getProject: "aikanban_get_project",
} as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[keyof typeof MCP_TOOL_NAMES];

/** MCP tools that mutate instance data — require Bearer token when `AIKANBAN_API_TOKEN` is set. */
export const MCP_WRITE_TOOL_NAMES = [
  MCP_TOOL_NAMES.createTask,
  MCP_TOOL_NAMES.claimTask,
  MCP_TOOL_NAMES.updateTaskStatus,
  MCP_TOOL_NAMES.completeTask,
  MCP_TOOL_NAMES.linkPullRequest,
  MCP_TOOL_NAMES.createPullRequest,
  MCP_TOOL_NAMES.addTicketComment,
] as const satisfies readonly McpToolName[];

export const MCP_WRITE_TOOL_SET = new Set<string>(MCP_WRITE_TOOL_NAMES);
