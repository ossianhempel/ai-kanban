import type { DirectiveTemplate } from "../../types.js";

export const agentReadyGetTaskContext: DirectiveTemplate = {
  id: "get_task_context.agent_ready",
  phase: "pre_execution_review",
  priority: "mandatory",
  title: "Pre-execution review required",
  body: [
    "You are reading **{{ticketKey}}** in **Agent Ready**. Do **not** call `{{tools.claimTask}}` or modify code yet.",
    "",
    "1. Review the brief: description, acceptance criteria, business context, repository path, and linked documentation.",
    "2. Decide whether the context is sufficient to implement confidently.",
    "3. If anything is missing, ambiguous, or risky:",
    "   - Call `{{tools.addTicketComment}}` with a clear explanation of what is needed (use kind `clarification_request`).",
    "   - Call `{{tools.updateTaskStatus}}` with status `needs_clarification`.",
    "   - Stop. Do not claim this ticket.",
    "4. If context is sufficient:",
    "   - Call `{{tools.claimTask}}` with your agent id.",
    "   - Then implement per the brief.",
  ].join("\n"),
  allowedNextTools: ["addTicketComment", "updateTaskStatus", "claimTask"],
  blockedUntilComplete: ["claimTask"],
};
