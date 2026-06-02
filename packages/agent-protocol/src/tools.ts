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
} as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[keyof typeof MCP_TOOL_NAMES];
