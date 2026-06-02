import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconArrowDoorInOutline18, IconPlusOutline18, IconTrashOutline18 } from "nucleo-ui-essential-outline-18";
import { AppHeader } from "@/components/app-header";
import { AgentDirectivesEditor } from "@/components/agent-directives-editor";
import { AgentIntegrationCard } from "@/components/agent-integration-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input, Select, Textarea } from "@/components/ui/input";
import { api, type KnowledgeRef, type Project, type SignupPolicySettings, type UserSummary } from "@/lib/api";
import { useSession, type SessionUser } from "@/lib/auth-client";

function DocLinksEditor({
  title,
  description,
  scope,
  projectId,
  refs,
  onChanged,
  readOnly = false,
}: {
  title: string;
  description: string;
  scope: KnowledgeRef["scope"];
  projectId?: string;
  refs: KnowledgeRef[];
  onChanged: () => void;
  readOnly?: boolean;
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
                {!readOnly ? (
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => void handleDelete(ref.id)}>
                    <Icon icon={IconTrashOutline18} size={16} stroke="fine" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">No linked docs yet.</p>
        )}

        {!readOnly ? (
          <form className="grid gap-2 md:grid-cols-[1fr_1fr_auto]" onSubmit={handleAdd}>
            <Input placeholder="Label (e.g. Repo map)" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Input placeholder="https://notion.so/..." value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button type="submit" size="sm" disabled={saving || !label.trim() || !url.trim()}>
              <Icon icon={IconPlusOutline18} size={16} stroke="fine" />
              Add
            </Button>
          </form>
        ) : null}
        {error ? <p className="text-[length:var(--text-sm)] text-[var(--color-danger)]">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function SignupAccessEditor({
  settings,
  onChanged,
  saving,
  setSaving,
  setError,
  setMessage,
}: {
  settings: SignupPolicySettings;
  onChanged: () => void;
  saving: boolean;
  setSaving: (value: boolean) => void;
  setError: (value: string | null) => void;
  setMessage: (value: string | null) => void;
}) {
  const [allowlistKind, setAllowlistKind] = useState<"email" | "domain">("email");
  const [allowlistValue, setAllowlistValue] = useState("");

  async function handleTogglePublicSignup(allowPublicSignup: boolean) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.updateSignupPolicy({ allowPublicSignup });
      onChanged();
      setMessage(allowPublicSignup ? "Open sign-up enabled." : "Open sign-up disabled.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update sign-up policy");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddAllowlist(event: React.FormEvent) {
    event.preventDefault();
    if (!allowlistValue.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.addSignupAllowlistEntry({ kind: allowlistKind, value: allowlistValue.trim() });
      setAllowlistValue("");
      onChanged();
      setMessage("Allowlist entry added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add allowlist entry");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveAllowlist(id: string) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.removeSignupAllowlistEntry(id);
      onChanged();
      setMessage("Allowlist entry removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove allowlist entry");
    } finally {
      setSaving(false);
    }
  }

  const envEmails = settings.envFallback.allowedEmails;
  const envDomains = settings.envFallback.allowedDomains;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-up access</CardTitle>
        <CardDescription>
          Control who can create accounts. Applies to email/password and SSO first-time sign-in. Current mode:{" "}
          <strong>{settings.policy.mode}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.policy.hint ? (
          <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">{settings.policy.hint}</p>
        ) : null}

        <label className="flex items-center gap-2 text-[length:var(--text-sm)] text-[var(--color-text-default)]">
          <input
            type="checkbox"
            checked={settings.allowPublicSignup}
            disabled={saving}
            onChange={(event) => void handleTogglePublicSignup(event.target.checked)}
          />
          Allow anyone to sign up (open registration)
        </label>

        <div className="space-y-2">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">Allowlist</p>
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
            When open sign-up is off, only these emails or domains can join. Env vars still apply as a fallback.
          </p>
          {settings.allowlist.length > 0 ? (
            <ul className="space-y-2">
              {settings.allowlist.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] px-3 py-2"
                >
                  <div>
                    <p className="text-[length:var(--text-sm)] text-[var(--color-text-strong)]">{entry.value}</p>
                    <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">{entry.kind}</p>
                  </div>
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => void handleRemoveAllowlist(entry.id)}>
                    <Icon icon={IconTrashOutline18} size={16} stroke="fine" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">No allowlist entries yet.</p>
          )}

          {(envEmails.length > 0 || envDomains.length > 0) && (
            <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
              Also allowed via server env:{" "}
              {[...envEmails, ...envDomains.map((domain) => `@${domain}`)].join(", ")}
            </p>
          )}

          <form className="flex flex-wrap items-end gap-2" onSubmit={handleAddAllowlist}>
            <Select value={allowlistKind} onChange={(event) => setAllowlistKind(event.target.value as "email" | "domain")}>
              <option value="email">Email</option>
              <option value="domain">Domain</option>
            </Select>
            <Input
              className="min-w-[220px] flex-1"
              placeholder={allowlistKind === "email" ? "colleague@company.com" : "company.com"}
              value={allowlistValue}
              onChange={(event) => setAllowlistValue(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={saving || !allowlistValue.trim()}>
              <Icon icon={IconPlusOutline18} size={16} stroke="fine" />
              Add
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { data: session } = useSession();
  const canEdit = (session?.user as SessionUser | undefined)?.role === "admin";
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [agentPlaybook, setAgentPlaybook] = useState("");
  const [projectContext, setProjectContext] = useState("");
  const [instanceRefs, setInstanceRefs] = useState<KnowledgeRef[]>([]);
  const [projectRefs, setProjectRefs] = useState<KnowledgeRef[]>([]);
  const [members, setMembers] = useState<UserSummary[]>([]);
  const [signupPolicy, setSignupPolicy] = useState<SignupPolicySettings | null>(null);
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
    if (!canEdit) {
      setMembers([]);
      setSignupPolicy(null);
      return;
    }

    void api.listUsers().then(({ users }) => setMembers(users)).catch(() => setMembers([]));
    void api.getSignupPolicySettings().then(setSignupPolicy).catch(() => setSignupPolicy(null));
  }, [canEdit]);

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

  async function handleRoleChange(userId: string, role: "admin" | "member") {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { user } = await api.updateUserRole(userId, role);
      setMembers((current) => current.map((member) => (member.id === user.id ? user : member)));
      setMessage(`${user.email} is now ${role === "admin" ? "an admin" : "a member"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member role");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-5 py-6">
      <AppHeader
        eyebrow="Team context"
        title="Agent settings"
        description="Team context for briefs, sign-up access, member roles, and MCP connection details for your agents."
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
      {!canEdit && !loading ? (
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
          View only — instance admins can edit team context. The first account on this installation is admin.
        </p>
      ) : null}

      <AgentIntegrationCard />

      <AgentDirectivesEditor
        canEdit={canEdit}
        saving={saving}
        setSaving={setSaving}
        setError={setError}
        setMessage={setMessage}
      />

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
              readOnly={!canEdit}
            />
            {canEdit ? (
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save instance guide"}
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <DocLinksEditor
        title="Instance doc links"
        description="Shared links attached to every ticket (Notion, Confluence, etc.). Label + URL for now; auto-fetch comes later."
        scope="instance"
        refs={instanceRefs}
        onChanged={() => void refreshRefs(selectedProjectId)}
        readOnly={!canEdit}
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
              readOnly={!canEdit}
            />
            {canEdit ? (
              <Button type="submit" size="sm" disabled={saving || !selectedProjectId}>
                {saving ? "Saving…" : "Save project context"}
              </Button>
            ) : null}
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
          readOnly={!canEdit}
        />
      ) : null}

      {canEdit && signupPolicy ? (
        <SignupAccessEditor
          settings={signupPolicy}
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          setMessage={setMessage}
          onChanged={() => {
            void api.getSignupPolicySettings().then(setSignupPolicy).catch(() => setSignupPolicy(null));
          }}
        />
      ) : null}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Instance admins can edit team context and manage roles. At least one admin must remain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">No members yet.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((member) => (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">
                        {member.name || member.email}
                      </p>
                      <p className="truncate text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                        {member.email}
                      </p>
                    </div>
                    <Select
                      value={member.role}
                      disabled={saving}
                      onChange={(event) =>
                        void handleRoleChange(member.id, event.target.value as "admin" | "member")
                      }
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
