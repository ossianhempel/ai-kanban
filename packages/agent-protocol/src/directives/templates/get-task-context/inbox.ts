import type { DirectiveTemplate } from "../../types.js";

export const inboxGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.inbox",
  phase: "read_only",
  priority: "mandatory",
  title: "Inbox draft — not agent-ready",
  body: [
    "**{{ticketKey}}** is still in **Inbox**. Intake is incomplete.",
    "",
    "Do not claim or implement. Ask a human to complete intake or promote the ticket.",
  ].join("\n"),
  blockedUntilComplete: ["claimTask"],
};
