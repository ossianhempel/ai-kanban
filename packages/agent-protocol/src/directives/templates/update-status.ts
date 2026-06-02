import type { DirectiveTemplate } from "../types.js";
import { claimTaskExecution } from "./claim-task.js";

export const updateStatusNeedsClarification: DirectiveTemplate = {
  id: "update_status.needs_clarification",
  phase: "status_updated",
  priority: "recommended",
  title: "Moved to Needs Clarification",
  body: [
    "**{{ticketKey}}** is now awaiting human input.",
    "",
    "Stop agent work on this ticket until a human updates it and moves it back to an active column.",
  ].join("\n"),
};

export const updateStatusAgentReady: DirectiveTemplate = {
  id: "update_status.agent_ready",
  phase: "status_updated",
  priority: "recommended",
  title: "Moved to Agent Ready",
  body: [
    "**{{ticketKey}}** is ready for an execution agent.",
    "",
    "Another agent (or a later run) should call `{{tools.getTaskContext}}` and complete the pre-execution review before claiming.",
  ].join("\n"),
};

export const updateStatusDefault: DirectiveTemplate = {
  id: "update_status.default",
  phase: "status_updated",
  priority: "recommended",
  title: "Status updated to {{nextStatusLabel}}",
  body: "**{{ticketKey}}** is now **{{nextStatusLabel}}**.",
};

/** Re-use execution prompt when status moves to running. */
export const updateStatusRunning = {
  ...claimTaskExecution,
  id: "update_status.running",
  phase: "status_updated" as const,
};
