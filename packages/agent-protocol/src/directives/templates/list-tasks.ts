import type { DirectiveTemplate } from "../types.js";

export const listAgentReady: DirectiveTemplate = {
  id: "list_tasks.agent_ready",
  phase: "list_agent_ready",
  priority: "recommended",
  title: "Agent Ready queue",
  body: [
    "These tickets are ready for agent pickup.",
    "",
    "For each ticket you intend to work:",
    "1. Call `{{tools.getTaskContext}}` first — follow the mandatory review directive.",
    "2. Only call `{{tools.claimTask}}` after the review passes.",
    "3. Work one ticket at a time unless explicitly instructed otherwise.",
  ].join("\n"),
};

export const listReadyForPlanning: DirectiveTemplate = {
  id: "list_tasks.ready_for_planning",
  phase: "list_default",
  priority: "recommended",
  title: "Ready for Planning queue",
  body: [
    "These tickets need planning review before execution.",
    "",
    "Call `{{tools.getTaskContext}}` on a ticket and follow the planning review directive.",
  ].join("\n"),
};

export const listDefault: DirectiveTemplate = {
  id: "list_tasks.default",
  phase: "list_default",
  priority: "recommended",
  title: "Ticket list",
  body: "Call `{{tools.getTaskContext}}` before acting on any ticket.",
};

export const listFiltered: DirectiveTemplate = {
  id: "list_tasks.filtered",
  phase: "list_default",
  priority: "recommended",
  title: "Ticket list",
  body: "Tickets filtered to **{{filterStatusLabel}}**. Call `{{tools.getTaskContext}}` before acting on any ticket.",
};
