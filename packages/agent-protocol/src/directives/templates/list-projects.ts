import type { DirectiveTemplate } from "../types.js";

export const listProjectsDefault: DirectiveTemplate = {
  id: "list_projects.default",
  phase: "list_default",
  priority: "recommended",
  title: "Projects on this instance",
  body: [
    "Use the project `slug` when calling `{{tools.createTask}}`.",
    "",
    "Then call `{{tools.listTasks}}` or `{{tools.createTask}}` as needed.",
  ].join("\n"),
};
