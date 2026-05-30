import { Buffer } from "node:buffer";
import {
  ProviderRequestError,
  type CreatePullRequestInput,
  type ProviderAccount,
  type ProviderCredentials,
  type RemotePullRequest,
  type RemoteRepository,
  type RemoteRepositoryRef,
  type RepositoryActivity,
  type SourceProviderAdapter,
} from "./types.js";

const API_VERSION = "7.1";

type AzureCredentials = Extract<ProviderCredentials, { kind: "azure_devops_pat" }>;

type AzureProfile = {
  id: string;
  displayName: string;
  emailAddress?: string;
};

type AzureGitRepository = {
  id: string;
  name: string;
  url: string;
  webUrl: string;
  defaultBranch?: string;
  project: { id: string; name: string };
  isDisabled?: boolean;
};

type AzurePullRequest = {
  pullRequestId: number;
  title: string;
  description?: string;
  status: "active" | "completed" | "abandoned";
  mergeStatus?: "succeeded" | "conflicts" | "failure" | "queued" | "rejectedByPolicy" | null;
  sourceRefName: string;
  targetRefName: string;
  creationDate: string;
  url: string;
  isDraft?: boolean;
};

function assertAzureCredentials(credentials: ProviderCredentials): AzureCredentials {
  if (credentials.kind !== "azure_devops_pat") {
    throw new Error("Expected Azure DevOps credentials");
  }
  return credentials;
}

function azureBaseUrl(organization: string) {
  return `https://dev.azure.com/${encodeURIComponent(organization)}`;
}

function authHeader(accessToken: string) {
  return `Basic ${Buffer.from(`:${accessToken}`).toString("base64")}`;
}

function stripRefsHeads(ref: string) {
  return ref.replace(/^refs\/heads\//, "");
}

function ensureRefsHeads(branch: string) {
  return branch.startsWith("refs/heads/") ? branch : `refs/heads/${branch}`;
}

function parseAzureProject(fullName: string) {
  const slashIndex = fullName.indexOf("/");
  if (slashIndex === -1) {
    return { project: "", repoName: fullName };
  }
  return {
    project: fullName.slice(0, slashIndex),
    repoName: fullName.slice(slashIndex + 1),
  };
}

function resolveAzureRepoContext(
  credentials: ProviderCredentials,
  repo: RemoteRepositoryRef,
) {
  const azure = assertAzureCredentials(credentials);
  const organization = repo.owner || azure.organization;
  const parsed = parseAzureProject(repo.fullName);
  const project = repo.project ?? parsed.project;

  if (!project) {
    throw new Error("Azure DevOps repository is missing project metadata");
  }

  return {
    organization,
    project,
    repositoryId: repo.externalId,
    repoName: repo.name,
  };
}

async function azureRequest<T>(
  organization: string,
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${azureBaseUrl(organization)}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: authHeader(accessToken),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderRequestError("azure_devops", body || response.statusText, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function mapRepo(organization: string, repo: AzureGitRepository): RemoteRepository {
  const defaultBranch = repo.defaultBranch ? stripRefsHeads(repo.defaultBranch) : "main";

  return {
    externalId: repo.id,
    fullName: `${repo.project.name}/${repo.name}`,
    owner: organization,
    name: repo.name,
    project: repo.project.name,
    defaultBranch,
    htmlUrl: repo.webUrl,
    visibility: "private",
    description: null,
  };
}

function mapPullRequest(pr: AzurePullRequest): RemotePullRequest {
  const merged = pr.status === "completed" && pr.mergeStatus === "succeeded";
  const state = merged ? "merged" : pr.status === "active" ? "open" : "closed";

  return {
    externalId: String(pr.pullRequestId),
    number: pr.pullRequestId,
    title: pr.title,
    url: pr.url,
    state,
    headBranch: stripRefsHeads(pr.sourceRefName),
    baseBranch: stripRefsHeads(pr.targetRefName),
    isDraft: pr.isDraft ?? false,
    createdAt: pr.creationDate,
  };
}

export const azureDevOpsProvider: SourceProviderAdapter = {
  id: "azure_devops",
  displayName: "Azure DevOps",

  async validateConnection(credentials: ProviderCredentials): Promise<ProviderAccount> {
    const azure = assertAzureCredentials(credentials);
    const profile = await fetch(
      `https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=${API_VERSION}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: authHeader(azure.accessToken),
        },
      },
    );

    if (!profile.ok) {
      const body = await profile.text();
      throw new ProviderRequestError("azure_devops", body || profile.statusText, profile.status);
    }

    const data = (await profile.json()) as AzureProfile;
    await azureRequest<{ count?: number }>(
      azure.organization,
      `/_apis/projects?$top=1&api-version=${API_VERSION}`,
      azure.accessToken,
    );

    return {
      externalAccountId: data.id,
      login: data.emailAddress ?? data.displayName,
      displayName: data.displayName,
      avatarUrl: null,
    };
  },

  async listRepositories(credentials: ProviderCredentials): Promise<RemoteRepository[]> {
    const azure = assertAzureCredentials(credentials);
    const response = await azureRequest<{ value: AzureGitRepository[] }>(
      azure.organization,
      `/_apis/git/repositories?api-version=${API_VERSION}`,
      azure.accessToken,
    );

    return response.value.filter((repo) => !repo.isDisabled).map((repo) => mapRepo(azure.organization, repo));
  },

  async getRepository(credentials: ProviderCredentials, externalId: string): Promise<RemoteRepository> {
    const azure = assertAzureCredentials(credentials);
    const repo = await azureRequest<AzureGitRepository>(
      azure.organization,
      `/_apis/git/repositories/${externalId}?api-version=${API_VERSION}`,
      azure.accessToken,
    );
    return mapRepo(azure.organization, repo);
  },

  async getActivity(credentials: ProviderCredentials, repo: RemoteRepositoryRef): Promise<RepositoryActivity> {
    const azure = assertAzureCredentials(credentials);
    const context = resolveAzureRepoContext(credentials, repo);
    const basePath = `/${encodeURIComponent(context.project)}/_apis/git/repositories/${context.repositoryId}/pullrequests`;

    const [openResponse, recentResponse] = await Promise.all([
      azureRequest<{ value: AzurePullRequest[] }>(
        context.organization,
        `${basePath}?searchCriteria.status=active&$top=20&api-version=${API_VERSION}`,
        azure.accessToken,
      ),
      azureRequest<{ value: AzurePullRequest[] }>(
        context.organization,
        `${basePath}?searchCriteria.status=all&$top=10&api-version=${API_VERSION}`,
        azure.accessToken,
      ),
    ]);

    return {
      fetchedAt: new Date().toISOString(),
      defaultBranch: repo.defaultBranch,
      openPullRequests: openResponse.value.map(mapPullRequest),
      recentPullRequests: recentResponse.value.map(mapPullRequest),
    };
  },

  async createPullRequest(
    credentials: ProviderCredentials,
    repo: RemoteRepositoryRef,
    input: CreatePullRequestInput,
  ): Promise<RemotePullRequest> {
    const azure = assertAzureCredentials(credentials);
    const context = resolveAzureRepoContext(credentials, repo);
    const pr = await azureRequest<AzurePullRequest>(
      context.organization,
      `/${encodeURIComponent(context.project)}/_apis/git/repositories/${context.repositoryId}/pullrequests?api-version=${API_VERSION}`,
      azure.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          description: input.body,
          sourceRefName: ensureRefsHeads(input.headBranch),
          targetRefName: ensureRefsHeads(input.baseBranch ?? repo.defaultBranch),
          isDraft: input.draft ?? false,
        }),
      },
    );

    return mapPullRequest(pr);
  },

  async getPullRequest(
    credentials: ProviderCredentials,
    repo: RemoteRepositoryRef,
    pullRequestNumber: number,
  ): Promise<RemotePullRequest> {
    const azure = assertAzureCredentials(credentials);
    const context = resolveAzureRepoContext(credentials, repo);
    const pr = await azureRequest<AzurePullRequest>(
      context.organization,
      `/${encodeURIComponent(context.project)}/_apis/git/repositories/${context.repositoryId}/pullrequests/${pullRequestNumber}?api-version=${API_VERSION}`,
      azure.accessToken,
    );
    return mapPullRequest(pr);
  },

  parsePullRequestUrl(url: string) {
    const match =
      /^https?:\/\/(?:dev\.azure\.com\/([^/]+)|([^/.]+)\.visualstudio\.com)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i.exec(
        url.trim(),
      );

    if (!match) {
      return null;
    }

    return {
      owner: match[1] ?? match[2]!,
      project: match[3]!,
      name: match[4]!,
      number: Number(match[5]),
    };
  },
};
