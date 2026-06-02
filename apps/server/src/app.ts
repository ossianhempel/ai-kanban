import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import type { HttpBindings } from "@hono/node-server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { Database } from "@ai-kanban/db";
import { env } from "@ai-kanban/env/server";
import type { Auth } from "./auth";
import { createMcpServer } from "./mcp/server";
import { buildMcpPublicConfig } from "./mcp/public-config";
import type { RepositoryService } from "./services/repositories";
import type { ConnectionService } from "./services/connections";
import type { InstanceService, KnowledgeService } from "./services/knowledge";
import type { TicketService } from "./services/tickets";
import type { UserService } from "./services/users";
import { createGitHubWebhookHandler } from "./webhooks/github";
import { createAzureDevOpsWebhookHandler } from "./webhooks/azure-devops";
import { ClaimNotAllowedError, IntakeValidationError } from "@ai-kanban/core";
import { sourceProviderIdSchema } from "@ai-kanban/integrations";
import { isAdmin, authorizeUser } from "./authz";
import {
  addSignupAllowlistEntry,
  getSignupPolicySettings,
  removeSignupAllowlistEntry,
  resolveSignupPolicy,
  updateSignupAllowPublic,
} from "./signup-policy";
import { buildPublicAuthConfig } from "./auth-providers";
import { createApiTokenMiddleware, invalidateApiTokenUserCache } from "./api-token";
import {
  buildProviderAuthorizeUrl,
  createProviderOAuthState,
  exchangeProviderOAuthCode,
  getProviderOAuthAvailability,
  parseProviderOAuthState,
} from "./provider-oauth";
import { MCP_TOOL_NAMES, resolveAgentDirective } from "@ai-kanban/agent-protocol";
import type { AgentDirectiveService } from "./services/agent-directives";
import { assertMcpWriteAuthorized, mcpRequestRequiresWriteAuth } from "./mcp/guard";

const serverRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(serverRoot, "../../..");

const createProjectSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
});

const createTicketSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  businessContext: z.string().optional(),
  expectedOutcome: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  repositoryId: z.string().uuid().nullable().optional(),
  intakeMode: z.enum(["inbox", "strict"]).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "inbox",
    "needs_clarification",
    "ready_for_planning",
    "agent_ready",
    "running",
    "pr_open",
    "needs_human_review",
    "done",
    "blocked",
  ]),
});

export type AppVariables = {
  user: Auth["$Infer"]["Session"]["user"] | null;
  session: Auth["$Infer"]["Session"]["session"] | null;
};

const createRepositorySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  url: z.string().nullable().optional(),
  localPath: z.string().min(1).nullable().optional(),
  defaultBranch: z.string().optional(),
});

const updateRepositorySchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().nullable().optional(),
  localPath: z.string().min(1).nullable().optional(),
  defaultBranch: z.string().optional(),
});

const updateTicketSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  acceptanceCriteria: z.string().optional(),
  businessContext: z.string().optional(),
  expectedOutcome: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  repositoryId: z.string().uuid().nullable().optional(),
});

const connectProviderSchema = z.object({
  provider: sourceProviderIdSchema,
  accessToken: z.string().min(1),
  organization: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

const importRepositorySchema = z.object({
  projectId: z.string().uuid(),
  connectionId: z.string().uuid(),
  externalId: z.string().min(1),
  localPath: z.string().nullable().optional(),
});

const linkPullRequestSchema = z.object({
  url: z.string().url(),
  branchName: z.string().optional(),
});

const createPullRequestSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  headBranch: z.string().min(1),
  baseBranch: z.string().optional(),
  draft: z.boolean().optional(),
});

const updateInstanceSettingsSchema = z.object({
  agentPlaybook: z.string().optional(),
  defaultProjectSlug: z.string().min(1).nullable().optional(),
});

const updateProjectContextSchema = z.object({
  agentContext: z.string(),
});

const createKnowledgeRefSchema = z.object({
  scope: z.enum(["instance", "project", "ticket"]),
  projectId: z.string().uuid().optional(),
  ticketId: z.string().uuid().optional(),
  label: z.string().min(1),
  url: z.string().url(),
});

const updateUserRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export function createApp(
  db: Database,
  auth: Auth,
  tickets: TicketService,
  repos: RepositoryService,
  connections: ConnectionService,
  instance: InstanceService,
  knowledge: KnowledgeService,
  users: UserService,
  agentDirectives: AgentDirectiveService,
) {
  const app = new Hono<{ Variables: AppVariables; Bindings: HttpBindings }>();
  const mcpServer = createMcpServer(tickets, repos, agentDirectives);
  const githubWebhook = createGitHubWebhookHandler(tickets);
  const azureDevOpsWebhook = createAzureDevOpsWebhookHandler(tickets);

  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: (origin) => {
        const allowed = [env.WEB_ORIGIN, env.BETTER_AUTH_URL];
        if (!origin || allowed.includes(origin)) {
          return origin ?? env.WEB_ORIGIN;
        }
        return env.WEB_ORIGIN;
      },
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    }),
  );

  app.use("*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  });

  app.use("*", createApiTokenMiddleware(db));

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/docs/agent-loop", async (c) => {
    try {
      const markdown = await readFile(resolve(repoRoot, "docs/agent-loop.md"), "utf8");
      return c.text(markdown, 200, {
        "Content-Type": "text/markdown; charset=utf-8",
      });
    } catch {
      return c.text("Agent loop documentation is not available.", 404);
    }
  });

  app.get("/api/auth/config", async (c) => {
    const policy = await resolveSignupPolicy(db);
    return c.json(buildPublicAuthConfig(policy));
  });

  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.get("/api/session", (c) => {
    const user = c.get("user");
    const session = c.get("session");
    if (!user || !session) {
      return c.json({ user: null, session: null });
    }
    return c.json({
      user: {
        ...user,
        isAdmin: isAdmin(user),
      },
      session,
    });
  });

  app.get("/api/projects", async (c) => {
    return c.json({ projects: await tickets.listProjects() });
  });

  app.post("/api/projects", async (c) => {
    const authResult = authorizeUser(c.get("user"));
    if (!authResult.ok) {
      return c.json({ error: authResult.error }, authResult.status);
    }

    const body = createProjectSchema.parse(await c.req.json());
    const project = await tickets.createProject(body);
    return c.json({ project }, 201);
  });

  app.get("/api/instance/settings", async (c) => {
    const settings = await instance.getSettings();
    return c.json({ settings });
  });

  app.patch("/api/instance/settings", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const body = updateInstanceSettingsSchema.parse(await c.req.json());
    if (body.defaultProjectSlug) {
      const project = await tickets.resolveProject({ projectSlug: body.defaultProjectSlug });
      if (!project) {
        return c.json({ error: `Unknown project slug: ${body.defaultProjectSlug}` }, 400);
      }
    }
    const settings = await instance.updateSettings(body);
    void tickets.syncAllStoredBriefs().catch((error) => {
      console.error("Failed to refresh ticket briefs after instance settings update", error);
    });
    return c.json({ settings });
  });

  app.get("/api/instance/agent-directives", async (c) => {
    const auth = authorizeUser(c.get("user"));
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const templates = await agentDirectives.listTemplates();
    return c.json({ templates });
  });

  app.get("/api/instance/agent-directives/:templateId", async (c) => {
    const auth = authorizeUser(c.get("user"));
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }
    const template = await agentDirectives.getTemplate(c.req.param("templateId"));
    if (!template) {
      return c.json({ error: "Directive template not found" }, 404);
    }
    return c.json({ template });
  });

  app.patch("/api/instance/agent-directives/:templateId", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const body = z
      .object({
        title: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        priority: z.enum(["mandatory", "recommended"]).optional(),
      })
      .parse(await c.req.json());

    try {
      const template = await agentDirectives.updateTemplateOverride(c.req.param("templateId"), body);
      return c.json({ template });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update directive";
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/api/instance/agent-directives/:templateId", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    try {
      const template = await agentDirectives.resetTemplateOverride(c.req.param("templateId"));
      if (!template) {
        return c.json({ error: "Directive template not found" }, 404);
      }
      return c.json({ template });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset directive";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/instance/signup-policy", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    return c.json(await getSignupPolicySettings(db));
  });

  app.patch("/api/instance/signup-policy", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const body = z.object({ allowPublicSignup: z.boolean() }).parse(await c.req.json());
    await updateSignupAllowPublic(db, body.allowPublicSignup);
    return c.json(await getSignupPolicySettings(db));
  });

  app.post("/api/instance/signup-allowlist", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const body = z
      .object({
        kind: z.enum(["email", "domain"]),
        value: z.string().min(1),
      })
      .parse(await c.req.json());

    try {
      const entry = await addSignupAllowlistEntry(db, body.kind, body.value);
      return c.json({ entry, ...(await getSignupPolicySettings(db)) }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to add allowlist entry";
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/api/instance/signup-allowlist/:id", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const entry = await removeSignupAllowlistEntry(db, c.req.param("id"));
    if (!entry) {
      return c.json({ error: "Allowlist entry not found" }, 404);
    }

    return c.json({ entry, ...(await getSignupPolicySettings(db)) });
  });

  app.get("/api/users", async (c) => {
    const authResult = authorizeUser(c.get("user"), { admin: true });
    if (!authResult.ok) {
      return c.json({ error: authResult.error }, authResult.status);
    }

    return c.json({ users: await users.listUsers() });
  });

  app.patch("/api/users/:id/role", async (c) => {
    const authResult = authorizeUser(c.get("user"), { admin: true });
    if (!authResult.ok) {
      return c.json({ error: authResult.error }, authResult.status);
    }

    const body = updateUserRoleSchema.parse(await c.req.json());
    try {
      const user = await users.updateUserRole(c.req.param("id"), body.role);
      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }
      invalidateApiTokenUserCache();
      return c.json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update user role";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/knowledge-refs", async (c) => {
    const scope = z.enum(["instance", "project", "ticket"]).parse(c.req.query("scope"));
    const projectId = c.req.query("projectId") ?? undefined;
    const ticketId = c.req.query("ticketId") ?? undefined;
    const refs = await knowledge.listRefs({ scope, projectId, ticketId });
    return c.json({ refs });
  });

  app.post("/api/knowledge-refs", async (c) => {
    const body = createKnowledgeRefSchema.parse(await c.req.json());
    const auth = authorizeUser(c.get("user"), {
      admin: body.scope === "instance" || body.scope === "project",
    });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const ref = await knowledge.createRef(body);
    if (body.scope === "ticket" && body.ticketId) {
      void tickets.syncStoredBrief(body.ticketId).catch((error) => {
        console.error("Failed to refresh ticket brief after knowledge ref create", error);
      });
    } else if (body.scope === "project" && body.projectId) {
      void tickets.syncStoredBriefsForProject(body.projectId).catch((error) => {
        console.error("Failed to refresh project ticket briefs after knowledge ref create", error);
      });
    } else {
      void tickets.syncAllStoredBriefs().catch((error) => {
        console.error("Failed to refresh ticket briefs after knowledge ref create", error);
      });
    }
    return c.json({ ref }, 201);
  });

  app.delete("/api/knowledge-refs/:id", async (c) => {
    const existing = await knowledge.getRef(c.req.param("id"));
    if (!existing) {
      return c.json({ error: "Knowledge ref not found" }, 404);
    }

    const auth = authorizeUser(c.get("user"), {
      admin: existing.scope === "instance" || existing.scope === "project",
    });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const ref = await knowledge.deleteRef(c.req.param("id"));
    if (!ref) {
      return c.json({ error: "Knowledge ref not found" }, 404);
    }
    if (ref.scope === "ticket" && ref.ticketId) {
      void tickets.syncStoredBrief(ref.ticketId).catch((error) => {
        console.error("Failed to refresh ticket brief after knowledge ref delete", error);
      });
    } else if (ref.scope === "project" && ref.projectId) {
      void tickets.syncStoredBriefsForProject(ref.projectId).catch((error) => {
        console.error("Failed to refresh project ticket briefs after knowledge ref delete", error);
      });
    } else {
      void tickets.syncAllStoredBriefs().catch((error) => {
        console.error("Failed to refresh ticket briefs after knowledge ref delete", error);
      });
    }
    return c.json({ ref });
  });

  app.patch("/api/projects/:id/agent-context", async (c) => {
    const auth = authorizeUser(c.get("user"), { admin: true });
    if (!auth.ok) {
      return c.json({ error: auth.error }, auth.status);
    }

    const body = updateProjectContextSchema.parse(await c.req.json());
    const project = await knowledge.updateProjectAgentContext(c.req.param("id"), body.agentContext);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    void tickets.syncStoredBriefsForProject(project.id).catch((error) => {
      console.error("Failed to refresh ticket briefs after project context update", error);
    });
    return c.json({ project });
  });

  app.get("/api/tickets", async (c) => {
    const projectSlug = c.req.query("projectSlug") ?? undefined;
    const status = c.req.query("status") ?? undefined;
    return c.json({ tickets: await tickets.listTickets({ projectSlug, status }) });
  });

  app.post("/api/tickets", async (c) => {
    const user = c.get("user");
    try {
      const body = createTicketSchema.parse(await c.req.json());
      const ticket = await tickets.createTicket({
        ...body,
        createdById: user?.id ?? null,
      });
      return c.json({ ticket }, 201);
    } catch (error) {
      if (error instanceof IntakeValidationError) {
        return c.json({ error: error.message, issues: error.issues }, 422);
      }
      throw error;
    }
  });

  app.get("/api/tickets/:ref", async (c) => {
    const context = await tickets.getTicketContext(c.req.param("ref"));
    if (!context) {
      return c.json({ error: "Ticket not found" }, 404);
    }
    const templateOverrides = await agentDirectives.getOverrides();
    const agentDirective = resolveAgentDirective(
      MCP_TOOL_NAMES.getTaskContext,
      {
        ticketKey: context.ticketKey,
        status: context.ticket.status,
      },
      { templateOverrides },
    );
    return c.json({ ...context, agentDirective });
  });

  app.patch("/api/tickets/:ref/status", async (c) => {
    const body = updateStatusSchema.parse(await c.req.json());
    const ticket = await tickets.updateTicketStatus(c.req.param("ref"), body.status);
    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }
    return c.json({ ticket });
  });

  app.post("/api/tickets/:ref/claim", async (c) => {
    try {
      const body = z
        .object({ agentId: z.string().min(1) })
        .parse(await c.req.json().catch(() => ({ agentId: "agent" })));
      const ticket = await tickets.claimTicket(c.req.param("ref"), body.agentId);
      if (!ticket) {
        return c.json({ error: "Ticket not found" }, 404);
      }
      return c.json({ ticket });
    } catch (error) {
      if (error instanceof ClaimNotAllowedError) {
        return c.json({ error: error.message }, 409);
      }
      throw error;
    }
  });

  app.post("/api/tickets/:ref/complete", async (c) => {
    const body = z.object({ summary: z.string().optional() }).parse(await c.req.json().catch(() => ({})));
    const ticket = await tickets.completeTicket(c.req.param("ref"), body.summary);
    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }
    return c.json({ ticket });
  });

  app.get("/api/tickets/:ref/comments", async (c) => {
    const ticket = await tickets.resolveTicket(c.req.param("ref"));
    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }
    const comments = await tickets.listTicketComments(ticket.id);
    return c.json({ comments });
  });

  app.post("/api/tickets/:ref/comments", async (c) => {
    const body = z
      .object({
        body: z.string().min(1),
        agentId: z.string().optional(),
        kind: z.enum(["comment", "agent_comment", "clarification_request"]).optional(),
      })
      .parse(await c.req.json());
    const user = c.get("user");
    const result = await tickets.addTicketComment(c.req.param("ref"), {
      body: body.body,
      authorId: user?.id ?? null,
      agentId: body.agentId,
      kind: body.kind,
    });
    if (!result) {
      return c.json({ error: "Ticket not found" }, 404);
    }
    return c.json(result, 201);
  });

  app.patch("/api/tickets/:ref", async (c) => {
    const body = updateTicketSchema.parse(await c.req.json());
    const ticket = await tickets.updateTicket(c.req.param("ref"), body);
    if (!ticket) {
      return c.json({ error: "Ticket not found" }, 404);
    }
    return c.json({ ticket });
  });

  app.post("/api/tickets/:ref/link-pull-request", async (c) => {
    const body = linkPullRequestSchema.parse(await c.req.json());
    try {
      const ticket = await tickets.linkPullRequest(c.req.param("ref"), body, c.get("user")?.id);
      if (!ticket) {
        return c.json({ error: "Ticket not found" }, 404);
      }
      return c.json({ ticket });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to link pull request";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/api/tickets/:ref/create-pull-request", async (c) => {
    const body = createPullRequestSchema.parse(await c.req.json());
    try {
      const result = await tickets.createPullRequestForTicket(c.req.param("ref"), body, c.get("user")?.id);
      if (!result?.ticket) {
        return c.json({ error: "Ticket not found" }, 404);
      }
      return c.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create pull request";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/mcp/config", async (c) => {
    return c.json({
      config: buildMcpPublicConfig({
        webOrigin: env.WEB_ORIGIN,
        apiTokenConfigured: Boolean(env.AIKANBAN_API_TOKEN),
      }),
    });
  });

  app.get("/api/agent/integration", async (c) => {
    const user = c.get("user");
    const config = buildMcpPublicConfig({
      webOrigin: env.WEB_ORIGIN,
      apiTokenConfigured: Boolean(env.AIKANBAN_API_TOKEN),
    });
    return c.json({
      mcpUrl: config.mcpUrl,
      apiTokenConfigured: config.auth.configured,
      tools: config.tools,
      isAdmin: isAdmin(user),
      clients: config.clients,
    });
  });

  app.get("/api/connections/oauth/config", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json({ oauth: getProviderOAuthAvailability() });
  });

  app.get("/api/connections/oauth/:provider/start", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const provider = sourceProviderIdSchema.parse(c.req.param("provider"));
    if (provider === "gitlab") {
      return c.json({ error: "GitLab OAuth is not available yet" }, 501);
    }

    const availability = getProviderOAuthAvailability();
    if (provider === "github" && !availability.github) {
      return c.json({ error: "GitHub OAuth is not configured on this instance" }, 503);
    }
    if (provider === "azure_devops" && !availability.azure_devops) {
      return c.json({ error: "Microsoft OAuth is not configured on this instance" }, 503);
    }

    const organization = c.req.query("organization") ?? undefined;
    if (provider === "azure_devops" && !organization?.trim()) {
      return c.json({ error: "Azure DevOps organization is required" }, 400);
    }

    try {
      const state = createProviderOAuthState({
        userId: user.id,
        provider,
        organization: organization?.trim(),
      });
      const authorizeUrl = buildProviderAuthorizeUrl(provider, state, { organization: organization?.trim() });
      return c.redirect(authorizeUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start OAuth";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/connections/oauth/:provider/callback", async (c) => {
    const provider = sourceProviderIdSchema.parse(c.req.param("provider"));
    const code = c.req.query("code");
    const stateRaw = c.req.query("state");
    const oauthError = c.req.query("error");

    if (oauthError) {
      return c.redirect(`${env.WEB_ORIGIN}/repositories?connect_error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !stateRaw) {
      return c.redirect(`${env.WEB_ORIGIN}/repositories?connect_error=missing_code`);
    }

    const state = parseProviderOAuthState(stateRaw);
    if (!state || state.provider !== provider) {
      return c.redirect(`${env.WEB_ORIGIN}/repositories?connect_error=invalid_state`);
    }

    try {
      const tokens = await exchangeProviderOAuthCode(provider, code);
      const credentials =
        provider === "github"
          ? { kind: "github_pat" as const, accessToken: tokens.accessToken }
          : {
              kind: "azure_devops_pat" as const,
              organization: state.organization ?? "",
              accessToken: tokens.accessToken,
            };

      await connections.createConnection(state.userId, provider, credentials);
      return c.redirect(`${env.WEB_ORIGIN}/repositories?connected=${provider}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "oauth_failed";
      return c.redirect(`${env.WEB_ORIGIN}/repositories?connect_error=${encodeURIComponent(message)}`);
    }
  });

  app.get("/api/providers", async (c) => {
    return c.json({ providers: connections.listProviders() });
  });

  app.get("/api/connections", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json({ connections: await connections.listConnections(user.id) });
  });

  app.post("/api/connections", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = connectProviderSchema.parse(await c.req.json());
    try {
      const credentials =
        body.provider === "github"
          ? { kind: "github_pat" as const, accessToken: body.accessToken }
          : body.provider === "azure_devops"
            ? {
                kind: "azure_devops_pat" as const,
                organization: body.organization ?? "",
                accessToken: body.accessToken,
              }
            : {
                kind: "gitlab_pat" as const,
                accessToken: body.accessToken,
                baseUrl: body.baseUrl,
              };

      const connection = await connections.createConnection(user.id, body.provider, credentials);
      return c.json({ connection }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to connect provider";
      return c.json({ error: message }, 400);
    }
  });

  app.delete("/api/connections/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const connection = await connections.deleteConnection(c.req.param("id"), user.id);
    if (!connection) {
      return c.json({ error: "Connection not found" }, 404);
    }
    return c.json({ connection });
  });

  app.get("/api/connections/:id/repositories", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const remoteRepositories = await connections.listRemoteRepositories(c.req.param("id"), user.id);
      if (!remoteRepositories) {
        return c.json({ error: "Connection not found" }, 404);
      }
      return c.json({ repositories: remoteRepositories });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list remote repositories";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/repositories", async (c) => {
    const projectId = c.req.query("projectId") ?? undefined;
    return c.json({ repositories: await repos.listRepositories(projectId) });
  });

  app.get("/api/repositories/:id", async (c) => {
    const repository = await repos.getRepository(c.req.param("id"));
    if (!repository) {
      return c.json({ error: "Repository not found" }, 404);
    }
    return c.json({ repository });
  });

  app.post("/api/repositories", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = createRepositorySchema.parse(await c.req.json());
    const repository = await repos.createRepository(body);
    return c.json({ repository }, 201);
  });

  app.post("/api/repositories/import", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = importRepositorySchema.parse(await c.req.json());
    try {
      const repository = await repos.importRemoteRepository({
        ...body,
        userId: user.id,
      });
      return c.json({ repository }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to import repository";
      return c.json({ error: message }, 400);
    }
  });

  app.get("/api/repositories/:id/activity", async (c) => {
    const user = c.get("user");
    const refresh = c.req.query("refresh") === "true";

    try {
      const activity = await repos.getRepositoryActivity(c.req.param("id"), user?.id, refresh);
      if (!activity) {
        return c.json({ error: "Activity not available" }, 404);
      }
      return c.json({ activity });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch activity";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/api/repositories/:id/sync", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const activity = await repos.syncRepositoryActivity(c.req.param("id"), user.id);
      const repository = await repos.getRepository(c.req.param("id"));
      return c.json({ repository, activity });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      return c.json({ error: message }, 400);
    }
  });

  app.patch("/api/repositories/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = updateRepositorySchema.parse(await c.req.json());
    const repository = await repos.updateRepository(c.req.param("id"), body);
    if (!repository) {
      return c.json({ error: "Repository not found" }, 404);
    }
    return c.json({ repository });
  });

  app.delete("/api/repositories/:id", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const repository = await repos.deleteRepository(c.req.param("id"));
    if (!repository) {
      return c.json({ error: "Repository not found" }, 404);
    }
    return c.json({ repository });
  });

  app.post("/api/repositories/:id/scan", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    try {
      const repository = await repos.scanRepository(c.req.param("id"));
      if (!repository) {
        return c.json({ error: "Repository not found" }, 404);
      }
      return c.json({ repository, message: "Scan queued" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan failed";
      return c.json({ error: message }, 400);
    }
  });

  app.post("/api/webhooks/github", async (c) => {
    try {
      const rawBody = await c.req.raw.text();
      const result = await githubWebhook.handle(
        rawBody,
        c.req.header("x-hub-signature-256"),
        env.GITHUB_WEBHOOK_SECRET,
      );
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook handling failed";
      const status = message.includes("signature") ? 401 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post("/api/webhooks/azure-devops", async (c) => {
    try {
      const rawBody = await c.req.raw.text();
      const result = await azureDevOpsWebhook.handle(
        rawBody,
        c.req.query("token"),
        env.AZURE_DEVOPS_WEBHOOK_SECRET,
      );
      return c.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook handling failed";
      const status = message.includes("secret") ? 401 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post("/mcp", async (c) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const incoming = c.env.incoming;
    const outgoing = c.env.outgoing;

    outgoing.on("close", () => {
      void transport.close();
    });

    await mcpServer.connect(transport);

    const body = c.req.method === "POST" ? await c.req.json().catch(() => undefined) : undefined;

    if (mcpRequestRequiresWriteAuth(body)) {
      try {
        assertMcpWriteAuthorized(c.req.header("Authorization"));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const id =
          typeof body === "object" && body !== null && "id" in body
            ? (body as { id?: string | number }).id
            : null;
        return c.json(
          {
            jsonrpc: "2.0",
            error: { code: -32001, message },
            id,
          },
          401,
        );
      }
    }

    await transport.handleRequest(incoming, outgoing, body);

    return c.body(null);
  });

  if (existsSync("./static")) {
    app.use("*", serveStatic({ root: "./static" }));
    app.get("*", serveStatic({ path: "./static/index.html" }));
  }

  return app;
}

export type AppType = ReturnType<typeof createApp>;
