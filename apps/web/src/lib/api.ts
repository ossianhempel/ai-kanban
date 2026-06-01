export type AgentBrief = {
  task: string;
  context: string;
  relevantDocumentation: string[];
  relevantFiles: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  testCommands: string[];
  definitionOfDone: string[];
  forbiddenChanges: string[];
};

export type TicketStatus =
  | "inbox"
  | "needs_clarification"
  | "ready_for_planning"
  | "agent_ready"
  | "running"
  | "pr_open"
  | "needs_human_review"
  | "done"
  | "blocked";

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  agentContext: string;
};

export type InstanceSettings = {
  id: string;
  agentPlaybook: string;
};

export type SignupPolicy = {
  enabled: boolean;
  mode: "bootstrap" | "open" | "allowlist" | "closed";
  hint: string | null;
};

export type AuthProvider = {
  id: "microsoft" | "github" | "google";
  label: string;
  kind: "oauth";
};

export type AuthConfig = {
  signup: SignupPolicy;
  providers: AuthProvider[];
  emailPassword: boolean;
};

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  createdAt: string;
};

export type KnowledgeRef = {
  id: string;
  scope: "instance" | "project" | "ticket";
  projectId: string | null;
  ticketId: string | null;
  label: string;
  url: string;
  resolvedContent: string | null;
  sortOrder: number;
};

export type SourceProviderId = "github" | "azure_devops" | "gitlab";

export type ProviderInfo = {
  id: SourceProviderId;
  displayName: string;
};

export type ProviderConnection = {
  id: string;
  provider: SourceProviderId;
  accountLogin: string;
  accountDisplayName: string | null;
  externalAccountId: string;
  createdAt: string;
  updatedAt: string;
};

export type RemoteRepository = {
  externalId: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  htmlUrl: string;
  visibility: "public" | "private" | "internal";
  description?: string | null;
};

export type RemotePullRequest = {
  externalId: string;
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  headBranch: string;
  baseBranch: string;
  isDraft: boolean;
  createdAt: string;
};

export type RepositoryActivity = {
  fetchedAt: string;
  defaultBranch: string;
  openPullRequests: RemotePullRequest[];
  recentPullRequests: RemotePullRequest[];
};

export type Repository = {
  id: string;
  projectId: string;
  connectionId: string | null;
  provider: SourceProviderId | null;
  externalId: string | null;
  owner: string | null;
  repoName: string | null;
  fullName: string | null;
  visibility: string | null;
  name: string;
  url: string | null;
  localPath: string | null;
  defaultBranch: string;
  readinessScore: number | null;
  readinessReport: RepositoryScanReport | null;
  activitySnapshot: RepositoryActivity | null;
  lastSyncedAt: string | null;
  project: Project;
};

export type RepositoryScanReport = {
  score: number;
  recommendations: string[];
  checks: Record<string, boolean>;
};

export type Ticket = {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description: string;
  acceptanceCriteria: string;
  businessContext: string;
  expectedOutcome: string;
  status: TicketStatus;
  priority: "low" | "medium" | "high" | "urgent";
  repositoryId: string | null;
  branchName: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  pullRequestState: string | null;
  readinessScore: number | null;
  readinessIssues: string[];
  ticketKey: string;
  project: Project;
};

export type TicketContext = {
  ticket: Ticket & { agentBrief?: AgentBrief | null };
  project: Project;
  repository: Omit<Repository, "project"> | null;
  ticketKey: string;
  brief: AgentBrief;
};

const baseUrl = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const body = await response.text();
    if (!body.trim()) {
      throw new Error(
        response.status >= 500
          ? "Server error — is the API running? Try `pnpm dev` from the project root."
          : `Request failed (${response.status})`,
      );
    }
    try {
      const parsed = JSON.parse(body) as { error?: string; issues?: string[] };
      if (parsed.issues?.length) {
        throw new Error(`${parsed.error ?? "Request failed"}: ${parsed.issues.join(", ")}`);
      }
      if (parsed.error) {
        throw new Error(parsed.error);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== body) {
        throw error;
      }
    }
    throw new Error(body || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  getAuthConfig: () => request<AuthConfig>("/api/auth/config"),
  listProjects: () => request<{ projects: Project[] }>("/api/projects"),
  createProject: (input: { name: string; slug: string; description?: string }) =>
    request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  listTickets: (params?: { projectSlug?: string; status?: TicketStatus }) => {
    const search = new URLSearchParams();
    if (params?.projectSlug) search.set("projectSlug", params.projectSlug);
    if (params?.status) search.set("status", params.status);
    const query = search.toString();
    return request<{ tickets: Ticket[] }>(`/api/tickets${query ? `?${query}` : ""}`);
  },
  getTicket: (ref: string) => request<TicketContext>(`/api/tickets/${encodeURIComponent(ref)}`),
  createTicket: (input: {
    projectId: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
    businessContext?: string;
    expectedOutcome?: string;
    repositoryId?: string | null;
  }) =>
    request<{ ticket: Ticket }>("/api/tickets", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateTicket: (
    ref: string,
    input: {
      title?: string;
      description?: string;
      acceptanceCriteria?: string;
      businessContext?: string;
      expectedOutcome?: string;
      repositoryId?: string | null;
    },
  ) =>
    request<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(ref)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  updateTicketStatus: (ref: string, status: TicketStatus) =>
    request<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(ref)}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  claimTicket: (ref: string, agentId = "human") =>
    request<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(ref)}/claim`, {
      method: "POST",
      body: JSON.stringify({ agentId }),
    }),
  listRepositories: (projectId?: string) => {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
    return request<{ repositories: Repository[] }>(`/api/repositories${query}`);
  },
  createRepository: (input: {
    projectId: string;
    name: string;
    url?: string | null;
    localPath?: string | null;
    defaultBranch?: string;
  }) =>
    request<{ repository: Repository }>("/api/repositories", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateRepository: (
    id: string,
    input: {
      name?: string;
      url?: string | null;
      localPath?: string | null;
      defaultBranch?: string;
    },
  ) =>
    request<{ repository: Repository }>(`/api/repositories/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteRepository: (id: string) =>
    request<{ repository: Repository }>(`/api/repositories/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  scanRepository: (id: string) =>
    request<{ repository: Repository; message: string }>(
      `/api/repositories/${encodeURIComponent(id)}/scan`,
      { method: "POST" },
    ),
  listProviders: () => request<{ providers: ProviderInfo[] }>("/api/providers"),
  listConnections: () => request<{ connections: ProviderConnection[] }>("/api/connections"),
  connectProvider: (input: {
    provider: SourceProviderId;
    accessToken: string;
    organization?: string;
  }) =>
    request<{ connection: ProviderConnection }>("/api/connections", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteConnection: (id: string) =>
    request<{ connection: ProviderConnection }>(`/api/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  listRemoteRepositories: (connectionId: string) =>
    request<{ repositories: RemoteRepository[] }>(
      `/api/connections/${encodeURIComponent(connectionId)}/repositories`,
    ),
  importRepository: (input: {
    projectId: string;
    connectionId: string;
    externalId: string;
    localPath?: string | null;
  }) =>
    request<{ repository: Repository }>("/api/repositories/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getRepositoryActivity: (id: string, refresh = false) =>
    request<{ activity: RepositoryActivity }>(
      `/api/repositories/${encodeURIComponent(id)}/activity${refresh ? "?refresh=true" : ""}`,
    ),
  syncRepository: (id: string) =>
    request<{ repository: Repository; activity: RepositoryActivity }>(
      `/api/repositories/${encodeURIComponent(id)}/sync`,
      { method: "POST" },
    ),
  linkPullRequest: (ref: string, input: { url: string; branchName?: string }) =>
    request<{ ticket: Ticket }>(`/api/tickets/${encodeURIComponent(ref)}/link-pull-request`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  createPullRequest: (
    ref: string,
    input: { headBranch: string; title?: string; body?: string; baseBranch?: string; draft?: boolean },
  ) =>
    request<{ ticket: Ticket; pullRequest: RemotePullRequest }>(
      `/api/tickets/${encodeURIComponent(ref)}/create-pull-request`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  getInstanceSettings: () => request<{ settings: InstanceSettings }>("/api/instance/settings"),
  updateInstanceSettings: (input: { agentPlaybook: string }) =>
    request<{ settings: InstanceSettings }>("/api/instance/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  listUsers: () => request<{ users: UserSummary[] }>("/api/users"),
  updateUserRole: (userId: string, role: "admin" | "member") =>
    request<{ user: UserSummary }>(`/api/users/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  listKnowledgeRefs: (params: {
    scope: KnowledgeRef["scope"];
    projectId?: string;
    ticketId?: string;
  }) => {
    const search = new URLSearchParams({ scope: params.scope });
    if (params.projectId) search.set("projectId", params.projectId);
    if (params.ticketId) search.set("ticketId", params.ticketId);
    return request<{ refs: KnowledgeRef[] }>(`/api/knowledge-refs?${search.toString()}`);
  },
  createKnowledgeRef: (input: {
    scope: KnowledgeRef["scope"];
    projectId?: string;
    ticketId?: string;
    label: string;
    url: string;
  }) =>
    request<{ ref: KnowledgeRef }>("/api/knowledge-refs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  deleteKnowledgeRef: (id: string) =>
    request<{ ref: KnowledgeRef }>(`/api/knowledge-refs/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  updateProjectAgentContext: (projectId: string, agentContext: string) =>
    request<{ project: Project }>(`/api/projects/${encodeURIComponent(projectId)}/agent-context`, {
      method: "PATCH",
      body: JSON.stringify({ agentContext }),
    }),
};
