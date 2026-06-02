import { MCP_WRITE_TOOL_SET } from "@ai-kanban/agent-protocol";
import { isValidApiToken } from "../api-token";
import { env } from "@ai-kanban/env/server";

type JsonRpcBody = {
  method?: string;
  params?: {
    name?: string;
  };
};

export function mcpRequestRequiresWriteAuth(body: unknown): boolean {
  if (!env.AIKANBAN_API_TOKEN) {
    return false;
  }

  if (typeof body !== "object" || body === null) {
    return false;
  }

  const rpc = body as JsonRpcBody;
  if (rpc.method !== "tools/call") {
    return false;
  }

  const toolName = rpc.params?.name;
  return typeof toolName === "string" && MCP_WRITE_TOOL_SET.has(toolName);
}

export function assertMcpWriteAuthorized(authorization: string | undefined): void {
  if (!isValidApiToken(authorization)) {
    throw new Error("MCP write tools require a valid AIKANBAN_API_TOKEN Bearer token");
  }
}
