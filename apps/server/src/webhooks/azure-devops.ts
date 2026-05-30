import {
  isAzureDevOpsPullRequestPayload,
  normalizeAzureDevOpsWebhook,
  verifyAzureDevOpsWebhookSecret,
  type AzureDevOpsWebhookPayload,
} from "@ai-kanban/integrations";
import type { TicketService } from "../services/tickets";

export function createAzureDevOpsWebhookHandler(tickets: TicketService) {
  return {
    async handle(rawBody: string, token: string | undefined, secret: string | undefined) {
      verifyAzureDevOpsWebhookSecret(token, secret);

      const payload = JSON.parse(rawBody) as AzureDevOpsWebhookPayload;

      if (!isAzureDevOpsPullRequestPayload(payload)) {
        return { ok: true, ignored: true, reason: "Unsupported event type" };
      }

      const event = normalizeAzureDevOpsWebhook(payload);
      if (!event) {
        return { ok: true, ignored: true, reason: "Could not normalize pull request event" };
      }

      const result = await tickets.syncFromPullRequestEvent(event);
      return { ok: true, ...result };
    },
  };
}

export type AzureDevOpsWebhookHandler = ReturnType<typeof createAzureDevOpsWebhookHandler>;
