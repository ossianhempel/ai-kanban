import type { DirectiveTemplate } from "../../types.js";

export const needsClarificationGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.needs_clarification",
  phase: "read_only",
  priority: "mandatory",
  title: "Awaiting human clarification",
  body: [
    "**{{ticketKey}}** is in **Needs Clarification**. A human must respond before work continues.",
    "",
    "Do not claim or implement. You may read comments and add notes with `{{tools.addTicketComment}}` if asked.",
  ].join("\n"),
  blockedUntilComplete: ["claimTask"],
};
