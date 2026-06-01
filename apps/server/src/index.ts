import { serve } from "@hono/node-server";
import { createDatabase } from "@ai-kanban/db";
import { env } from "@ai-kanban/env/server";
import { createAuth } from "./auth";
import { createApp } from "./app";
import { startScheduler } from "./scheduler";
import { createConnectionService } from "./services/connections";
import { createInstanceService, createKnowledgeService } from "./services/knowledge";
import { createRepositoryService } from "./services/repositories";
import { createTicketService } from "./services/tickets";
import { createUserService } from "./services/users";

const { db } = await createDatabase(env.DATABASE_URL);
const auth = createAuth(db);
const connections = createConnectionService(db);
const repos = createRepositoryService(db, connections);
const instance = createInstanceService(db);
const knowledge = createKnowledgeService(db);
const users = createUserService(db);
const tickets = createTicketService(db, repos, knowledge, instance);

const existingProjects = await tickets.listProjects();
if (existingProjects.length === 0) {
  await tickets.createProject({
    name: "Default Project",
    slug: "default",
    description: "Starter project for AI Kanban",
  });
}

const app = createApp(db, auth, tickets, repos, connections, instance, knowledge, users);

startScheduler(db, tickets);

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`AI Kanban listening on http://localhost:${info.port}`);
  },
);
