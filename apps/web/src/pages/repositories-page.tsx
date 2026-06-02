import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  IconArrowDoorInOutline18,
  IconRefresh2Outline18,
  IconTrashOutline18,
} from "nucleo-ui-essential-outline-18";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input, Select } from "@/components/ui/input";
import {
  api,
  type Project,
  type ProviderConnection,
  type ProviderInfo,
  type RemoteRepository,
  type Repository,
  type SourceProviderId,
} from "@/lib/api";
import { useProjectContext } from "@/lib/project-context";

const checkLabels: Record<string, string> = {
  readme: "README",
  claudeMd: "CLAUDE.md",
  agentsMd: "AGENTS.md",
  contributing: "CONTRIBUTING.md",
  packageJson: "package.json",
  gitRepo: "Git repo",
  ciConfig: "CI config",
  testSetup: "Test setup",
};

function readinessTone(score: number | null) {
  if (score === null) return "muted" as const;
  if (score >= 85) return "success" as const;
  if (score >= 60) return "warning" as const;
  return "danger" as const;
}

function providerLabel(provider: SourceProviderId | null) {
  if (provider === "github") return "GitHub";
  if (provider === "azure_devops") return "Azure DevOps";
  if (provider === "gitlab") return "GitLab";
  return "Local";
}

export function RepositoriesPage() {
  const { activeProject } = useProjectContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [oauthAvailability, setOauthAvailability] = useState({ github: false, azure_devops: false });
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [remoteRepositories, setRemoteRepositories] = useState<RemoteRepository[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [connectProvider, setConnectProvider] = useState<SourceProviderId>("github");
  const [accessToken, setAccessToken] = useState("");
  const [azureOrganization, setAzureOrganization] = useState("");
  const [selectedRemoteId, setSelectedRemoteId] = useState("");
  const [importLocalPath, setImportLocalPath] = useState("");
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const connectNotice = useMemo(() => {
    const connected = searchParams.get("connected");
    const connectError = searchParams.get("connect_error");
    if (connected) {
      return { kind: "success" as const, message: `${providerLabel(connected as SourceProviderId)} connected.` };
    }
    if (connectError) {
      return { kind: "error" as const, message: connectError };
    }
    return null;
  }, [searchParams]);

  async function refresh(projectId?: string) {
    setLoading(true);
    setError(null);
    try {
      const [{ projects: nextProjects }, { repositories: nextRepos }, { providers: nextProviders }, connectionsResult, oauthResult] =
        await Promise.all([
          api.listProjects(),
          api.listRepositories(projectId),
          api.listProviders(),
          api.listConnections().catch(() => ({ connections: [] as ProviderConnection[] })),
          api.getConnectionOAuthConfig().catch(() => ({ oauth: { github: false, azure_devops: false } })),
        ]);
      setProjects(nextProjects);
      setRepositories(nextRepos);
      setProviders(nextProviders);
      setConnections(connectionsResult.connections);
      setOauthAvailability(oauthResult.oauth);
      if (!projectId && nextProjects[0]) {
        setSelectedProjectId(nextProjects[0].id);
      }
      if (!selectedConnectionId && connectionsResult.connections[0]) {
        setSelectedConnectionId(connectionsResult.connections[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repositories");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeProject && activeProject.id !== selectedProjectId) {
      setSelectedProjectId(activeProject.id);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    void refresh(selectedProjectId || undefined);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!connectNotice) {
      return;
    }
    setBanner({ kind: connectNotice.kind, message: connectNotice.message });
    setSearchParams({}, { replace: true });
  }, [connectNotice, setSearchParams]);

  function startOAuth(provider: "github" | "azure_devops") {
    setError(null);
    const params = new URLSearchParams();
    if (provider === "azure_devops") {
      if (!azureOrganization.trim()) {
        setError("Enter your Azure DevOps organization first.");
        return;
      }
      params.set("organization", azureOrganization.trim());
    }
    const query = params.toString();
    window.location.href = `/api/connections/oauth/${provider}/start${query ? `?${query}` : ""}`;
  }

  useEffect(() => {
    if (!selectedConnectionId) {
      setRemoteRepositories([]);
      return;
    }

    void (async () => {
      try {
        const { repositories: remote } = await api.listRemoteRepositories(selectedConnectionId);
        setRemoteRepositories(remote);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load remote repositories");
      }
    })();
  }, [selectedConnectionId]);

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    if (!accessToken.trim()) return;

    setConnecting(true);
    setError(null);
    try {
      const { connection } = await api.connectProvider({
        provider: connectProvider,
        accessToken: accessToken.trim(),
        organization: connectProvider === "azure_devops" ? azureOrganization.trim() : undefined,
      });
      setAccessToken("");
      setSelectedConnectionId(connection.id);
      await refresh(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect provider");
    } finally {
      setConnecting(false);
    }
  }

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedProjectId || !selectedConnectionId || !selectedRemoteId) return;

    setImporting(true);
    setError(null);
    try {
      await api.importRepository({
        projectId: selectedProjectId,
        connectionId: selectedConnectionId,
        externalId: selectedRemoteId,
        localPath: importLocalPath.trim() || null,
      });
      setSelectedRemoteId("");
      setImportLocalPath("");
      await refresh(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import repository");
    } finally {
      setImporting(false);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !selectedProjectId) return;

    setSubmitting(true);
    setError(null);
    try {
      await api.createRepository({
        projectId: selectedProjectId,
        name: name.trim(),
        localPath: localPath.trim() || null,
        url: url.trim() || null,
      });
      setName("");
      setLocalPath("");
      setUrl("");
      await refresh(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create repository");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleScan(id: string) {
    setScanningId(id);
    setError(null);
    try {
      await api.scanRepository(id);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        await refresh(selectedProjectId);
        const updated = (await api.listRepositories(selectedProjectId)).repositories.find((repo) => repo.id === id);
        if (updated?.readinessScore !== null) {
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanningId(null);
    }
  }

  async function handleSync(id: string) {
    setSyncingId(id);
    setError(null);
    try {
      await api.syncRepository(id);
      await refresh(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteRepository(id);
      await refresh(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete repository");
    }
  }

  async function handleDeleteConnection(id: string) {
    setError(null);
    try {
      await api.deleteConnection(id);
      if (selectedConnectionId === id) {
        setSelectedConnectionId("");
      }
      await refresh(selectedProjectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove connection");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-5 py-6">
      <AppHeader
        eyebrow="Projects"
        title="Repositories"
        description="Connect source providers, import remote repos, and scan local clones for agent readiness."
        actions={
          <Link to="/">
            <Button variant="secondary" size="sm">
              <Icon icon={IconArrowDoorInOutline18} size={16} stroke="fine" />
              Back to board
            </Button>
          </Link>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Connect provider</CardTitle>
          <CardDescription>
            Sign in with GitHub or Microsoft to import repos. Use a personal access token only if OAuth is unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {banner ? (
            <p
              className={
                banner.kind === "error"
                  ? "text-[length:var(--text-sm)] text-[var(--color-danger)]"
                  : "text-[length:var(--text-sm)] text-[var(--color-success)]"
              }
            >
              {banner.message}
            </p>
          ) : null}

          {connections.length > 0 ? (
            <div className="space-y-2">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] px-3 py-2"
                >
                  <div>
                    <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">
                      {providerLabel(connection.provider)} · {connection.accountLogin}
                    </p>
                    <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">
                      {connection.accountDisplayName ?? connection.externalAccountId}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void handleDeleteConnection(connection.id)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">No provider connections yet.</p>
          )}

          <div className="space-y-3">
            {oauthAvailability.github ? (
              <Button type="button" size="sm" disabled={connecting} onClick={() => startOAuth("github")}>
                {connecting ? "Redirecting…" : "Connect with GitHub"}
              </Button>
            ) : null}

            {oauthAvailability.azure_devops ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1 space-y-1">
                  <label className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]" htmlFor="ado-org">
                    Azure DevOps organization
                  </label>
                  <Input
                    id="ado-org"
                    placeholder="your-org"
                    value={azureOrganization}
                    onChange={(event) => setAzureOrganization(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={connecting || !azureOrganization.trim()}
                  onClick={() => startOAuth("azure_devops")}
                >
                  Connect with Microsoft
                </Button>
              </div>
            ) : null}

            {!oauthAvailability.github && !oauthAvailability.azure_devops ? (
              <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
                Web sign-in is not configured. Ask your admin to set{" "}
                <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">GITHUB_OAUTH_*</code> or{" "}
                <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">MICROSOFT_*</code> env vars, or use
                a token below.
              </p>
            ) : null}
          </div>

          <details className="rounded-md border border-[var(--color-border)] px-3 py-2">
            <summary className="cursor-pointer text-[length:var(--text-sm)] text-[var(--color-text-default)]">
              Advanced: connect with personal access token
            </summary>
            <form className="mt-3 grid gap-2.5 md:grid-cols-2" onSubmit={handleConnect}>
            <Select
              value={connectProvider}
              onChange={(event) => setConnectProvider(event.target.value as SourceProviderId)}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
            </Select>
            <Input
              type="password"
              placeholder="Personal access token"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
            />
            {connectProvider === "azure_devops" ? (
              <Input
                className="md:col-span-2"
                placeholder="Azure DevOps organization"
                value={azureOrganization}
                onChange={(event) => setAzureOrganization(event.target.value)}
              />
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit" size="sm" disabled={connecting || !accessToken.trim()}>
                {connecting ? "Connecting…" : "Connect with token"}
              </Button>
            </div>
          </form>
          </details>
        </CardContent>
      </Card>

      {connections.some((connection) => connection.provider === "github") ? (
        <Card>
          <CardHeader>
            <CardTitle>GitHub webhook</CardTitle>
            <CardDescription>
              Add this webhook on each imported GitHub repo so PR events move tickets automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
            <p>
              <span className="text-[var(--color-text-default)]">Payload URL:</span>{" "}
              <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">
                {`${window.location.origin}/api/webhooks/github`}
              </code>
            </p>
            <p>
              <span className="text-[var(--color-text-default)]">Events:</span> Pull requests
            </p>
            <p>
              <span className="text-[var(--color-text-default)]">Secret:</span> set{" "}
              <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">GITHUB_WEBHOOK_SECRET</code> in
              server <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">.env</code>
            </p>
          </CardContent>
        </Card>
      ) : null}

      {connections.some((connection) => connection.provider === "azure_devops") ? (
        <Card>
          <CardHeader>
            <CardTitle>Azure DevOps service hook</CardTitle>
            <CardDescription>
              Add a service hook on each imported Azure DevOps project so PR events move tickets automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
            <p>
              <span className="text-[var(--color-text-default)]">Webhook URL:</span>{" "}
              <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5 break-all">
                {`${window.location.origin}/api/webhooks/azure-devops?token=YOUR_SECRET`}
              </code>
            </p>
            <p>
              <span className="text-[var(--color-text-default)]">Events:</span> Pull request created, updated, merged
            </p>
            <p>
              <span className="text-[var(--color-text-default)]">Token:</span> set{" "}
              <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">AZURE_DEVOPS_WEBHOOK_SECRET</code>{" "}
              in server <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">.env</code> and use the
              same value for <code className="rounded bg-[var(--color-bg-selected)] px-1 py-0.5">token=</code>
            </p>
            <p>
              In Azure DevOps: Project settings → Service hooks → Create subscription → Web Hooks → Pull request events.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {connections.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Import from provider</CardTitle>
            <CardDescription>Pull repo metadata and PR activity from your connected account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-2.5 md:grid-cols-2" onSubmit={handleImport}>
              <Select
                className="md:col-span-2"
                value={selectedConnectionId}
                onChange={(event) => setSelectedConnectionId(event.target.value)}
              >
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {providerLabel(connection.provider)} · {connection.accountLogin}
                  </option>
                ))}
              </Select>
              <Select
                className="md:col-span-2"
                value={selectedRemoteId}
                onChange={(event) => setSelectedRemoteId(event.target.value)}
              >
                <option value="">Select remote repository</option>
                {remoteRepositories.map((repo) => (
                  <option key={repo.externalId} value={repo.externalId}>
                    {repo.fullName} ({repo.visibility})
                  </option>
                ))}
              </Select>
              <Input
                className="md:col-span-2"
                placeholder="Optional local clone path for scanning"
                value={importLocalPath}
                onChange={(event) => setImportLocalPath(event.target.value)}
              />
              <div className="md:col-span-2">
                <Button type="submit" size="sm" disabled={importing || !selectedRemoteId}>
                  {importing ? "Importing…" : "Import repository"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add local repository</CardTitle>
          <CardDescription>Manual entry when you only have a filesystem path, no provider connection.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2.5 md:grid-cols-2" onSubmit={handleCreate}>
            <Select
              className="md:col-span-2"
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
            <Input placeholder="Repository name" value={name} onChange={(event) => setName(event.target.value)} />
            <Input placeholder="Git URL (optional)" value={url} onChange={(event) => setUrl(event.target.value)} />
            <Input
              className="md:col-span-2"
              placeholder="Local path (e.g. /Users/you/Developer/my-repo)"
              value={localPath}
              onChange={(event) => setLocalPath(event.target.value)}
            />
            <div className="md:col-span-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Adding…" : "Add repository"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error ? <p className="text-[length:var(--text-sm)] text-[var(--color-danger)]">{error}</p> : null}
      {loading ? <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">Loading repositories…</p> : null}

      <div className="grid gap-3">
        {repositories.map((repo) => (
          <Card key={repo.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{repo.fullName ?? repo.name}</CardTitle>
                  <CardDescription>
                    {repo.project.name} · {providerLabel(repo.provider)}
                    {repo.visibility ? ` · ${repo.visibility}` : ""}
                  </CardDescription>
                </div>
                <Badge tone={readinessTone(repo.readinessScore)}>
                  {repo.readinessScore !== null ? `${repo.readinessScore}%` : "Not scanned"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
                {repo.url ? <p>URL: {repo.url}</p> : null}
                {repo.localPath ? <p>Path: {repo.localPath}</p> : null}
                {repo.defaultBranch ? <p>Default branch: {repo.defaultBranch}</p> : null}
                {repo.lastSyncedAt ? (
                  <p>Last synced: {new Date(repo.lastSyncedAt).toLocaleString()}</p>
                ) : null}
              </div>

              {repo.activitySnapshot ? (
                <div className="space-y-2 rounded-md border border-[var(--color-border)] p-3">
                  <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-strong)]">
                    Open pull requests ({repo.activitySnapshot.openPullRequests.length})
                  </p>
                  {repo.activitySnapshot.openPullRequests.length === 0 ? (
                    <p className="text-[length:var(--text-xs)] text-[var(--color-text-subtle)]">No open PRs</p>
                  ) : (
                    <ul className="space-y-1">
                      {repo.activitySnapshot.openPullRequests.slice(0, 5).map((pr) => (
                        <li key={pr.externalId} className="text-[length:var(--text-sm)]">
                          <a
                            href={pr.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--color-text-default)] underline-offset-2 hover:underline"
                          >
                            #{pr.number} {pr.title}
                          </a>
                          <span className="text-[var(--color-text-subtle)]"> · {pr.headBranch}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {repo.readinessReport ? (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(repo.readinessReport.checks).map(([key, passed]) => (
                      <Badge key={key} tone={passed ? "success" : "muted"}>
                        {checkLabels[key] ?? key}
                      </Badge>
                    ))}
                  </div>
                  {repo.readinessReport.recommendations.length > 0 ? (
                    <ul className="space-y-0.5 text-[length:var(--text-sm)] text-[var(--color-warning)]">
                      {repo.readinessReport.recommendations.map((item) => (
                        <li key={item}>• {item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[length:var(--text-sm)] text-[var(--color-success)]">Repository looks agent-ready.</p>
                  )}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {repo.connectionId ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={syncingId === repo.id}
                    onClick={() => void handleSync(repo.id)}
                  >
                    <Icon icon={IconRefresh2Outline18} size={16} stroke="fine" />
                    {syncingId === repo.id ? "Syncing…" : "Sync activity"}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!repo.localPath || scanningId === repo.id}
                  onClick={() => void handleScan(repo.id)}
                >
                  <Icon icon={IconRefresh2Outline18} size={16} stroke="fine" />
                  {scanningId === repo.id ? "Scanning…" : "Scan readiness"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void handleDelete(repo.id)}>
                  <Icon icon={IconTrashOutline18} size={16} stroke="fine" />
                  Remove
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {!loading && repositories.length === 0 ? (
          <p className="text-[length:var(--text-sm)] text-[var(--color-text-subtle)]">
            No repositories yet. Connect a provider or add a local path.
          </p>
        ) : null}
      </div>
    </div>
  );
}
