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

const GITHUB_API = "https://api.github.com";

type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
};

type GitHubRepo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  html_url: string;
  private: boolean;
  visibility?: "public" | "private" | "internal";
  description: string | null;
};

type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  head: { ref: string };
  base: { ref: string };
  merged_at: string | null;
  created_at: string;
};

function assertGitHubCredentials(credentials: ProviderCredentials) {
  if (credentials.kind !== "github_pat") {
    throw new Error("Expected GitHub credentials");
  }
  return credentials;
}

async function githubRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ProviderRequestError("github", body || response.statusText, response.status);
  }

  return (await response.json()) as T;
}

function mapRepo(repo: GitHubRepo): RemoteRepository {
  return {
    externalId: String(repo.id),
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    defaultBranch: repo.default_branch || "main",
    htmlUrl: repo.html_url,
    visibility: repo.visibility ?? (repo.private ? "private" : "public"),
    description: repo.description,
  };
}

function mapPullRequest(pr: GitHubPullRequest): RemotePullRequest {
  const state = pr.merged_at ? "merged" : pr.state === "open" ? "open" : "closed";
  return {
    externalId: String(pr.id),
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    state,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    isDraft: pr.draft,
    createdAt: pr.created_at,
  };
}

export const githubProvider: SourceProviderAdapter = {
  id: "github",
  displayName: "GitHub",

  async validateConnection(credentials: ProviderCredentials): Promise<ProviderAccount> {
    const github = assertGitHubCredentials(credentials);
    const user = await githubRequest<GitHubUser>("/user", github.accessToken);
    return {
      externalAccountId: String(user.id),
      login: user.login,
      displayName: user.name ?? user.login,
      avatarUrl: user.avatar_url,
    };
  },

  async listRepositories(credentials: ProviderCredentials): Promise<RemoteRepository[]> {
    const github = assertGitHubCredentials(credentials);
    const repos: RemoteRepository[] = [];
    let page = 1;

    while (page <= 5) {
      const batch = await githubRequest<GitHubRepo[]>(
        `/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page=${page}&sort=updated`,
        github.accessToken,
      );
      repos.push(...batch.map(mapRepo));
      if (batch.length < 100) {
        break;
      }
      page += 1;
    }

    return repos;
  },

  async getRepository(credentials: ProviderCredentials, externalId: string): Promise<RemoteRepository> {
    const github = assertGitHubCredentials(credentials);
    const repo = await githubRequest<GitHubRepo>(`/repositories/${externalId}`, github.accessToken);
    return mapRepo(repo);
  },

  async getActivity(credentials: ProviderCredentials, repo: RemoteRepositoryRef): Promise<RepositoryActivity> {
    const github = assertGitHubCredentials(credentials);
    const [openPullRequests, recentPullRequests] = await Promise.all([
      githubRequest<GitHubPullRequest[]>(
        `/repos/${repo.owner}/${repo.name}/pulls?state=open&per_page=20`,
        github.accessToken,
      ),
      githubRequest<GitHubPullRequest[]>(
        `/repos/${repo.owner}/${repo.name}/pulls?state=all&per_page=10&sort=updated&direction=desc`,
        github.accessToken,
      ),
    ]);

    return {
      fetchedAt: new Date().toISOString(),
      defaultBranch: repo.defaultBranch,
      openPullRequests: openPullRequests.map(mapPullRequest),
      recentPullRequests: recentPullRequests.map(mapPullRequest),
    };
  },

  async createPullRequest(
    credentials: ProviderCredentials,
    repo: RemoteRepositoryRef,
    input: CreatePullRequestInput,
  ): Promise<RemotePullRequest> {
    const github = assertGitHubCredentials(credentials);
    const pr = await githubRequest<GitHubPullRequest>(
      `/repos/${repo.owner}/${repo.name}/pulls`,
      github.accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          head: input.headBranch,
          base: input.baseBranch ?? repo.defaultBranch,
          draft: input.draft ?? false,
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
    const github = assertGitHubCredentials(credentials);
    const pr = await githubRequest<GitHubPullRequest>(
      `/repos/${repo.owner}/${repo.name}/pulls/${pullRequestNumber}`,
      github.accessToken,
    );
    return mapPullRequest(pr);
  },

  parsePullRequestUrl(url: string) {
    const match = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i.exec(url.trim());
    if (!match) {
      return null;
    }
    return {
      owner: match[1]!,
      name: match[2]!.replace(/\.git$/, ""),
      number: Number(match[3]),
    };
  },
};
