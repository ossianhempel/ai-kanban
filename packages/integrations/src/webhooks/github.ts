import { createHmac, timingSafeEqual } from "node:crypto";

export type GitHubPullRequestPayload = {
  action: string;
  pull_request: {
    id: number;
    number: number;
    html_url: string;
    state: "open" | "closed";
    merged: boolean;
    draft: boolean;
    head: { ref: string };
    base: { ref: string };
    title: string;
    body: string | null;
  };
  repository: {
    id: number;
    full_name: string;
    name: string;
    owner: { login: string };
  };
};

export type GitHubWebhookPayload = GitHubPullRequestPayload | { zen?: string };

const TICKET_KEY_PATTERN = /\b([A-Za-z]{1,4}-\d+)\b/g;

export function verifyGitHubWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string | undefined,
) {
  if (!secret) {
    return;
  }

  if (!signatureHeader?.startsWith("sha256=")) {
    throw new Error("Missing GitHub webhook signature");
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = `sha256=${digest}`;
  const received = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);

  if (received.length !== expectedBuffer.length || !timingSafeEqual(received, expectedBuffer)) {
    throw new Error("Invalid GitHub webhook signature");
  }
}

export function extractTicketKeysFromText(text: string) {
  const matches = text.matchAll(TICKET_KEY_PATTERN);
  const keys = new Set<string>();

  for (const match of matches) {
    if (match[1]) {
      keys.add(match[1].toUpperCase());
    }
  }

  return [...keys];
}

export function mapGitHubPullRequestAction(action: string, merged: boolean) {
  if (action === "closed") {
    return {
      pullRequestState: merged ? ("merged" as const) : ("closed" as const),
      ticketStatus: merged ? ("done" as const) : ("running" as const),
    };
  }

  if (["opened", "reopened", "ready_for_review", "synchronize", "edited"].includes(action)) {
    return {
      pullRequestState: "open" as const,
      ticketStatus: "pr_open" as const,
    };
  }

  if (action === "review_requested") {
    return {
      pullRequestState: "open" as const,
      ticketStatus: "needs_human_review" as const,
    };
  }

  return null;
}

export function isGitHubPullRequestPayload(payload: GitHubWebhookPayload): payload is GitHubPullRequestPayload {
  return "pull_request" in payload && "repository" in payload && "action" in payload;
}
