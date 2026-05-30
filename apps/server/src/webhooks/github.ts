import {
  isGitHubPullRequestPayload,
  verifyGitHubWebhookSignature,
  type GitHubWebhookPayload,
} from "@ai-kanban/integrations";
import type { TicketService } from "../services/tickets";

export function createGitHubWebhookHandler(tickets: TicketService) {
  return {
    async handle(rawBody: string, signatureHeader: string | undefined, secret: string | undefined) {
      verifyGitHubWebhookSignature(rawBody, signatureHeader, secret);

      const payload = JSON.parse(rawBody) as GitHubWebhookPayload;

      if ("zen" in payload) {
        return { ok: true, message: "pong" };
      }

      if (!isGitHubPullRequestPayload(payload)) {
        return { ok: true, ignored: true, reason: "Unsupported event type" };
      }

      const result = await tickets.syncFromGitHubPullRequest(payload);
      return { ok: true, ...result };
    },
  };
}

export type GitHubWebhookHandler = ReturnType<typeof createGitHubWebhookHandler>;
