import { MCP_TOOL_NAMES } from "@ai-kanban/agent-protocol";

export type McpPublicConfig = {
  mcpUrl: string;
  tools: string[];
  multiProject: {
    workflow: string[];
    hint: string;
  };
  auth: {
    type: "bearer";
    header: "Authorization";
    envVar: "AIKANBAN_API_TOKEN";
    configured: boolean;
    required: boolean;
  };
  clients: {
    cursor: Record<string, unknown>;
    claudeDesktop: Record<string, unknown>;
  };
};

export function buildMcpPublicConfig(input: {
  webOrigin: string;
  apiTokenConfigured: boolean;
  requireApiToken?: boolean;
}): McpPublicConfig {
  const mcpUrl = `${input.webOrigin.replace(/\/$/, "")}/mcp`;
  const tools = Object.values(MCP_TOOL_NAMES);
  const useAuth = input.apiTokenConfigured || Boolean(input.requireApiToken);

  const serverEntry: Record<string, unknown> = {
    url: mcpUrl,
  };

  if (useAuth) {
    serverEntry.headers = {
      Authorization: "Bearer YOUR_AIKANBAN_API_TOKEN",
    };
  }

  return {
    mcpUrl,
    tools,
    multiProject: {
      workflow: [
        MCP_TOOL_NAMES.listProjects,
        MCP_TOOL_NAMES.getProject,
        `${MCP_TOOL_NAMES.listTasks} (projectSlug)`,
        `${MCP_TOOL_NAMES.createTask} (projectSlug)`,
      ],
      hint:
        "When multiple projects exist, call list_projects, then get_project with a slug, and pass projectSlug on list_tasks and create_task. Set a default project in Agent settings to omit projectSlug.",
    },
    auth: {
      type: "bearer",
      header: "Authorization",
      envVar: "AIKANBAN_API_TOKEN",
      configured: input.apiTokenConfigured,
      required: Boolean(input.requireApiToken),
    },
    clients: {
      cursor: {
        mcpServers: {
          "ai-kanban": serverEntry,
        },
      },
      claudeDesktop: {
        mcpServers: {
          "ai-kanban": serverEntry,
        },
      },
    },
  };
}
