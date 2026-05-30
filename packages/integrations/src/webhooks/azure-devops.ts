import { mapGitHubPullRequestAction } from "./github.js";

export type NormalizedPullRequestEvent = {
  provider: "github" | "azure_devops";
  action: string;
  organization: string;
  project?: string;
  repositoryName: string;
  pullRequest: {
    externalId: string;
    number: number;
    url: string;
    title: string;
    body: string;
    headBranch: string;
    merged: boolean;
  };
};

export type AzureDevOpsWebhookPayload = {
  eventType: string;
  resource: {
    pullRequestId: number;
    title: string;
    description?: string;
    status: "active" | "completed" | "abandoned";
    mergeStatus?: "succeeded" | "conflicts" | "failure" | "queued" | "rejectedByPolicy" | null;
    sourceRefName: string;
    url: string;
    repository: {
      id: string;
      name: string;
      project?: { name: string };
    };
  };
  resourceContainers?: {
    account?: { name?: string };
    project?: { name?: string };
  };
};

export function isAzureDevOpsPullRequestPayload(
  payload: AzureDevOpsWebhookPayload,
): payload is AzureDevOpsWebhookPayload {
  return payload.eventType.startsWith("git.pullrequest.") && Boolean(payload.resource?.pullRequestId);
}

export function verifyAzureDevOpsWebhookSecret(token: string | undefined, secret: string | undefined) {
  if (!secret) {
    return;
  }

  if (token !== secret) {
    throw new Error("Invalid Azure DevOps webhook secret");
  }
}

export function mapAzureDevOpsPullRequestEvent(eventType: string, status: string, mergeStatus?: string | null) {
  if (eventType === "git.pullrequest.merged" || (status === "completed" && mergeStatus === "succeeded")) {
    return {
      pullRequestState: "merged" as const,
      ticketStatus: "done" as const,
    };
  }

  if (status === "abandoned" || (status === "completed" && mergeStatus !== "succeeded")) {
    return {
      pullRequestState: "closed" as const,
      ticketStatus: "running" as const,
    };
  }

  if (status === "active" || eventType.startsWith("git.pullrequest.")) {
    return {
      pullRequestState: "open" as const,
      ticketStatus: eventType.includes("review") ? ("needs_human_review" as const) : ("pr_open" as const),
    };
  }

  return null;
}

export function normalizeAzureDevOpsWebhook(payload: AzureDevOpsWebhookPayload): NormalizedPullRequestEvent | null {
  if (!payload.eventType.startsWith("git.pullrequest.")) {
    return null;
  }

  const organization = payload.resourceContainers?.account?.name ?? "";
  const project =
    payload.resource.repository.project?.name ?? payload.resourceContainers?.project?.name ?? undefined;

  if (!organization || !project) {
    return null;
  }

  const merged =
    payload.resource.status === "completed" && payload.resource.mergeStatus === "succeeded";

  return {
    provider: "azure_devops",
    action: payload.eventType.replace("git.pullrequest.", ""),
    organization,
    project,
    repositoryName: payload.resource.repository.name,
    pullRequest: {
      externalId: String(payload.resource.pullRequestId),
      number: payload.resource.pullRequestId,
      url: payload.resource.url,
      title: payload.resource.title,
      body: payload.resource.description ?? "",
      headBranch: payload.resource.sourceRefName.replace(/^refs\/heads\//, ""),
      merged,
    },
  };
}

export function mapNormalizedPullRequestEvent(event: NormalizedPullRequestEvent) {
  if (event.provider === "github") {
    return mapGitHubPullRequestAction(event.action, event.pullRequest.merged);
  }

  const status =
    event.action === "merged" || event.pullRequest.merged
      ? "completed"
      : event.action === "abandoned"
        ? "abandoned"
        : "active";

  return mapAzureDevOpsPullRequestEvent(
    `git.pullrequest.${event.action}`,
    status,
    event.pullRequest.merged ? "succeeded" : undefined,
  );
}
