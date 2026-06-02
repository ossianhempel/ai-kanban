import type { TicketStatus } from "../status.js";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  inbox: "Inbox",
  needs_clarification: "Needs Clarification",
  ready_for_planning: "Ready for Planning",
  agent_ready: "Agent Ready",
  running: "Running",
  pr_open: "PR Open",
  needs_human_review: "Needs Human Review",
  done: "Done",
  blocked: "Blocked",
};

export function statusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status];
}
