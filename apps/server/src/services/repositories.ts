import type { Database } from "@ai-kanban/db";
import { projects, repositories } from "@ai-kanban/db/schema";
import { enqueueJob } from "@ai-kanban/core";
import {
  getSourceProvider,
  type RemoteRepositoryRef,
  type RepositoryActivity,
  type SourceProviderId,
} from "@ai-kanban/integrations";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { ConnectionService } from "./connections";

function toRepositoryRef(row: typeof repositories.$inferSelect): RemoteRepositoryRef | null {
  if (!row.externalId || !row.owner || !row.repoName || !row.fullName) {
    return null;
  }

  return {
    externalId: row.externalId,
    owner: row.owner,
    name: row.repoName,
    fullName: row.fullName,
    defaultBranch: row.defaultBranch,
    project:
      row.provider === "azure_devops" && row.fullName.includes("/")
        ? row.fullName.split("/")[0] ?? null
        : null,
  };
}

export function createRepositoryService(db: Database, connections: ConnectionService) {
  async function listRepositories(projectId?: string) {
    const conditions = [isNull(repositories.deletedAt)];

    if (projectId) {
      conditions.push(eq(repositories.projectId, projectId));
    }

    const rows = await db
      .select({ repository: repositories, project: projects })
      .from(repositories)
      .innerJoin(projects, eq(repositories.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(asc(repositories.name));

    return rows.map((row) => ({
      ...row.repository,
      project: row.project,
    }));
  }

  async function getRepository(id: string) {
    const [row] = await db
      .select({ repository: repositories, project: projects })
      .from(repositories)
      .innerJoin(projects, eq(repositories.projectId, projects.id))
      .where(and(eq(repositories.id, id), isNull(repositories.deletedAt)))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      ...row.repository,
      project: row.project,
    };
  }

  async function createRepository(input: {
    projectId: string;
    name: string;
    url?: string | null;
    localPath?: string | null;
    defaultBranch?: string;
  }) {
    const [repository] = await db
      .insert(repositories)
      .values({
        projectId: input.projectId,
        name: input.name,
        url: input.url ?? null,
        localPath: input.localPath ?? null,
        defaultBranch: input.defaultBranch ?? "main",
      })
      .returning();

    if (!repository) {
      throw new Error("Failed to create repository");
    }

    if (repository.localPath) {
      await enqueueJob(db, "scan_repository", { repositoryId: repository.id });
    }

    return getRepository(repository.id);
  }

  async function importRemoteRepository(input: {
    projectId: string;
    connectionId: string;
    userId: string;
    externalId: string;
    localPath?: string | null;
  }) {
    const resolved = await connections.getConnectionCredentials(input.connectionId, input.userId);
    if (!resolved) {
      throw new Error("Connection not found");
    }

    const adapter = getSourceProvider(resolved.connection.provider);
    const remote = await adapter.getRepository(resolved.credentials, input.externalId);

    const [existing] = await db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.projectId, input.projectId),
          eq(repositories.connectionId, input.connectionId),
          eq(repositories.externalId, remote.externalId),
          isNull(repositories.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(repositories)
        .set({
          name: remote.name,
          url: remote.htmlUrl,
          owner: remote.owner,
          repoName: remote.name,
          fullName: remote.fullName,
          visibility: remote.visibility,
          defaultBranch: remote.defaultBranch,
          localPath: input.localPath ?? existing.localPath,
        })
        .where(eq(repositories.id, existing.id))
        .returning();

      if (updated) {
        await syncRepositoryActivity(updated.id, input.userId);
      }

      return getRepository(existing.id);
    }

    const [repository] = await db
      .insert(repositories)
      .values({
        projectId: input.projectId,
        connectionId: input.connectionId,
        provider: resolved.connection.provider,
        externalId: remote.externalId,
        owner: remote.owner,
        repoName: remote.name,
        fullName: remote.fullName,
        visibility: remote.visibility,
        name: remote.name,
        url: remote.htmlUrl,
        localPath: input.localPath ?? null,
        defaultBranch: remote.defaultBranch,
      })
      .returning();

    if (!repository) {
      throw new Error("Failed to import repository");
    }

    if (repository.localPath) {
      await enqueueJob(db, "scan_repository", { repositoryId: repository.id });
    }

    await syncRepositoryActivity(repository.id, input.userId);
    return getRepository(repository.id);
  }

  async function updateRepository(
    id: string,
    input: {
      name?: string;
      url?: string | null;
      localPath?: string | null;
      defaultBranch?: string;
    },
  ) {
    const [updated] = await db
      .update(repositories)
      .set({
        name: input.name,
        url: input.url,
        localPath: input.localPath,
        defaultBranch: input.defaultBranch,
      })
      .where(and(eq(repositories.id, id), isNull(repositories.deletedAt)))
      .returning();

    return updated ? getRepository(updated.id) : null;
  }

  async function deleteRepository(id: string) {
    const [deleted] = await db
      .update(repositories)
      .set({ deletedAt: new Date() })
      .where(and(eq(repositories.id, id), isNull(repositories.deletedAt)))
      .returning();

    return deleted ?? null;
  }

  async function scanRepository(id: string) {
    const repository = await getRepository(id);
    if (!repository) {
      return null;
    }

    if (!repository.localPath) {
      throw new Error("Repository has no local path configured for scanning");
    }

    await enqueueJob(db, "scan_repository", { repositoryId: id });
    return repository;
  }

  async function syncRepositoryActivity(id: string, userId?: string): Promise<RepositoryActivity | null> {
    const remote = await resolveRepositoryRemote(id, userId);
    const activity = await remote.provider.getActivity(remote.credentials, remote.ref);

    await db
      .update(repositories)
      .set({
        activitySnapshot: activity,
        lastSyncedAt: new Date(),
        defaultBranch: activity.defaultBranch,
      })
      .where(eq(repositories.id, id));

    return activity;
  }

  async function getRepositoryActivity(id: string, userId?: string, refresh = false) {
    if (refresh) {
      return syncRepositoryActivity(id, userId);
    }

    const repository = await getRepository(id);
    if (!repository) {
      return null;
    }

    if (repository.activitySnapshot) {
      return repository.activitySnapshot as RepositoryActivity;
    }

    if (repository.connectionId) {
      return syncRepositoryActivity(id, userId);
    }

    return null;
  }

  async function resolveRepositoryRemote(repositoryId: string, userId?: string) {
    const repository = await getRepository(repositoryId);
    if (!repository?.connectionId) {
      throw new Error("Ticket repository is not connected to a remote provider");
    }

    const resolved = userId
      ? await connections.getConnectionCredentials(repository.connectionId, userId)
      : await connections.getConnectionCredentialsInternal(repository.connectionId);

    if (!resolved) {
      throw new Error("Provider connection not found for this repository");
    }

    const ref = toRepositoryRef(repository);
    if (!ref) {
      throw new Error("Repository is missing remote metadata");
    }

    return {
      repository,
      ref,
      provider: getSourceProvider(resolved.connection.provider),
      credentials: resolved.credentials,
      providerId: resolved.connection.provider,
    };
  }

  async function resolveRepositoryWithConnection(repositoryId: string, userId: string) {
    return resolveRepositoryRemote(repositoryId, userId);
  }

  async function findRemoteRepository(
    provider: SourceProviderId,
    lookup: { owner: string; repoName: string; project?: string },
  ) {
    const conditions = [
      eq(repositories.provider, provider),
      eq(repositories.owner, lookup.owner),
      eq(repositories.repoName, lookup.repoName),
      isNull(repositories.deletedAt),
    ];

    if (lookup.project) {
      conditions.push(eq(repositories.fullName, `${lookup.project}/${lookup.repoName}`));
    }

    const [row] = await db
      .select({ repository: repositories, project: projects })
      .from(repositories)
      .innerJoin(projects, eq(repositories.projectId, projects.id))
      .where(and(...conditions))
      .limit(1);

    if (!row) {
      return null;
    }

    return {
      ...row.repository,
      project: row.project,
    };
  }

  return {
    listRepositories,
    getRepository,
    createRepository,
    importRemoteRepository,
    updateRepository,
    deleteRepository,
    scanRepository,
    syncRepositoryActivity,
    getRepositoryActivity,
    resolveRepositoryWithConnection,
    resolveRepositoryRemote,
    findRemoteRepository,
  };
}

export type RepositoryService = ReturnType<typeof createRepositoryService>;
