import type { Database } from "@ai-kanban/db";
import {
  DIRECTIVE_TEMPLATE_CATALOG,
  getDirectiveTemplateById,
  mergeDirectiveTemplate,
  type AgentDirectivePriority,
  type DirectiveTemplateOverrides,
} from "@ai-kanban/agent-protocol";
import type { InstanceService } from "./knowledge";

export type AgentDirectiveTemplateView = {
  id: string;
  phase: string;
  group: string;
  default: {
    title: string;
    body: string;
    priority: AgentDirectivePriority;
  };
  override: {
    title?: string;
    body?: string;
    priority?: AgentDirectivePriority;
  } | null;
  effective: {
    title: string;
    body: string;
    priority: AgentDirectivePriority;
  };
  isCustomized: boolean;
};

function isCustomized(
  templateId: string,
  overrides: DirectiveTemplateOverrides,
): boolean {
  const patch = overrides[templateId];
  if (!patch) {
    return false;
  }
  return patch.title !== undefined || patch.body !== undefined || patch.priority !== undefined;
}

export function createAgentDirectiveService(_db: Database, instance: InstanceService) {
  async function getOverrides(): Promise<DirectiveTemplateOverrides> {
    const settings = await instance.getSettings();
    return settings.agentDirectiveOverrides ?? {};
  }

  async function listTemplates(): Promise<AgentDirectiveTemplateView[]> {
    const overrides = await getOverrides();
    return Object.values(DIRECTIVE_TEMPLATE_CATALOG)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((template) => {
        const override = overrides[template.id] ?? null;
        const effective = mergeDirectiveTemplate(template, overrides);
        return {
          id: template.id,
          phase: template.phase,
          group: template.id.split(".")[0] ?? template.id,
          default: {
            title: template.title,
            body: template.body,
            priority: template.priority,
          },
          override,
          effective: {
            title: effective.title,
            body: effective.body,
            priority: effective.priority,
          },
          isCustomized: isCustomized(template.id, overrides),
        };
      });
  }

  async function getTemplate(templateId: string): Promise<AgentDirectiveTemplateView | null> {
    const template = getDirectiveTemplateById(templateId);
    if (!template) {
      return null;
    }
    const rows = await listTemplates();
    return rows.find((row) => row.id === templateId) ?? null;
  }

  async function updateTemplateOverride(
    templateId: string,
    patch: { title?: string; body?: string; priority?: AgentDirectivePriority },
  ) {
    const template = getDirectiveTemplateById(templateId);
    if (!template) {
      throw new Error(`Unknown directive template: ${templateId}`);
    }

    const overrides = await getOverrides();
    const nextOverrides: DirectiveTemplateOverrides = {
      ...overrides,
      [templateId]: {
        ...overrides[templateId],
        ...patch,
      },
    };

    await instance.updateDirectiveOverrides(nextOverrides);
    return getTemplate(templateId);
  }

  async function resetTemplateOverride(templateId: string) {
    const template = getDirectiveTemplateById(templateId);
    if (!template) {
      throw new Error(`Unknown directive template: ${templateId}`);
    }

    const overrides = await getOverrides();
    const { [templateId]: _removed, ...rest } = overrides;
    await instance.updateDirectiveOverrides(rest);
    return getTemplate(templateId);
  }

  return {
    getOverrides,
    listTemplates,
    getTemplate,
    updateTemplateOverride,
    resetTemplateOverride,
  };
}

export type AgentDirectiveService = ReturnType<typeof createAgentDirectiveService>;
