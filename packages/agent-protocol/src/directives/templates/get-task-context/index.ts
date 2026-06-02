import type { TicketStatus } from "../../../status.js";
import type { DirectiveTemplate } from "../../types.js";
import { agentReadyGetTaskContext } from "./agent-ready.js";
import { fallbackGetTaskContext, terminalGetTaskContext } from "./terminal-and-fallback.js";
import { inboxGetTaskContext } from "./inbox.js";
import { needsClarificationGetTaskContext } from "./needs-clarification.js";
import { needsHumanReviewGetTaskContext } from "./needs-human-review.js";
import { prOpenGetTaskContext } from "./pr-open.js";
import { readyForPlanningGetTaskContext } from "./ready-for-planning.js";
import { runningGetTaskContext } from "./running.js";

/** One template per kanban column — edit the matching file to change agent prompts. */
export const GET_TASK_CONTEXT_BY_STATUS: Partial<Record<TicketStatus, DirectiveTemplate>> = {
  inbox: inboxGetTaskContext,
  needs_clarification: needsClarificationGetTaskContext,
  ready_for_planning: readyForPlanningGetTaskContext,
  agent_ready: agentReadyGetTaskContext,
  running: runningGetTaskContext,
  pr_open: prOpenGetTaskContext,
  needs_human_review: needsHumanReviewGetTaskContext,
  done: { ...terminalGetTaskContext, id: "get_task_context.done" },
  blocked: { ...terminalGetTaskContext, id: "get_task_context.blocked" },
};

export function getTaskContextTemplate(status: TicketStatus): DirectiveTemplate {
  return GET_TASK_CONTEXT_BY_STATUS[status] ?? fallbackGetTaskContext;
}

export {
  agentReadyGetTaskContext,
  readyForPlanningGetTaskContext,
  runningGetTaskContext,
  needsClarificationGetTaskContext,
  prOpenGetTaskContext,
  needsHumanReviewGetTaskContext,
  inboxGetTaskContext,
  terminalGetTaskContext,
  fallbackGetTaskContext,
};
