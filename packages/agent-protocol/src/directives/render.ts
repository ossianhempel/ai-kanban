import { MCP_TOOL_NAMES } from "../tools.js";
import type { McpToolName } from "../tools.js";
import { statusLabel } from "./labels.js";
import type {
  AgentDirective,
  DirectiveRenderContext,
  DirectiveTemplate,
  DirectiveTemplateOverrides,
  DirectiveToolKey,
} from "./types.js";
import type { TicketStatus } from "../status.js";

function resolveToolKeys(keys: DirectiveToolKey[] | undefined): McpToolName[] | undefined {
  if (!keys?.length) {
    return undefined;
  }
  return keys.map((key) => MCP_TOOL_NAMES[key]);
}

function interpolateBody(body: string, context: DirectiveRenderContext): string {
  return body.replace(/\{\{(\w+(?:\.\w+)?)\}\}/g, (_match, key: string) => {
    if (key.startsWith("tools.")) {
      const toolKey = key.slice("tools.".length) as DirectiveToolKey;
      return context.tools[toolKey] ?? key;
    }
    switch (key) {
      case "ticketKey":
        return context.ticketKey ?? "";
      case "statusLabel":
        return context.statusLabel ?? "";
      case "filterStatusLabel":
        return context.filterStatusLabel ?? "";
      case "nextStatusLabel":
        return context.nextStatusLabel ?? "";
      case "projectSlug":
        return context.projectSlug ?? "";
      case "projectName":
        return context.projectName ?? "";
      default:
        return `{{${key}}}`;
    }
  });
}

export function mergeDirectiveTemplate(
  template: DirectiveTemplate,
  overrides: DirectiveTemplateOverrides | undefined,
): DirectiveTemplate {
  if (!overrides) {
    return template;
  }
  const patch = overrides[template.id];
  if (!patch) {
    return template;
  }
  return {
    ...template,
    ...patch,
    id: template.id,
    phase: template.phase,
  };
}

export function buildRenderContext(input: {
  ticketKey?: string;
  status?: TicketStatus;
  filterStatus?: TicketStatus;
  nextStatus?: TicketStatus;
  commentKind?: string;
  projectSlug?: string;
  projectName?: string;
}): DirectiveRenderContext {
  return {
    ticketKey: input.ticketKey,
    status: input.status,
    statusLabel: input.status ? statusLabel(input.status) : undefined,
    filterStatus: input.filterStatus,
    filterStatusLabel: input.filterStatus ? statusLabel(input.filterStatus) : undefined,
    nextStatus: input.nextStatus,
    nextStatusLabel: input.nextStatus ? statusLabel(input.nextStatus) : undefined,
    commentKind: input.commentKind,
    projectSlug: input.projectSlug,
    projectName: input.projectName,
    tools: { ...MCP_TOOL_NAMES },
  };
}

export function renderDirectiveTemplate(
  template: DirectiveTemplate,
  context: DirectiveRenderContext,
): AgentDirective {
  return {
    phase: template.phase,
    priority: template.priority,
    title: template.title,
    instructions: interpolateBody(template.body, context),
    allowedNextTools: resolveToolKeys(template.allowedNextTools),
    blockedUntilComplete: resolveToolKeys(template.blockedUntilComplete),
    templateId: template.id,
  };
}
