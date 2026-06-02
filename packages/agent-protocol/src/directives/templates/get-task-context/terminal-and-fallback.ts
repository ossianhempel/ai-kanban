import type { DirectiveTemplate } from "../../types.js";

export const terminalGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.terminal",
  phase: "read_only",
  priority: "mandatory",
  title: "Ticket is {{statusLabel}}",
  body: "**{{ticketKey}}** is **{{statusLabel}}**. No further agent work is expected unless a human moves it to an active column.",
  blockedUntilComplete: ["claimTask"],
};

export const fallbackGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.fallback",
  phase: "read_only",
  priority: "recommended",
  title: "Ticket in {{statusLabel}}",
  body: "You are reading **{{ticketKey}}** in **{{statusLabel}}**. Follow human direction before taking action.",
};
