import { env } from "@ai-kanban/env/server";

export type ClarificationNotificationPayload = {
  type: "clarification_request";
  ticketKey: string;
  ticketId: string;
  ticketTitle: string;
  agentId: string | null;
  commentBody: string;
  authorEmail: string | null;
  authorName: string | null;
  ticketUrl: string;
};

export async function deliverWebhookNotification(payload: Record<string, unknown>): Promise<void> {
  const webhookUrl = env.AIKANBAN_WEBHOOK_URL;
  if (!webhookUrl) {
    console.info("[ai-kanban] notification:", JSON.stringify(payload));
    return;
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Webhook returned ${response.status}: ${text.slice(0, 200)}`);
  }
}
