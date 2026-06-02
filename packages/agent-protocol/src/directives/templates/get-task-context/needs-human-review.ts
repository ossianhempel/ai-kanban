import type { DirectiveTemplate } from "../../types.js";

export const needsHumanReviewGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.needs_human_review",
  phase: "human_review",
  priority: "recommended",
  title: "Human review requested",
  body: [
    "**{{ticketKey}}** needs human review. Summarize what changed and any test evidence in a comment.",
    "",
    "Do not merge or mark done unless explicitly instructed.",
  ].join("\n"),
  allowedNextTools: ["addTicketComment"],
};
