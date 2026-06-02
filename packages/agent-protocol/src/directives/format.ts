import type { AgentDirective } from "./types.js";

export function formatAgentDirectiveMarkdown(directive: AgentDirective): string {
  const lines = [
    `## AI Kanban — ${directive.title}`,
    "",
    `**Phase:** \`${directive.phase}\` · **Priority:** ${directive.priority}`,
  ];

  if (directive.templateId) {
    lines.push(`**Template:** \`${directive.templateId}\``);
  }

  lines.push("", directive.instructions);

  if (directive.blockedUntilComplete?.length) {
    lines.push(
      "",
      `**Blocked until review complete:** ${directive.blockedUntilComplete.map((tool) => `\`${tool}\``).join(", ")}`,
    );
  }

  if (directive.allowedNextTools?.length) {
    lines.push(
      "",
      `**Suggested next tools:** ${directive.allowedNextTools.map((tool) => `\`${tool}\``).join(", ")}`,
    );
  }

  lines.push("", "---");
  return lines.join("\n");
}
