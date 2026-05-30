import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  claimTaskInputSchema,
  completeTaskInputSchema,
  createPullRequestInputSchema,
  getRepositoryActivityInputSchema,
  getTaskContextInputSchema,
  linkPullRequestInputSchema,
  listTasksInputSchema,
  MCP_TOOL_NAMES,
  ticketStatusSchema,
  updateTaskStatusInputSchema,
} from "@ai-kanban/agent-protocol";
import type { RepositoryService } from "../services/repositories";
import type { TicketService } from "../services/tickets";

function toolResult<T>(payload: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function createMcpServer(tickets: TicketService, repos: RepositoryService) {
  const server = new McpServer({
    name: "ai-kanban-mcp-server",
    version: "0.1.0",
  });

  server.registerTool(
    MCP_TOOL_NAMES.listTasks,
    {
      title: "List AI Kanban Tasks",
      description: "List tickets, optionally filtered by project slug or status.",
      inputSchema: listTasksInputSchema,
    },
    async (input) => {
      const rows = await tickets.listTickets({
        projectSlug: input.projectSlug,
        status: input.status,
      });
      return toolResult({ tasks: rows });
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.claimTask,
    {
      title: "Claim AI Kanban Task",
      description: "Claim a ticket for agent execution.",
      inputSchema: claimTaskInputSchema,
    },
    async (input) => {
      const ticket = await tickets.claimTicket(input.taskRef, input.agentId);
      if (!ticket) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return toolResult({ ticket });
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.getTaskContext,
    {
      title: "Get AI Kanban Task Context",
      description: "Get full task context including agent brief.",
      inputSchema: getTaskContextInputSchema,
    },
    async (input) => {
      const context = await tickets.getTicketContext(input.taskRef);
      if (!context) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return toolResult(context);
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.updateTaskStatus,
    {
      title: "Update AI Kanban Task Status",
      description: "Move a ticket to a new workflow status.",
      inputSchema: updateTaskStatusInputSchema,
    },
    async (input) => {
      const status = ticketStatusSchema.parse(input.status);
      const ticket = await tickets.updateTicketStatus(input.taskRef, status);
      if (!ticket) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return toolResult({ ticket });
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.completeTask,
    {
      title: "Complete AI Kanban Task",
      description: "Mark a ticket as done.",
      inputSchema: completeTaskInputSchema,
    },
    async (input) => {
      const ticket = await tickets.completeTicket(input.taskRef, input.summary);
      if (!ticket) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return toolResult({ ticket });
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.linkPullRequest,
    {
      title: "Link Pull Request to Task",
      description: "Link an existing pull request URL to a ticket and move it to PR Open.",
      inputSchema: linkPullRequestInputSchema,
    },
    async (input) => {
      const ticket = await tickets.linkPullRequest(input.taskRef, {
        url: input.url,
        branchName: input.branchName,
      });
      if (!ticket) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return toolResult({ ticket });
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.createPullRequest,
    {
      title: "Create Pull Request for Task",
      description: "Create a pull request on the ticket linked repository and move the ticket to PR Open.",
      inputSchema: createPullRequestInputSchema,
    },
    async (input) => {
      const result = await tickets.createPullRequestForTicket(input.taskRef, {
        title: input.title,
        body: input.body,
        headBranch: input.headBranch,
        baseBranch: input.baseBranch,
        draft: input.draft,
      });
      if (!result?.ticket) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return toolResult(result);
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.getRepositoryActivity,
    {
      title: "Get Repository Activity",
      description: "Fetch open and recent pull requests for a connected repository.",
      inputSchema: getRepositoryActivityInputSchema,
    },
    async (input) => {
      const activity = await repos.getRepositoryActivity(input.repositoryId, undefined, input.refresh ?? true);
      if (!activity) {
        throw new Error(`Repository not found or not connected: ${input.repositoryId}`);
      }
      return toolResult({ activity });
    },
  );

  return server;
}
