import type { DirectiveTemplate } from "../types.js";

export const completeTaskDefault: DirectiveTemplate = {
  id: "complete_task.default",
  phase: "task_completed",
  priority: "recommended",
  title: "Task completed",
  body: "**{{ticketKey}}** is marked done. No further agent work expected.",
};

export const completeTaskNoKey: DirectiveTemplate = {
  id: "complete_task.no_ticket_key",
  phase: "task_completed",
  priority: "recommended",
  title: "Task completed",
  body: "Task marked done.",
};
