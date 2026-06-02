import type { DirectiveTemplate } from "../types.js";

export const getProjectDefault: DirectiveTemplate = {
  id: "get_project.default",
  phase: "list_default",
  priority: "recommended",
  title: "Project context",
  body: [
    "You are scoped to project **{{projectSlug}}** (`{{projectName}}`).",
    "",
    "Use this slug on every tool call:",
    "- `{{tools.listTasks}}` with `projectSlug: \"{{projectSlug}}\"`",
    "- `{{tools.createTask}}` with `projectSlug: \"{{projectSlug}}\"`",
    "",
    "Ticket keys look like `{{projectSlug}}-123`. Call `{{tools.getTaskContext}}` before claiming.",
  ].join("\n"),
};
