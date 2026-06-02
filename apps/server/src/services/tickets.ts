import type { Database } from "@ai-kanban/db";
import { projects, repositories, ticketComments, tickets } from "@ai-kanban/db/schema";
import {
  assertIntakeReady,
  ClaimNotAllowedError,
  enqueueJob,
  evaluateReadiness,
  formatTicketKey,
  generateAgentBrief,
  parseTicketRef,
} from "@ai-kanban/core";
import { env } from "@ai-kanban/env/server";
import { schema } from "@ai-kanban/db";
import { type TicketCommentKind } from "@ai-kanban/agent-protocol";
import { parsePullRequestUrl } from "@ai-kanban/integrations";
import {
  extractTicketKeysFromText,
  mapNormalizedPullRequestEvent,
  type GitHubPullRequestPayload,
  type NormalizedPullRequestEvent,
} from "@ai-kanban/integrations";
import { MCP_TOOL_NAMES } from "@ai-kanban/agent-protocol";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { readRepositoryAgentGuide } from "@ai-kanban/integrations";
import type { RepositoryService } from "./repositories";
import type { InstanceService, KnowledgeService } from "./knowledge";

export function createTicketService(
  db: Database,
  repos?: RepositoryService,
  knowledge?: KnowledgeService,
  instance?: InstanceService,
) {
  async function assembleBriefInput(
    ticket: typeof tickets.$inferSelect,
    project: typeof projects.$inferSelect,
    repository: typeof repositories.$inferSelect | null | undefined,
  ) {
    const ticketKey = formatTicketKey(project.slug, ticket.number);
    const [settings, linkedDocumentation, repositoryAgentGuide] = await Promise.all([
      instance ? instance.getSettings() : Promise.resolve({ agentPlaybook: "" }),
      knowledge
        ? knowledge.resolveDocumentationForTicket(project.id, ticket.id)
        : Promise.resolve([]),
      repository?.localPath ? readRepositoryAgentGuide(repository.localPath) : Promise.resolve(null),
    ]);

    return {
      ticketKey,
      projectName: project.name,
      projectAgentContext: project.agentContext,
      instancePlaybook: settings.agentPlaybook,
      repositoryName: repository?.name ?? null,
      repositoryUrl: repository?.url ?? null,
      repositoryLocalPath: repository?.localPath ?? null,
      repositoryDefaultBranch: repository?.defaultBranch ?? null,
      repositoryAgentGuide,
      linkedDocumentation,
      title: ticket.title,
      description: ticket.description,
      acceptanceCriteria: ticket.acceptanceCriteria,
      businessContext: ticket.businessContext,
      expectedOutcome: ticket.expectedOutcome,
      repositoryId: ticket.repositoryId,
    };
  }

  async function buildBriefForTicket(
    ticket: typeof tickets.$inferSelect,
    project: typeof projects.$inferSelect,
    repository: typeof repositories.$inferSelect | null | undefined,
  ) {
    return generateAgentBrief(await assembleBriefInput(ticket, project, repository));
  }

  async function resolveTicket(ref: string) {
    const parsed = parseTicketRef(ref);

    if (parsed.kind === "id") {
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, parsed.id)).limit(1);
      return ticket ?? null;
    }

    const rows = await db
      .select({ ticket: tickets, project: projects })
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .where(and(eq(tickets.number, parsed.number), isNull(tickets.deletedAt)));

    return rows.find((row) => formatTicketKey(row.project.slug, row.ticket.number) === `${parsed.prefix}-${parsed.number}`)
      ?.ticket ?? null;
  }

  async function getTicketContext(ref: string) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    const [[project], repository] = await Promise.all([
      db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1),
      ticket.repositoryId
        ? db.select().from(repositories).where(eq(repositories.id, ticket.repositoryId)).limit(1)
        : Promise.resolve([]),
    ]);

    if (!project) {
      return null;
    }

    const ticketKey = formatTicketKey(project.slug, ticket.number);
    const brief = await buildBriefForTicket(ticket, project, repository[0] ?? null);
    const comments = await listTicketComments(ticket.id);

    return {
      ticket,
      project,
      repository: repository[0] ?? null,
      ticketKey,
      brief,
      comments,
    };
  }

  async function listTicketComments(ticketId: string) {
    return db
      .select()
      .from(ticketComments)
      .where(and(eq(ticketComments.ticketId, ticketId), isNull(ticketComments.deletedAt)))
      .orderBy(asc(ticketComments.createdAt));
  }

  async function addTicketComment(
    ref: string,
    input: {
      body: string;
      authorId?: string | null;
      agentId?: string | null;
      kind?: TicketCommentKind;
    },
  ) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    const trimmedBody = input.body.trim();
    if (!trimmedBody) {
      throw new Error("Comment body is required");
    }

    const body = input.agentId
      ? `**Agent (${input.agentId}):**\n\n${trimmedBody}`
      : trimmedBody;

    const kind = input.kind ?? (input.agentId ? "agent_comment" : "comment");

    const [comment] = await db
      .insert(ticketComments)
      .values({
        ticketId: ticket.id,
        authorId: input.authorId ?? null,
        body,
        kind,
      })
      .returning();

    if (!comment) {
      throw new Error("Failed to add comment");
    }

    let activeTicket = ticket;

    if (kind === "clarification_request") {
      const canMoveToClarification =
        ticket.status === "inbox" ||
        ticket.status === "agent_ready" ||
        ticket.status === "ready_for_planning";

      if (canMoveToClarification) {
        const moved = await updateTicketStatus(ref, "needs_clarification");
        if (moved) {
          activeTicket = moved;
        }
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1);
      const ticketKey = project ? formatTicketKey(project.slug, ticket.number) : ticket.id;

      let authorEmail: string | null = null;
      let authorName: string | null = null;
      if (ticket.createdById) {
        const [author] = await db
          .select({ email: schema.user.email, name: schema.user.name })
          .from(schema.user)
          .where(eq(schema.user.id, ticket.createdById))
          .limit(1);
        authorEmail = author?.email ?? null;
        authorName = author?.name ?? null;
      }

      await enqueueJob(db, "send_notification", {
        type: "clarification_request",
        ticketKey,
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        agentId: input.agentId ?? null,
        commentBody: trimmedBody,
        authorEmail,
        authorName,
        ticketUrl: `${env.WEB_ORIGIN.replace(/\/$/, "")}/?ticket=${encodeURIComponent(ticketKey)}`,
      });
    }

    return { ticket: activeTicket, comment };
  }

  async function listTickets(filters: { projectSlug?: string; status?: string } = {}) {
    const conditions = [isNull(tickets.deletedAt)];

    if (filters.status) {
      conditions.push(eq(tickets.status, filters.status as typeof tickets.status.enumValues[number]));
    }

    const rows = await db
      .select({ ticket: tickets, project: projects })
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(desc(tickets.updatedAt));

    return rows
      .filter((row) => (filters.projectSlug ? row.project.slug === filters.projectSlug : true))
      .map((row) => ({
        ...row.ticket,
        ticketKey: formatTicketKey(row.project.slug, row.ticket.number),
        project: row.project,
      }));
  }

  async function createTicket(input: {
    projectId: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string;
    businessContext?: string;
    expectedOutcome?: string;
    priority?: "low" | "medium" | "high" | "urgent";
    repositoryId?: string | null;
    createdById?: string | null;
    intakeMode?: "inbox" | "strict";
  }) {
    const [row] = await db
      .select({ maxNumber: sql<number>`coalesce(max(${tickets.number}), 0)` })
      .from(tickets)
      .where(eq(tickets.projectId, input.projectId));

    const maxNumber = row?.maxNumber ?? 0;

    const readinessInput = {
      title: input.title,
      description: input.description ?? "",
      acceptanceCriteria: input.acceptanceCriteria ?? "",
      businessContext: input.businessContext ?? "",
      expectedOutcome: input.expectedOutcome ?? "",
      repositoryId: input.repositoryId ?? null,
    };

    const intakeMode = input.intakeMode ?? "strict";
    const readiness =
      intakeMode === "inbox"
        ? evaluateReadiness(readinessInput)
        : assertIntakeReady(readinessInput);

    const status =
      intakeMode === "inbox" ? ("inbox" as const) : readiness.recommendedStatus;

    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) {
      throw new Error("Project not found");
    }

    const repository = input.repositoryId
      ? (await db.select().from(repositories).where(eq(repositories.id, input.repositoryId)).limit(1))[0]
      : null;

    const nextNumber = Number(maxNumber) + 1;

    const [ticket] = await db
      .insert(tickets)
      .values({
        projectId: input.projectId,
        number: nextNumber,
        title: input.title,
        description: input.description ?? "",
        acceptanceCriteria: input.acceptanceCriteria ?? "",
        businessContext: input.businessContext ?? "",
        expectedOutcome: input.expectedOutcome ?? "",
        priority: input.priority ?? "medium",
        repositoryId: input.repositoryId ?? null,
        createdById: input.createdById ?? null,
        readinessScore: readiness.score,
        readinessIssues: readiness.issues,
        status,
      })
      .returning();

    if (!ticket) {
      throw new Error("Failed to create ticket");
    }

    const brief = await buildBriefForTicket(ticket, project, repository);
    const [withBrief] = await db
      .update(tickets)
      .set({ agentBrief: brief })
      .where(eq(tickets.id, ticket.id))
      .returning();

    return withBrief ?? ticket;
  }

  async function updateTicketStatus(ref: string, status: typeof tickets.status.enumValues[number]) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    const [updated] = await db.update(tickets).set({ status }).where(eq(tickets.id, ticket.id)).returning();
    return updated ?? null;
  }

  async function claimTicket(ref: string, agentId: string) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    if (ticket.status === "running" && ticket.claimedBy === agentId) {
      return ticket;
    }

    if (ticket.status !== "agent_ready") {
      throw new ClaimNotAllowedError(ticket.status);
    }

    const [updated] = await db
      .update(tickets)
      .set({
        claimedBy: agentId,
        claimedAt: new Date(),
        status: "running",
      })
      .where(eq(tickets.id, ticket.id))
      .returning();

    return updated ?? null;
  }

  async function completeTicket(ref: string, _summary?: string) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    const [updated] = await db
      .update(tickets)
      .set({
        status: "done",
      })
      .where(eq(tickets.id, ticket.id))
      .returning();

    return updated ?? null;
  }

  async function updateTicket(
    ref: string,
    input: {
      title?: string;
      description?: string;
      acceptanceCriteria?: string;
      businessContext?: string;
      expectedOutcome?: string;
      priority?: "low" | "medium" | "high" | "urgent";
      repositoryId?: string | null;
    },
  ) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    const next = {
      title: input.title ?? ticket.title,
      description: input.description ?? ticket.description,
      acceptanceCriteria: input.acceptanceCriteria ?? ticket.acceptanceCriteria,
      businessContext: input.businessContext ?? ticket.businessContext,
      expectedOutcome: input.expectedOutcome ?? ticket.expectedOutcome,
      priority: input.priority ?? ticket.priority,
      repositoryId: input.repositoryId !== undefined ? input.repositoryId : ticket.repositoryId,
    };

    const readiness = evaluateReadiness({
      title: next.title,
      description: next.description,
      acceptanceCriteria: next.acceptanceCriteria,
      businessContext: next.businessContext,
      expectedOutcome: next.expectedOutcome,
      repositoryId: next.repositoryId,
    });

    const [project] = await db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1);
    const repository = next.repositoryId
      ? (await db.select().from(repositories).where(eq(repositories.id, next.repositoryId)).limit(1))[0]
      : null;
    const brief = project ? await buildBriefForTicket({ ...ticket, ...next }, project, repository) : null;

    const [updated] = await db
      .update(tickets)
      .set({
        ...next,
        readinessScore: readiness.score,
        readinessIssues: readiness.issues,
        status:
          ticket.status === "inbox" || ticket.status === "needs_clarification" || ticket.status === "agent_ready"
            ? readiness.recommendedStatus
            : ticket.status,
        agentBrief: brief,
      })
      .where(eq(tickets.id, ticket.id))
      .returning();

    return updated ?? null;
  }

  async function refreshReadiness(ticketId: string) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) {
      return null;
    }

    const readiness = evaluateReadiness({
      title: ticket.title,
      description: ticket.description,
      acceptanceCriteria: ticket.acceptanceCriteria,
      businessContext: ticket.businessContext,
      expectedOutcome: ticket.expectedOutcome,
      repositoryId: ticket.repositoryId,
    });

    const [project] = await db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1);
    const repository = ticket.repositoryId
      ? (await db.select().from(repositories).where(eq(repositories.id, ticket.repositoryId)).limit(1))[0]
      : null;

    const brief = project
      ? await buildBriefForTicket(ticket, project, repository)
      : null;

    const [updated] = await db
      .update(tickets)
      .set({
        readinessScore: readiness.score,
        readinessIssues: readiness.issues,
        status:
          ticket.status === "inbox" || ticket.status === "needs_clarification" || ticket.status === "agent_ready"
            ? readiness.recommendedStatus
            : ticket.status,
        agentBrief: brief,
      })
      .where(eq(tickets.id, ticket.id))
      .returning();

    return updated ?? null;
  }

  async function listProjects() {
    return db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(asc(projects.name));
  }

  async function resolveProject(input: { projectId?: string; projectSlug?: string }) {
    if (input.projectId) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, input.projectId), isNull(projects.deletedAt)))
        .limit(1);
      return project ?? null;
    }

    if (input.projectSlug) {
      const [project] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.slug, input.projectSlug), isNull(projects.deletedAt)))
        .limit(1);
      return project ?? null;
    }

    return null;
  }

  async function resolveProjectForAgent(input: { projectId?: string; projectSlug?: string } = {}) {
    if (input.projectId || input.projectSlug) {
      const project = await resolveProject(input);
      if (!project) {
        throw new Error(
          `Project not found: ${input.projectSlug ?? input.projectId}. Call ${MCP_TOOL_NAMES.listProjects} for valid slugs.`,
        );
      }
      return project;
    }

    const allProjects = await listProjects();
    if (allProjects.length === 0) {
      throw new Error(
        "No projects on this instance. Create a project in Agent settings or the web UI, then call aikanban_list_projects again.",
      );
    }

    const settings = instance ? await instance.getSettings() : null;
    const defaultSlug = settings?.defaultProjectSlug ?? null;
    if (defaultSlug) {
      const fromDefault = allProjects.find((project) => project.slug === defaultSlug);
      if (fromDefault) {
        return fromDefault;
      }
    }

    if (allProjects.length === 1) {
      return allProjects[0]!;
    }

    const slugs = allProjects.map((project) => project.slug).join(", ");
    throw new Error(
      `projectSlug is required (${allProjects.length} projects: ${slugs}). Call ${MCP_TOOL_NAMES.listProjects}, then ${MCP_TOOL_NAMES.getProject} with your slug.`,
    );
  }

  async function getProjectForAgent(input: { projectSlug?: string } = {}) {
    const project = await resolveProjectForAgent({ projectSlug: input.projectSlug });
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      agentContext: project.agentContext,
      ticketKeyPrefix: project.slug,
    };
  }

  async function listProjectsForAgent() {
    const projectRows = await listProjects();
    const settings = instance ? await instance.getSettings() : null;
    return {
      projects: projectRows.map((project) => ({
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
      })),
      defaultProjectSlug: settings?.defaultProjectSlug ?? null,
      projectCount: projectRows.length,
    };
  }

  async function createProject(input: { name: string; slug: string; description?: string }) {
    const [project] = await db
      .insert(projects)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description ?? "",
      })
      .returning();

    return project ?? null;
  }

  async function linkPullRequest(
    ref: string,
    input: { url: string; branchName?: string },
    userId?: string,
  ) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    if (!ticket.repositoryId || !repos) {
      throw new Error("Ticket must be linked to a connected repository");
    }

    const remote = await repos.resolveRepositoryRemote(ticket.repositoryId, userId);
    const parsed = parsePullRequestUrl(remote.providerId, input.url);
    if (!parsed) {
      throw new Error("Could not parse pull request URL for this provider");
    }

    if (parsed.owner !== remote.ref.owner || parsed.name !== remote.ref.name) {
      throw new Error("Pull request does not belong to the ticket repository");
    }

    if (parsed.project) {
      const refProject = remote.ref.project ?? remote.ref.fullName.split("/")[0];
      if (parsed.project !== refProject) {
        throw new Error("Pull request does not belong to the ticket repository");
      }
    }

    if (!parsed.project && remote.providerId === "azure_devops") {
      throw new Error("Could not parse Azure DevOps pull request URL");
    }

    const pullRequest = await remote.provider.getPullRequest(
      remote.credentials,
      remote.ref,
      parsed.number,
    );

    const [updated] = await db
      .update(tickets)
      .set({
        pullRequestUrl: pullRequest.url,
        pullRequestExternalId: pullRequest.externalId,
        pullRequestNumber: pullRequest.number,
        pullRequestState: pullRequest.state,
        branchName: input.branchName ?? pullRequest.headBranch,
        status: pullRequest.state === "merged" ? "done" : "pr_open",
      })
      .where(eq(tickets.id, ticket.id))
      .returning();

    return updated ?? null;
  }

  async function createPullRequestForTicket(
    ref: string,
    input: {
      title?: string;
      body?: string;
      headBranch: string;
      baseBranch?: string;
      draft?: boolean;
    },
    userId?: string,
  ) {
    const ticket = await resolveTicket(ref);
    if (!ticket) {
      return null;
    }

    if (!ticket.repositoryId || !repos) {
      throw new Error("Ticket must be linked to a connected repository");
    }

    const context = await getTicketContext(ref);
    if (!context) {
      return null;
    }

    const remote = await repos.resolveRepositoryRemote(ticket.repositoryId, userId);
    const pullRequest = await remote.provider.createPullRequest(remote.credentials, remote.ref, {
      title: input.title ?? `${context.ticketKey}: ${ticket.title}`,
      body:
        input.body ??
        [
          `Ticket: ${context.ticketKey}`,
          "",
          ticket.description,
          "",
          "## Acceptance criteria",
          ticket.acceptanceCriteria,
        ]
          .filter(Boolean)
          .join("\n"),
      headBranch: input.headBranch,
      baseBranch: input.baseBranch,
      draft: input.draft,
    });

    const [updated] = await db
      .update(tickets)
      .set({
        pullRequestUrl: pullRequest.url,
        pullRequestExternalId: pullRequest.externalId,
        pullRequestNumber: pullRequest.number,
        pullRequestState: pullRequest.state,
        branchName: input.headBranch,
        status: "pr_open",
      })
      .where(eq(tickets.id, ticket.id))
      .returning();

    return { ticket: updated, pullRequest };
  }

  async function findTicketForPullRequest(
    repositoryId: string,
    pullRequest: {
      externalId: string;
      number: number;
      headBranch: string;
      title: string;
      body: string;
    },
  ) {
    const searchText = `${pullRequest.title}\n${pullRequest.body}`;

    const [linkedByExternalId] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.repositoryId, repositoryId),
          eq(tickets.pullRequestExternalId, pullRequest.externalId),
          isNull(tickets.deletedAt),
        ),
      )
      .limit(1);

    if (linkedByExternalId) {
      return linkedByExternalId;
    }

    const [linkedByNumber] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.repositoryId, repositoryId),
          eq(tickets.pullRequestNumber, pullRequest.number),
          isNull(tickets.deletedAt),
        ),
      )
      .limit(1);

    if (linkedByNumber) {
      return linkedByNumber;
    }

    const [linkedByBranch] = await db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.repositoryId, repositoryId),
          eq(tickets.branchName, pullRequest.headBranch),
          isNull(tickets.deletedAt),
        ),
      )
      .limit(1);

    if (linkedByBranch) {
      return linkedByBranch;
    }

    for (const ticketKey of extractTicketKeysFromText(searchText)) {
      const ticket = await resolveTicket(ticketKey);
      if (ticket?.repositoryId === repositoryId) {
        return ticket;
      }
    }

    return null;
  }

  async function syncFromPullRequestEvent(event: NormalizedPullRequestEvent) {
    if (!repos) {
      return { handled: false, reason: "Repository service unavailable" };
    }

    const repository = await repos.findRemoteRepository(event.provider, {
      owner: event.organization,
      repoName: event.repositoryName,
      project: event.project,
    });

    if (!repository) {
      return { handled: false, reason: "Repository not imported in AI Kanban" };
    }

    const mapping = mapNormalizedPullRequestEvent(event);
    if (!mapping) {
      return { handled: false, reason: `Ignored pull request action: ${event.action}` };
    }

    const ticket = await findTicketForPullRequest(repository.id, event.pullRequest);

    if (!ticket) {
      return { handled: false, reason: "No matching ticket found" };
    }

    const [updated] = await db
      .update(tickets)
      .set({
        pullRequestUrl: event.pullRequest.url,
        pullRequestExternalId: event.pullRequest.externalId,
        pullRequestNumber: event.pullRequest.number,
        pullRequestState: mapping.pullRequestState,
        branchName: event.pullRequest.headBranch,
        status: mapping.ticketStatus,
      })
      .where(eq(tickets.id, ticket.id))
      .returning();

    const [project] = await db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1);
    const ticketKey = project ? formatTicketKey(project.slug, ticket.number) : ticket.id;

    return {
      handled: true,
      provider: event.provider,
      action: event.action,
      ticketKey,
      ticketId: ticket.id,
      status: updated?.status ?? mapping.ticketStatus,
      pullRequestState: mapping.pullRequestState,
    };
  }

  async function syncFromGitHubPullRequest(payload: GitHubPullRequestPayload) {
    return syncFromPullRequestEvent({
      provider: "github",
      action: payload.action,
      organization: payload.repository.owner.login,
      repositoryName: payload.repository.name,
      pullRequest: {
        externalId: String(payload.pull_request.id),
        number: payload.pull_request.number,
        url: payload.pull_request.html_url,
        title: payload.pull_request.title,
        body: payload.pull_request.body ?? "",
        headBranch: payload.pull_request.head.ref,
        merged: payload.pull_request.merged,
      },
    });
  }

  async function syncStoredBrief(ticketId: string) {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
    if (!ticket) {
      return;
    }

    const [project] = await db.select().from(projects).where(eq(projects.id, ticket.projectId)).limit(1);
    if (!project) {
      return;
    }

    const repository = ticket.repositoryId
      ? (await db.select().from(repositories).where(eq(repositories.id, ticket.repositoryId)).limit(1))[0]
      : null;

    const brief = await buildBriefForTicket(ticket, project, repository ?? null);
    await db.update(tickets).set({ agentBrief: brief }).where(eq(tickets.id, ticketId));
  }

  async function syncStoredBriefsForProject(projectId: string) {
    const rows = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.projectId, projectId), isNull(tickets.deletedAt)));

    await Promise.all(rows.map((row) => syncStoredBrief(row.id)));
  }

  async function syncAllStoredBriefs() {
    const rows = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(isNull(tickets.deletedAt));

    await Promise.all(rows.map((row) => syncStoredBrief(row.id)));
  }

  return {
    resolveTicket,
    getTicketContext,
    listTickets,
    listTicketComments,
    addTicketComment,
    createTicket,
    updateTicketStatus,
    updateTicket,
    claimTicket,
    completeTicket,
    linkPullRequest,
    createPullRequestForTicket,
    syncFromGitHubPullRequest,
    syncFromPullRequestEvent,
    refreshReadiness,
    syncStoredBrief,
    syncStoredBriefsForProject,
    syncAllStoredBriefs,
    listProjects,
    listProjectsForAgent,
    resolveProject,
    resolveProjectForAgent,
    getProjectForAgent,
    createProject,
  };
}

export type TicketService = ReturnType<typeof createTicketService>;
