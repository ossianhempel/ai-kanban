import { MCP_TOOL_NAMES } from "@ai-kanban/agent-protocol";

export type McpPublicConfig = {
  mcpUrl: string;
  tools: string[];
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
