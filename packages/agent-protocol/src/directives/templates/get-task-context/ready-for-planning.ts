import type { DirectiveTemplate } from "../../types.js";

export const readyForPlanningGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.ready_for_planning",
  phase: "planning_review",
  priority: "mandatory",
  title: "Planning review required",
  body: [
    "You are reading **{{ticketKey}}** in **Ready for Planning**. Do **not** claim the ticket or write code.",
    "",
    "1. Review the brief and identify approach, risks, dependencies, and missing information.",
    "2. Post your planning notes with `{{tools.addTicketComment}}`.",
    "3. If information is missing:",
    "   - Use kind `clarification_request` and move the ticket to `needs_clarification` via `{{tools.updateTaskStatus}}`.",
    "4. If the ticket is ready for implementation:",
    "   - Move it to `agent_ready` via `{{tools.updateTaskStatus}}` (do not claim yet).",
  ].join("\n"),
  allowedNextTools: ["addTicketComment", "updateTaskStatus"],
  blockedUntilComplete: ["claimTask"],
};
