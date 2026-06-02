import type { DirectiveTemplate } from "../../types.js";

export const runningGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.running",
  phase: "resume_work",
  priority: "mandatory",
  title: "Resume in-progress work",
  body: [
    "**{{ticketKey}}** is **Running**. Continue implementation from the current branch/PR state.",
    "",
    "1. Review the brief, comments, and any linked PR.",
    "2. Finish remaining acceptance criteria.",
    "3. Update status or complete via `{{tools.completeTask}}` when finished.",
  ].join("\n"),
  allowedNextTools: [
    "createPullRequest",
    "linkPullRequest",
    "updateTaskStatus",
    "completeTask",
    "addTicketComment",
  ],
};
