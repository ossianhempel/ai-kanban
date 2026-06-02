import type { DirectiveTemplate } from "../types.js";

export const claimTaskExecution: DirectiveTemplate = {
  id: "claim_task.execution",
  phase: "execution",
  priority: "mandatory",
  title: "Execute task",
  body: [
    "You claimed **{{ticketKey}}**. Implement the work described in the brief.",
    "",
    "1. Work in the repository path from the brief (clone first if no local path is set).",
    "2. Follow acceptance criteria and project conventions.",
    "3. Run relevant tests before opening a PR.",
    "4. Open or link a PR with `{{tools.createPullRequest}}` or `{{tools.linkPullRequest}}`.",
    "5. Mark complete with `{{tools.completeTask}}` when done, or update status if blocked.",
  ].join("\n"),
  allowedNextTools: [
    "createPullRequest",
    "linkPullRequest",
    "updateTaskStatus",
    "completeTask",
    "addTicketComment",
  ],
};
