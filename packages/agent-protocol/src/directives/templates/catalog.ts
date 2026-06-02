import type { DirectiveTemplate } from "../types.js";
import {
  addCommentClarification,
  addCommentDefault,
  addCommentPlanningHint,
} from "./add-comment.js";
import { claimTaskExecution } from "./claim-task.js";
import { completeTaskDefault, completeTaskNoKey } from "./complete-task.js";
import { createTaskDefault } from "./create-task.js";
import {
  GET_TASK_CONTEXT_BY_STATUS,
  fallbackGetTaskContext,
  getTaskContextTemplate,
} from "./get-task-context/index.js";
import {
  listAgentReady,
  listDefault,
  listFiltered,
  listReadyForPlanning,
} from "./list-tasks.js";
import { listProjectsDefault } from "./list-projects.js";
import {
  updateStatusAgentReady,
  updateStatusDefault,
  updateStatusNeedsClarification,
  updateStatusRunning,
} from "./update-status.js";

function registerTemplates(...templates: DirectiveTemplate[]): Record<string, DirectiveTemplate> {
  const catalog: Record<string, DirectiveTemplate> = {};
  for (const template of templates) {
    catalog[template.id] = template;
  }
  return catalog;
}

/** Flat registry of every built-in template — useful for admin UI / docs generation. */
export const DIRECTIVE_TEMPLATE_CATALOG: Record<string, DirectiveTemplate> = registerTemplates(
  ...Object.values(GET_TASK_CONTEXT_BY_STATUS).filter(Boolean) as DirectiveTemplate[],
  fallbackGetTaskContext,
  listAgentReady,
  listReadyForPlanning,
  listDefault,
  listFiltered,
  claimTaskExecution,
  addCommentClarification,
  addCommentPlanningHint,
  addCommentDefault,
  updateStatusNeedsClarification,
  updateStatusAgentReady,
  updateStatusRunning,
  updateStatusDefault,
  completeTaskDefault,
  completeTaskNoKey,
  createTaskDefault,
  listProjectsDefault,
);

export function listDirectiveTemplateIds(): string[] {
  return Object.keys(DIRECTIVE_TEMPLATE_CATALOG).sort();
}

export function getDirectiveTemplateById(id: string): DirectiveTemplate | undefined {
  return DIRECTIVE_TEMPLATE_CATALOG[id];
}

export {
  getTaskContextTemplate,
  claimTaskExecution,
  createTaskDefault,
  listProjectsDefault,
  listAgentReady,
  listReadyForPlanning,
  listDefault,
  listFiltered,
  addCommentClarification,
  addCommentPlanningHint,
  addCommentDefault,
  updateStatusNeedsClarification,
  updateStatusAgentReady,
  updateStatusRunning,
  updateStatusDefault,
  completeTaskDefault,
  completeTaskNoKey,
};
