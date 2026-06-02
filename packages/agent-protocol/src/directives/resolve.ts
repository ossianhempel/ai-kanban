import { MCP_TOOL_NAMES } from "../tools.js";
import type { McpToolName } from "../tools.js";
import type { TicketStatus } from "../status.js";
import { buildRenderContext, renderDirectiveTemplate } from "./render.js";
import type {
  AgentDirective,
  DirectiveContext,
  DirectiveTemplate,
  DirectiveTemplateOverrides,
} from "./types.js";
import {
  addCommentClarification,
  addCommentDefault,
  addCommentPlanningHint,
  claimTaskExecution,
  completeTaskDefault,
  completeTaskNoKey,
  createTaskDefault,
  listProjectsDefault,
  getTaskContextTemplate,
  listAgentReady,
  listDefault,
  listFiltered,
  listReadyForPlanning,
  updateStatusAgentReady,
  updateStatusDefault,
  updateStatusNeedsClarification,
  updateStatusRunning,
} from "./templates/catalog.js";

function applyTemplateOverrides(
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

function render(
  template: DirectiveTemplate,
  context: DirectiveContext,
  overrides?: DirectiveTemplateOverrides,
): AgentDirective {
  const merged = applyTemplateOverrides(template, overrides);
  return renderDirectiveTemplate(merged, buildRenderContext(context));
}

function resolveListTasksTemplate(filterStatus?: TicketStatus): DirectiveTemplate {
  if (filterStatus === "agent_ready") {
    return listAgentReady;
  }
  if (filterStatus === "ready_for_planning") {
    return listReadyForPlanning;
  }
  if (filterStatus) {
    return listFiltered;
  }
  return listDefault;
}

function resolveAddCommentTemplate(
  commentKind: string | undefined,
  status: TicketStatus | undefined,
): DirectiveTemplate {
  if (commentKind === "clarification_request") {
    return addCommentClarification;
  }
  if (status === "agent_ready" || status === "ready_for_planning") {
    return addCommentPlanningHint;
  }
  return addCommentDefault;
}

function resolveUpdateStatusTemplate(nextStatus: TicketStatus): DirectiveTemplate {
  switch (nextStatus) {
    case "needs_clarification":
      return updateStatusNeedsClarification;
    case "agent_ready":
      return updateStatusAgentReady;
    case "running":
      return updateStatusRunning;
    default:
      return updateStatusDefault;
  }
}

export type ResolveAgentDirectiveOptions = {
  /** Instance- or project-level prompt overrides (future admin UI). Keys are template ids. */
  templateOverrides?: DirectiveTemplateOverrides;
};

export function resolveAgentDirective(
  tool: McpToolName,
  context: DirectiveContext,
  options?: ResolveAgentDirectiveOptions,
): AgentDirective | null {
  const overrides = options?.templateOverrides;

  switch (tool) {
    case MCP_TOOL_NAMES.getTaskContext:
      if (!context.status || !context.ticketKey) {
        return null;
      }
      return render(getTaskContextTemplate(context.status), context, overrides);

    case MCP_TOOL_NAMES.listTasks:
      return render(resolveListTasksTemplate(context.filterStatus), context, overrides);

    case MCP_TOOL_NAMES.claimTask:
      if (!context.ticketKey) {
        return null;
      }
      return render(claimTaskExecution, context, overrides);

    case MCP_TOOL_NAMES.addTicketComment:
      return render(
        resolveAddCommentTemplate(context.commentKind, context.status),
        context,
        overrides,
      );

    case MCP_TOOL_NAMES.updateTaskStatus:
      if (!context.nextStatus || !context.ticketKey) {
        return null;
      }
      return render(resolveUpdateStatusTemplate(context.nextStatus), context, overrides);

    case MCP_TOOL_NAMES.completeTask:
      return render(
        context.ticketKey ? completeTaskDefault : completeTaskNoKey,
        context,
        overrides,
      );

    case MCP_TOOL_NAMES.createTask:
      if (!context.ticketKey || !context.status) {
        return null;
      }
      return render(createTaskDefault, context, overrides);

    case MCP_TOOL_NAMES.listProjects:
      return render(listProjectsDefault, context, overrides);

    default:
      return null;
  }
}
