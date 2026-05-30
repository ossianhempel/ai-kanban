import { azureDevOpsProvider } from "./azure-devops.js";
import { githubProvider } from "./github.js";
import { gitlabProvider } from "./stubs.js";
import {
  providerCredentialsSchema,
  type ProviderCredentials,
  type SourceProviderAdapter,
  type SourceProviderId,
} from "./types.js";

const providers: Record<SourceProviderId, SourceProviderAdapter> = {
  github: githubProvider,
  azure_devops: azureDevOpsProvider,
  gitlab: gitlabProvider,
};

export function getSourceProvider(id: SourceProviderId): SourceProviderAdapter {
  return providers[id];
}

export function listSourceProviders(): Array<Pick<SourceProviderAdapter, "id" | "displayName">> {
  return Object.values(providers).map(({ id, displayName }) => ({ id, displayName }));
}

export function credentialsForProvider(provider: SourceProviderId, credentials: ProviderCredentials) {
  const parsed = providerCredentialsSchema.parse(credentials);
  if (parsed.kind === "github_pat" && provider !== "github") {
    throw new Error("GitHub credentials cannot be used for this provider");
  }
  if (parsed.kind === "azure_devops_pat" && provider !== "azure_devops") {
    throw new Error("Azure DevOps credentials cannot be used for this provider");
  }
  if (parsed.kind === "gitlab_pat" && provider !== "gitlab") {
    throw new Error("GitLab credentials cannot be used for this provider");
  }
  return parsed;
}

export function parsePullRequestUrl(provider: SourceProviderId, url: string) {
  return getSourceProvider(provider).parsePullRequestUrl(url);
}
