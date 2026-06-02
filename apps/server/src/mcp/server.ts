import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addTicketCommentInputSchema,
  claimTaskInputSchema,
  completeTaskInputSchema,
  createPullRequestInputSchema,
  createTaskInputSchema,
  getProjectInputSchema,
  getRepositoryActivityInputSchema,
  getTaskContextInputSchema,
  linkPullRequestInputSchema,
  listProjectsInputSchema,
  listTasksInputSchema,
  MCP_TOOL_NAMES,
  resolveAgentDirective,
  ticketStatusSchema,
  updateTaskStatusInputSchema,
} from "@ai-kanban/agent-protocol";
import { IntakeValidationError, formatTicketKey } from "@ai-kanban/core";
import type { RepositoryService } from "../services/repositories";
import type { AgentDirectiveService } from "../services/agent-directives";
import type { TicketService } from "../services/tickets";
import { buildMcpToolResult } from "./tool-result";

export function createMcpServer(
  tickets: TicketService,
  repos: RepositoryService,
  agentDirectives: AgentDirectiveService,
) {
  const server = new McpServer({
    name: "ai-kanban-mcp-server",
    version: "0.1.0",
  });

  async function withDirective<T extends Record<string, unknown>>(
    tool: (typeof MCP_TOOL_NAMES)[keyof typeof MCP_TOOL_NAMES],
    context: Parameters<typeof resolveAgentDirective>[1],
    payload: T,
  ) {
    const templateOverrides = await agentDirectives.getOverrides();
    const directive = resolveAgentDirective(tool, context, { templateOverrides });
    return buildMcpToolResult(payload, directive);
  }

  server.registerTool(
    MCP_TOOL_NAMES.listTasks,
    {
      title: "List AI Kanban Tasks",
      description: "List tickets, optionally filtered by project slug or status.",
      inputSchema: listTasksInputSchema,
    },
    async (input) => {
      const project = input.projectSlug
        ? await tickets.resolveProject({ projectSlug: input.projectSlug })
        : await tickets.resolveProjectForAgent({});
      if (!project) {
        throw new Error(`Project not found: ${input.projectSlug}`);
      }
      const rows = await tickets.listTickets({
        projectSlug: project.slug,
        status: input.status,
      });
      return withDirective(
        MCP_TOOL_NAMES.listTasks,
        {
          filterStatus: input.status,
          projectSlug: project.slug,
          projectName: project.name,
        },
        { tasks: rows, projectSlug: project.slug },
      );
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
      const context = await tickets.getTicketContext(input.taskRef);
      return withDirective(MCP_TOOL_NAMES.claimTask, { ticketKey: context?.ticketKey }, { ticket });
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.getTaskContext,
    {
      title: "Get AI Kanban Task Context",
      description: "Get full task context including agent brief and workflow directive for the ticket status.",
      inputSchema: getTaskContextInputSchema,
    },
    async (input) => {
      const context = await tickets.getTicketContext(input.taskRef);
      if (!context) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      const templateOverrides = await agentDirectives.getOverrides();
      const directive = resolveAgentDirective(
        MCP_TOOL_NAMES.getTaskContext,
        {
          ticketKey: context.ticketKey,
          status: context.ticket.status,
        },
        { templateOverrides },
      );
      return buildMcpToolResult(context, directive);
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
      const before = await tickets.getTicketContext(input.taskRef);
      const ticket = await tickets.updateTicketStatus(input.taskRef, status);
      if (!ticket) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return withDirective(
        MCP_TOOL_NAMES.updateTaskStatus,
        { ticketKey: before?.ticketKey, nextStatus: status },
        { ticket },
      );
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
      const before = await tickets.getTicketContext(input.taskRef);
      const ticket = await tickets.completeTicket(input.taskRef, input.summary);
      if (!ticket) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return withDirective(MCP_TOOL_NAMES.completeTask, { ticketKey: before?.ticketKey }, { ticket });
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
      return buildMcpToolResult({ ticket }, null);
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
      return buildMcpToolResult(result, null);
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
      return buildMcpToolResult({ activity }, null);
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.addTicketComment,
    {
      title: "Add Ticket Comment",
      description: "Add a comment to a ticket. Use kind clarification_request when asking the human author for missing information.",
      inputSchema: addTicketCommentInputSchema,
    },
    async (input) => {
      const before = await tickets.getTicketContext(input.taskRef);
      const result = await tickets.addTicketComment(input.taskRef, {
        body: input.body,
        agentId: input.agentId,
        kind: input.kind,
      });
      if (!result) {
        throw new Error(`Task not found: ${input.taskRef}`);
      }
      return withDirective(
        MCP_TOOL_NAMES.addTicketComment,
        {
          commentKind: input.kind,
          status: before?.ticket.status,
          ticketKey: before?.ticketKey,
        },
        result,
      );
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.listProjects,
    {
      title: "List AI Kanban Projects",
      description: "List projects on this instance. Use project slug when creating tickets.",
      inputSchema: listProjectsInputSchema,
    },
    async () => {
      const payload = await tickets.listProjectsForAgent();
      return withDirective(MCP_TOOL_NAMES.listProjects, {}, payload);
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.getProject,
    {
      title: "Get AI Kanban Project",
      description:
        "Load project context (name, agent context, ticket key prefix). Call after list_projects when multiple projects exist, or omit projectSlug when the instance has a default.",
      inputSchema: getProjectInputSchema,
    },
    async (input) => {
      const project = await tickets.getProjectForAgent({ projectSlug: input.projectSlug });
      return withDirective(
        MCP_TOOL_NAMES.getProject,
        { projectSlug: project.slug, projectName: project.name },
        { project },
      );
    },
  );

  server.registerTool(
    MCP_TOOL_NAMES.createTask,
    {
      title: "Create AI Kanban Task",
      description:
        "Create a new ticket. Use intakeMode inbox for drafts; strict requires full intake fields and lands in agent_ready or needs_clarification.",
      inputSchema: createTaskInputSchema,
    },
    async (input) => {
      const project = await tickets.resolveProjectForAgent({
        projectId: input.projectId,
        projectSlug: input.projectSlug,
      });

      try {
        const ticket = await tickets.createTicket({
          projectId: project.id,
          title: input.title,
          description: input.description,
          acceptanceCriteria: input.acceptanceCriteria,
          businessContext: input.businessContext,
          expectedOutcome: input.expectedOutcome,
          priority: input.priority,
          repositoryId: input.repositoryId ?? null,
          intakeMode: input.intakeMode,
          createdById: null,
        });

        const ticketKey = formatTicketKey(project.slug, ticket.number);
        return withDirective(
          MCP_TOOL_NAMES.createTask,
          {
            ticketKey,
            status: ticket.status,
            projectSlug: project.slug,
            projectName: project.name,
          },
          {
            ticket,
            ticketKey,
            project,
            readinessIssues: ticket.readinessIssues,
          },
        );
      } catch (error) {
        if (error instanceof IntakeValidationError) {
          throw new Error(`${error.message}. Use intakeMode inbox for drafts or fill all required fields.`);
        }
        throw error;
      }
    },
  );

  return server;
}
