import type { DirectiveTemplate } from "../types.js";

export const listProjectsDefault: DirectiveTemplate = {
  id: "list_projects.default",
  phase: "list_default",
  priority: "recommended",
  title: "Projects on this instance",
  body: [
    "This instance has multiple kanban projects. Each project has its own board, repos, and ticket key prefix.",
    "",
    "1. Pick a `slug` from the list (or use `defaultProjectSlug` when set).",
    "2. Call `{{tools.getProject}}` with that slug to load project context.",
    "3. Pass `projectSlug` on **every** `{{tools.listTasks}}` and `{{tools.createTask}}` call.",
    "",
    "Do not mix tickets across projects in one agent run unless explicitly asked.",
  ].join("\n"),
};
