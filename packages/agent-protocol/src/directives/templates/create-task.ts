import type { DirectiveTemplate } from "../types.js";

export const createTaskDefault: DirectiveTemplate = {
  id: "create_task.default",
  phase: "status_updated",
  priority: "recommended",
  title: "Task created",
  body: [
    "Ticket **{{ticketKey}}** was created in **{{statusLabel}}**.",
    "",
    "Next steps:",
    "- `inbox` / `needs_clarification`: wait for human intake or call `{{tools.addTicketComment}}` with missing details.",
    "- `agent_ready`: call `{{tools.getTaskContext}}` before claiming (pre-execution review).",
    "- To pick it up yourself: `{{tools.claimTask}}` after review passes.",
  ].join("\n"),
};
