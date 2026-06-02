import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, type AgentDirectiveTemplateView } from "@/lib/api";

const GROUP_LABELS: Record<string, string> = {
  get_task_context: "Read ticket (get_task_context)",
  list_tasks: "List tickets",
  claim_task: "Claim ticket",
  add_comment: "Add comment",
  update_status: "Update status",
  complete_task: "Complete task",
};

function groupLabel(group: string) {
  return GROUP_LABELS[group] ?? group;
}

type AgentDirectivesEditorProps = {
  canEdit: boolean;
  saving: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  setMessage: (value: string | null) => void;
};

export function AgentDirectivesEditor({
  canEdit,
  saving,
  setSaving,
  setError,
  setMessage,
}: AgentDirectivesEditorProps) {
  const [templates, setTemplates] = useState<AgentDirectiveTemplateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"mandatory" | "recommended">("mandatory");

  const groupedOptions = useMemo(() => {
    const groups = new Map<string, AgentDirectiveTemplateView[]>();
    for (const template of templates) {
      const items = groups.get(template.group) ?? [];
      items.push(template);
      groups.set(template.group, items);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [templates]);

  const selected = templates.find((template) => template.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { templates: rows } = await api.listAgentDirectiveTemplates();
        if (!cancelled) {
          setTemplates(rows);
          setSelectedId((current) => {
            if (current) {
              return current;
            }
            const preferred = rows.find((row) => row.id === "get_task_context.agent_ready") ?? rows[0];
            return preferred?.id ?? "";
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load agent directives");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [setError]);

  useEffect(() => {
    if (!selected) {
      return;
    }
    setTitle(selected.effective.title);
    setBody(selected.effective.body);
    setPriority(selected.effective.priority);
  }, [selected]);

  async function refreshTemplates(nextSelectedId?: string) {
    const { templates: rows } = await api.listAgentDirectiveTemplates();
    setTemplates(rows);
    if (nextSelectedId) {
      setSelectedId(nextSelectedId);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !canEdit) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateAgentDirectiveTemplate(selectedId, { title, body, priority });
      await refreshTemplates(selectedId);
      setMessage("Agent directive saved. MCP responses will use this copy immediately.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent directive");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!selectedId || !canEdit) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.resetAgentDirectiveTemplate(selectedId);
      await refreshTemplates(selectedId);
      setMessage("Directive reset to built-in default.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset agent directive");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agent workflow prompts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">Loading directives…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent workflow prompts</CardTitle>
        <CardDescription>
          Instructions injected into MCP tool responses by ticket status and action. Overrides built-in defaults from{" "}
          <code className="text-[length:var(--text-xs)]">packages/agent-protocol/src/directives/templates/</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">
            Prompt template
          </label>
          <Select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={!canEdit && false}>
            {groupedOptions.map(([group, items]) => (
              <optgroup key={group} label={groupLabel(group)}>
                {items.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.id}
                    {template.isCustomized ? " (customized)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          {selected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="muted">{selected.phase}</Badge>
              {selected.isCustomized ? <Badge tone="warning">Customized</Badge> : <Badge tone="success">Default</Badge>}
            </div>
          ) : null}
        </div>

        <form className="space-y-3" onSubmit={handleSave}>
          <div className="space-y-1.5">
            <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">Title</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} readOnly={!canEdit} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">Priority</label>
            <Select
              value={priority}
              onChange={(event) => setPriority(event.target.value as "mandatory" | "recommended")}
              disabled={!canEdit}
            >
              <option value="mandatory">Mandatory</option>
              <option value="recommended">Recommended</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">
              Instructions (markdown)
            </label>
            <Textarea
              className="min-h-56 font-mono text-[length:var(--text-sm)]"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              readOnly={!canEdit}
            />
            <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
              Placeholders: {"{{ticketKey}}"}, {"{{statusLabel}}"}, {"{{tools.claimTask}}"}, etc.
            </p>
          </div>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={saving || !selectedId}>
                {saving ? "Saving…" : "Save prompt"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={saving || !selected?.isCustomized}
                onClick={() => void handleReset()}
              >
                Reset to default
              </Button>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
