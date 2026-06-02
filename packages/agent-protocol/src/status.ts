import { z } from "zod";

export const ticketStatusSchema = z.enum([
  "inbox",
  "needs_clarification",
  "ready_for_planning",
  "agent_ready",
  "running",
  "pr_open",
  "needs_human_review",
  "done",
  "blocked",
]);

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
