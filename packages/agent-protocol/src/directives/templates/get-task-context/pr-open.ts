import type { DirectiveTemplate } from "../../types.js";

export const prOpenGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.pr_open",
  phase: "pr_hygiene",
  priority: "recommended",
  title: "PR open — monitor and support review",
  body: [
    "**{{ticketKey}}** has an open PR. Ensure the PR description references the ticket key and acceptance criteria.",
    "",
    "Address review feedback if requested. Do not expand scope unless the ticket is moved back to Running.",
  ].join("\n"),
};
