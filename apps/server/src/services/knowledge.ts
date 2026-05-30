import type { Database } from "@ai-kanban/db";
import { instanceSettings, knowledgeRefs, projects } from "@ai-kanban/db/schema";
import { and, asc, eq, isNull } from "drizzle-orm";

export type KnowledgeScope = "instance" | "project" | "ticket";

export type LinkedDocumentation = {
  label: string;
  url: string;
  content?: string | null;
};

export function createInstanceService(db: Database) {
  async function getSettings() {
    const [row] = await db.select().from(instanceSettings).limit(1);
    if (row) {
      return row;
    }

    const [created] = await db.insert(instanceSettings).values({ agentPlaybook: "" }).returning();
    return created!;
  }

  async function updateSettings(input: { agentPlaybook?: string }) {
    const current = await getSettings();
    const [updated] = await db
      .update(instanceSettings)
      .set({
        agentPlaybook: input.agentPlaybook ?? current.agentPlaybook,
      })
      .where(eq(instanceSettings.id, current.id))
      .returning();

    return updated ?? current;
  }

  return {
    getSettings,
    updateSettings,
  };
}

export function createKnowledgeService(db: Database) {
  async function listRefs(filters: { scope: KnowledgeScope; projectId?: string; ticketId?: string }) {
    const conditions = [eq(knowledgeRefs.scope, filters.scope)];

    if (filters.scope === "project" && filters.projectId) {
      conditions.push(eq(knowledgeRefs.projectId, filters.projectId));
    }

    if (filters.scope === "ticket" && filters.ticketId) {
      conditions.push(eq(knowledgeRefs.ticketId, filters.ticketId));
    }

    if (filters.scope === "instance") {
      conditions.push(isNull(knowledgeRefs.projectId), isNull(knowledgeRefs.ticketId));
    }

    return db
      .select()
      .from(knowledgeRefs)
      .where(and(...conditions))
      .orderBy(asc(knowledgeRefs.sortOrder), asc(knowledgeRefs.label));
  }

  async function createRef(input: {
    scope: KnowledgeScope;
    projectId?: string | null;
    ticketId?: string | null;
    label: string;
    url: string;
  }) {
    if (input.scope === "project" && !input.projectId) {
      throw new Error("projectId is required for project knowledge refs");
    }

    if (input.scope === "ticket" && !input.ticketId) {
      throw new Error("ticketId is required for ticket knowledge refs");
    }

    const [row] = await db
      .insert(knowledgeRefs)
      .values({
        scope: input.scope,
        projectId: input.scope === "project" ? input.projectId ?? null : null,
        ticketId: input.scope === "ticket" ? input.ticketId ?? null : null,
        label: input.label.trim(),
        url: input.url.trim(),
      })
      .returning();

    return row ?? null;
  }

  async function deleteRef(id: string) {
    const [row] = await db.delete(knowledgeRefs).where(eq(knowledgeRefs.id, id)).returning();
    return row ?? null;
  }

  async function resolveDocumentationForTicket(projectId: string, ticketId: string): Promise<LinkedDocumentation[]> {
    const [instanceRows, projectRows, ticketRows] = await Promise.all([
      listRefs({ scope: "instance" }),
      listRefs({ scope: "project", projectId }),
      listRefs({ scope: "ticket", ticketId }),
    ]);

    return [...instanceRows, ...projectRows, ...ticketRows].map((row) => ({
      label: row.label,
      url: row.url,
      content: row.resolvedContent,
    }));
  }

  async function updateProjectAgentContext(projectId: string, agentContext: string) {
    const [updated] = await db
      .update(projects)
      .set({ agentContext })
      .where(eq(projects.id, projectId))
      .returning();

    return updated ?? null;
  }

  return {
    listRefs,
    createRef,
    deleteRef,
    resolveDocumentationForTicket,
    updateProjectAgentContext,
  };
}

export type InstanceService = ReturnType<typeof createInstanceService>;
export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
