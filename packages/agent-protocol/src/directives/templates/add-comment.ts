import type { DirectiveTemplate } from "../types.js";

export const addCommentClarification: DirectiveTemplate = {
  id: "add_comment.clarification_request",
  phase: "comment_added",
  priority: "recommended",
  title: "Comment added",
  body: [
    "Comment saved.",
    "",
    "If you have not already, move the ticket to `needs_clarification` with `{{tools.updateTaskStatus}}` and stop work on this ticket.",
  ].join("\n"),
  allowedNextTools: ["updateTaskStatus"],
};

export const addCommentPlanningHint: DirectiveTemplate = {
  id: "add_comment.planning_hint",
  phase: "comment_added",
  priority: "recommended",
  title: "Comment added",
  body: [
    "Comment saved.",
    "",
    "If this comment requests clarification, move the ticket to `needs_clarification` when appropriate.",
  ].join("\n"),
  allowedNextTools: ["updateTaskStatus"],
};

export const addCommentDefault: DirectiveTemplate = {
  id: "add_comment.default",
  phase: "comment_added",
  priority: "recommended",
  title: "Comment added",
  body: "Comment saved on the ticket.",
};
