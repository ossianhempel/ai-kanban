import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowDoorInOutline18, IconPlusOutline18, IconTrashOutline18 } from "nucleo-ui-essential-outline-18";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, type KnowledgeRef, type Project } from "@/lib/api";

function DocLinksEditor({
  title,
  description,
  scope,
  projectId,
  refs,
  onChanged,
}: {
  title: string;
  description: string;
  scope: KnowledgeRef["scope"];
  projectId?: string;
  refs: KnowledgeRef[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createKnowledgeRef({
        scope,
        projectId,
        label: label.trim(),
        url: url.trim(),
      });
      setLabel("");
      setUrl("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add doc link");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.deleteKnowledgeRef(id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove doc link");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {refs.length > 0 ? (
          <ul className="space-y-2">
            {refs.map((ref) => (
              <li
                key={ref.id}
                className="flex items-start justify-between gap-2 rounded-md border border-[var(--color-border)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">{ref.label}</p>
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-[length:var(--text-xs)] text-[var(--color-text-subtle)] underline-offset-2 hover:underline"
                  >
                    {ref.url}
                  </a>
                </div>
                <Button variant="ghost" size="sm" disabled={saving} onClick={() => void handleDelete(ref.id)}>
                  <Icon icon={IconTrashOutline18} size={16} stroke="fine" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">No linked docs yet.</p>
        )}

        <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleAdd}>
          <Input placeholder="Label (e.g. Repo map)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="https://notion.so/..." value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" size="sm" disabled={saving || !label.trim() || !url.trim()}>
            <Icon icon={IconPlusOutline18} size={16} stroke="fine" />
            Add
          </Button>
        </form>
        {error ? <p className="text-[length:var(--text-sm)] text-[var(--color-danger)]">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [agentPlaybook, setAgentPlaybook] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [instanceRefs, setInstanceRefs] = useState<KnowledgeRef[]>([]);
  const [projectRefs, setProjectRefs] = useState<KnowledgeRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshRefs(projectId: string) {
    const [{ refs: nextInstanceRefs }, { refs: nextProjectRefs }] = await Promise.all([
      api.listKnowledgeRefs({ scope: "instance" }),
      projectId ? api.listKnowledgeRefs({ scope: "project", projectId }) : Promise.resolve({ refs: [] }),
    ]);
    setInstanceRefs(nextInstanceRefs);
    setProjectRefs(nextProjectRefs);
  }

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [{ settings }, { projects: nextProjects }] = await Promise.all([
          api.getInstanceSettings(),
          api.listProjects(),
        ]);
        setAgentPlaybook(settings.agentPlaybook);
        setProjects(nextProjects);
        const projectId = nextProjects[0]?.id ?? "";
        setSelectedProjectId(projectId);
        setProjectContext(nextProjects[0]?.agentContext ?? "");
        await refreshRefs(projectId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  useEffect(() => {
    const project = projects.find((item) => item.id === selectedProjectId);
    setProjectContext(project?.agentContext ?? "");
    if (selectedProjectId) {
      void refreshRefs(selectedProjectId);
    }
  }, [selectedProjectId, projects]);

  async function handleSavePlaybook(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateInstanceSettings({ agentPlaybook });
      setMessage("Instance guide saved. New agent briefs will include it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save instance guide");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProjectContext(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProjectId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { project } = await api.updateProjectAgentContext(selectedProjectId, projectContext);
      setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
      setMessage("Project context saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project context");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-5 py-6">
      <AppHeader
        eyebrow="Team context"
        title="Agent settings"
        description="Shared guides and doc links injected into every agent brief on this instance."
        actions={
          <Link to="/">
            <Button variant="secondary" size="sm">
              <Icon icon={IconArrowDoorInOutline18} size={16} stroke="fine" />
              Back to board
            </Button>
          </Link>
        }
      />

      {loading ? <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">Loading…</p> : null}
      {error ? <p className="text-[length:var(--text-sm)] text-[var(--color-danger)]">{error}</p> : null}
      {message ? <p className="text-[length:var(--text-sm)] text-[var(--color-success)]">{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Instance agent guide</CardTitle>
          <CardDescription>
            Team-wide playbook — repo map, architecture, norms. Prepended to every agent brief.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSavePlaybook}>
            <Textarea
              className="min-h-48 font-mono"
              placeholder={"Example:\n\nWe use api/, web/, mobile/.\napi/ owns billing. web/ consumes api/.\nADO org: acme. Default branch: main."}
              value={agentPlaybook}
              onChange={(event) => setAgentPlaybook(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save instance guide"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DocLinksEditor
        title="Instance doc links"
        description="Shared links attached to every ticket (Notion, Confluence, etc.). Label + URL for now; auto-fetch comes later."
        scope="instance"
        refs={instanceRefs}
        onChanged={() => void refreshRefs(selectedProjectId)}
      />

      <Card>
        <CardHeader>
          <CardTitle>Project context</CardTitle>
          <CardDescription>Extra shared context for tickets in a specific project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <form className="space-y-3" onSubmit={handleSaveProjectContext}>
            <Textarea
              className="min-h-32 font-mono"
              placeholder="Squad-specific context, release rules, on-call notes…"
              value={projectContext}
              onChange={(event) => setProjectContext(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={saving || !selectedProjectId}>
              {saving ? "Saving…" : "Save project context"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {selectedProjectId ? (
        <DocLinksEditor
          title="Project doc links"
          description="Default documentation for all tickets in the selected project."
          scope="project"
          projectId={selectedProjectId}
          refs={projectRefs}
          onChanged={() => void refreshRefs(selectedProjectId)}
        />
      ) : null}
    </div>
  );
}
