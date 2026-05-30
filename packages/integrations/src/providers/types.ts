import { z } from "zod";

export const sourceProviderIdSchema = z.enum(["github", "azure_devops", "gitlab"]);
export type SourceProviderId = z.infer<typeof sourceProviderIdSchema>;

export const providerCredentialsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("github_pat"),
    accessToken: z.string().min(1),
  }),
  z.object({
    kind: z.literal("azure_devops_pat"),
    organization: z.string().min(1),
    accessToken: z.string().min(1),
  }),
  z.object({
    kind: z.literal("gitlab_pat"),
    accessToken: z.string().min(1),
    baseUrl: z.string().url().optional(),
  }),
]);

export type ProviderCredentials = z.infer<typeof providerCredentialsSchema>;

export type ProviderAccount = {
  externalAccountId: string;
  login: string;
  displayName: string;
  avatarUrl?: string | null;
};

export type RemoteRepository = {
  externalId: string;
  fullName: string;
  owner: string;
  name: string;
  project?: string | null;
  defaultBranch: string;
  htmlUrl: string;
  visibility: "public" | "private" | "internal";
  description?: string | null;
};

export type RemoteRepositoryRef = Pick<
  RemoteRepository,
  "externalId" | "owner" | "name" | "fullName" | "defaultBranch" | "project"
>;

export type PullRequestState = "open" | "closed" | "merged";

export type RemotePullRequest = {
  externalId: string;
  number: number;
  title: string;
  url: string;
  state: PullRequestState;
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

export type CreatePullRequestInput = {
  title: string;
  body: string;
  headBranch: string;
  baseBranch?: string;
  draft?: boolean;
};

export type LinkPullRequestInput = {
  url: string;
  branchName?: string;
};

export class ProviderNotConfiguredError extends Error {
  constructor(provider: SourceProviderId) {
    super(`Source provider "${provider}" is not configured yet.`);
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderRequestError extends Error {
  readonly status: number;

  constructor(provider: SourceProviderId, message: string, status: number) {
    super(`[${provider}] ${message}`);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

export interface SourceProviderAdapter {
  id: SourceProviderId;
  displayName: string;
  validateConnection(credentials: ProviderCredentials): Promise<ProviderAccount>;
  listRepositories(credentials: ProviderCredentials): Promise<RemoteRepository[]>;
  getRepository(credentials: ProviderCredentials, externalId: string): Promise<RemoteRepository>;
  getActivity(credentials: ProviderCredentials, repo: RemoteRepositoryRef): Promise<RepositoryActivity>;
  createPullRequest(
    credentials: ProviderCredentials,
    repo: RemoteRepositoryRef,
    input: CreatePullRequestInput,
  ): Promise<RemotePullRequest>;
  getPullRequest(
    credentials: ProviderCredentials,
    repo: RemoteRepositoryRef,
    pullRequestNumber: number,
  ): Promise<RemotePullRequest>;
  parsePullRequestUrl(
    url: string,
  ): { owner: string; name: string; number: number; project?: string } | null;
}
