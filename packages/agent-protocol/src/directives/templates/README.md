# Agent directive templates

Each kanban status and MCP action has its own prompt file. Edit the matching file to change what agents are told — no need to touch resolver logic.

## Layout

```
templates/
  get-task-context/     ← prompts when agent calls aikanban_get_task_context
    agent-ready.ts        Agent Ready column (pre-execution review)
    ready-for-planning.ts
    running.ts
    …
  list-tasks.ts         ← aikanban_list_tasks
  claim-task.ts         ← aikanban_claim_task
  add-comment.ts        ← aikanban_add_ticket_comment
  update-status.ts      ← aikanban_update_task_status
  complete-task.ts      ← aikanban_complete_task
  catalog.ts            ← registry (auto-built; add new templates here)
```

## Template shape

```typescript
export const myTemplate: DirectiveTemplate = {
  id: "get_task_context.agent_ready",  // stable id for admin overrides
  phase: "pre_execution_review",
  priority: "mandatory",
  title: "Short title shown in MCP output",
  body: "Markdown instructions with {{placeholders}}",
  allowedNextTools: ["claimTask", "addTicketComment"],  // optional shorthand keys
  blockedUntilComplete: ["claimTask"],                  // optional
};
```

## Placeholders

| Token | Value |
|-------|--------|
| `{{ticketKey}}` | e.g. `D-4` |
| `{{statusLabel}}` | e.g. `Agent Ready` |
| `{{filterStatusLabel}}` | list_tasks filter column |
| `{{nextStatusLabel}}` | after status update |
| `{{tools.claimTask}}` | full MCP name, e.g. `aikanban_claim_task` |

## Adding a new template

1. Create or edit a file under `templates/`.
2. Register it in `templates/catalog.ts` (and `get-task-context/index.ts` if status-based).
3. Wire selection in `resolve.ts` if it is a new trigger path.

## Future: admin UI overrides

`resolveAgentDirective(..., { templateOverrides })` merges instance-level `{ title?, body?, priority? }` patches by template id without replacing the whole registry.
