import type { AgentDirective } from "@ai-kanban/agent-protocol";
import { formatAgentDirectiveMarkdown } from "@ai-kanban/agent-protocol";

export function buildMcpToolResult<T extends Record<string, unknown>>(
  payload: T,
  directive: AgentDirective | null,
) {
  const structuredContent = directive ? { agentDirective: directive, ...payload } : payload;

  if (!directive) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  }

  return {
    content: [
      { type: "text" as const, text: formatAgentDirectiveMarkdown(directive) },
      { type: "text" as const, text: JSON.stringify(structuredContent, null, 2) },
    ],
    structuredContent,
  };
}
