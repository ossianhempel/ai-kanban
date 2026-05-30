import type { AgentBrief } from "@ai-kanban/agent-protocol";
import {
  assertIntakeReady,
  evaluateReadiness,
  IntakeValidationError,
  type ReadinessInput,
  type ReadinessResult,
} from "@ai-kanban/agent-protocol";
import type { TicketStatus } from "@ai-kanban/agent-protocol";

export {
  assertIntakeReady,
  evaluateReadiness,
  IntakeValidationError,
  type ReadinessInput,
  type ReadinessResult,
};

export const TICKET_STATUSES: TicketStatus[] = [
  "inbox",
  "needs_clarification",
  "ready_for_planning",
  "agent_ready",
  "running",
  "pr_open",
  "needs_human_review",
  "done",
  "blocked",
];

export const KANBAN_COLUMNS: Array<{ status: TicketStatus; label: string }> = [
  { status: "inbox", label: "Inbox" },
  { status: "needs_clarification", label: "Needs Clarification" },
  { status: "ready_for_planning", label: "Ready for Planning" },
  { status: "agent_ready", label: "Agent Ready" },
  { status: "running", label: "Running" },
  { status: "pr_open", label: "PR Open" },
  { status: "needs_human_review", label: "Needs Human Review" },
  { status: "done", label: "Done" },
  { status: "blocked", label: "Blocked" },
];

export class ClaimNotAllowedError extends Error {
  constructor(status: string) {
    super(`Task cannot be claimed while status is ${status}. Ticket must be agent_ready.`);
    this.name = "ClaimNotAllowedError";
  }
}

export type BriefInput = ReadinessInput & {
  projectName: string;
  projectAgentContext?: string | null;
  instancePlaybook?: string | null;
  repositoryName?: string | null;
  repositoryUrl?: string | null;
  repositoryLocalPath?: string | null;
  repositoryDefaultBranch?: string | null;
  repositoryAgentGuide?: string | null;
  ticketKey: string;
  linkedDocumentation?: Array<{ label: string; url: string; content?: string | null }>;
};

export function generateAgentBrief(input: BriefInput): AgentBrief {
  const acceptanceCriteria = input.acceptanceCriteria
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const testCommands: string[] = [];
  if (input.repositoryLocalPath) {
    testCommands.push(`cd ${input.repositoryLocalPath}`);
    testCommands.push("pnpm test");
    testCommands.push("pnpm lint");
  }

  const linkedDocs =
    input.linkedDocumentation?.map((doc) => {
      const header = `${doc.label} (${doc.url})`;
      if (doc.content?.trim()) {
        return `${header}\n\n${doc.content.trim()}`;
      }
      return header;
    }) ?? [];

  const repoGuide = input.repositoryAgentGuide?.trim()
    ? [`Repository agent guide\n\n${input.repositoryAgentGuide.trim()}`]
    : [];

  return {
    task: `${input.ticketKey}: ${input.title}`,
    context: [
      input.instancePlaybook?.trim() ? `## Instance guide\n\n${input.instancePlaybook.trim()}` : null,
      input.projectAgentContext?.trim() ? `## Project context\n\n${input.projectAgentContext.trim()}` : null,
      `## Task\n\nProject: ${input.projectName}`,
      input.repositoryName ? `Repository: ${input.repositoryName}` : null,
      input.repositoryUrl ? `Remote URL: ${input.repositoryUrl}` : null,
      input.repositoryLocalPath ? `Local path: ${input.repositoryLocalPath}` : null,
      input.repositoryDefaultBranch ? `Default branch: ${input.repositoryDefaultBranch}` : null,
      input.businessContext.trim() ? `## Business context\n\n${input.businessContext.trim()}` : null,
      input.description.trim() ? `## Description\n\n${input.description.trim()}` : null,
      input.expectedOutcome.trim() ? `## Expected outcome\n\n${input.expectedOutcome.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    relevantDocumentation: [...linkedDocs, ...repoGuide],
    relevantFiles: [],
    constraints: [
      "Do not modify unrelated files.",
      "Follow existing project conventions and lint rules.",
      input.repositoryLocalPath ? `Work in ${input.repositoryLocalPath}.` : "Clone the linked repository before making changes.",
    ],
    acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : [input.acceptanceCriteria],
    testCommands,
    definitionOfDone: [
      "All acceptance criteria satisfied.",
      "Tests pass for affected areas.",
      "No unrelated changes included.",
    ],
    forbiddenChanges: ["Secrets or credentials in source control", "Unrelated refactors"],
  };
}

export function formatTicketKey(projectSlug: string, number: number) {
  const prefix = projectSlug
    .split("-")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 4) || "TASK";

  return `${prefix}-${number}`;
}

export function parseTicketRef(ref: string) {
  const trimmed = ref.trim();
  const keyMatch = /^([A-Za-z]+)-(\d+)$/.exec(trimmed);
  if (keyMatch) {
    return { kind: "key" as const, prefix: keyMatch[1]!.toUpperCase(), number: Number(keyMatch[2]) };
  }

  return { kind: "id" as const, id: trimmed };
}
