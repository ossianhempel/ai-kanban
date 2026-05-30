import {
  ProviderNotConfiguredError,
  type CreatePullRequestInput,
  type ProviderAccount,
  type ProviderCredentials,
  type RemotePullRequest,
  type RemoteRepository,
  type RemoteRepositoryRef,
  type RepositoryActivity,
  type SourceProviderAdapter,
  type SourceProviderId,
} from "./types.js";

function notConfigured(provider: SourceProviderId): SourceProviderAdapter {
  const throwNotConfigured = async () => {
    throw new ProviderNotConfiguredError(provider);
  };

  return {
    id: provider,
    displayName: provider === "gitlab" ? "GitLab" : provider,
    validateConnection: throwNotConfigured as () => Promise<ProviderAccount>,
    listRepositories: throwNotConfigured as () => Promise<RemoteRepository[]>,
    getRepository: throwNotConfigured as () => Promise<RemoteRepository>,
    getActivity: throwNotConfigured as () => Promise<RepositoryActivity>,
    createPullRequest: throwNotConfigured as () => Promise<RemotePullRequest>,
    getPullRequest: throwNotConfigured as () => Promise<RemotePullRequest>,
    parsePullRequestUrl: () => null,
  };
}

export const gitlabProvider = notConfigured("gitlab");

export function stubGuard(_credentials: ProviderCredentials, _input: CreatePullRequestInput) {
  return undefined;
}

export function stubRepoRef(_repo: RemoteRepositoryRef) {
  return undefined;
}
