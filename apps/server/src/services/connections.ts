import type { Database } from "@ai-kanban/db";
import { providerConnections } from "@ai-kanban/db/schema";
import {
  credentialsForProvider,
  getSourceProvider,
  listSourceProviders,
  type ProviderCredentials,
  type SourceProviderId,
} from "@ai-kanban/integrations";
import { and, asc, eq, isNull } from "drizzle-orm";

export type PublicConnection = {
  id: string;
  provider: SourceProviderId;
  accountLogin: string;
  accountDisplayName: string | null;
  externalAccountId: string;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicConnection(row: typeof providerConnections.$inferSelect): PublicConnection {
  return {
    id: row.id,
    provider: row.provider,
    accountLogin: row.accountLogin,
    accountDisplayName: row.accountDisplayName,
    externalAccountId: row.externalAccountId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createConnectionService(db: Database) {
  async function listConnections(userId: string) {
    const rows = await db
      .select()
      .from(providerConnections)
      .where(and(eq(providerConnections.userId, userId), isNull(providerConnections.deletedAt)))
      .orderBy(asc(providerConnections.accountLogin));

    return rows.map(toPublicConnection);
  }

  async function getConnectionForUser(connectionId: string, userId: string) {
    const [row] = await db
      .select()
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.id, connectionId),
          eq(providerConnections.userId, userId),
          isNull(providerConnections.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async function getConnectionCredentials(connectionId: string, userId: string) {
    const connection = await getConnectionForUser(connectionId, userId);
    if (!connection) {
      return null;
    }

    return {
      connection,
      credentials: credentialsForProvider(connection.provider, connection.credentials as ProviderCredentials),
    };
  }

  async function getConnectionCredentialsInternal(connectionId: string) {
    const [connection] = await db
      .select()
      .from(providerConnections)
      .where(and(eq(providerConnections.id, connectionId), isNull(providerConnections.deletedAt)))
      .limit(1);

    if (!connection) {
      return null;
    }

    return {
      connection,
      credentials: credentialsForProvider(connection.provider, connection.credentials as ProviderCredentials),
    };
  }

  async function createConnection(userId: string, provider: SourceProviderId, credentials: ProviderCredentials) {
    const parsed = credentialsForProvider(provider, credentials);
    const adapter = getSourceProvider(provider);
    const account = await adapter.validateConnection(parsed);

    const [existing] = await db
      .select()
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.userId, userId),
          eq(providerConnections.provider, provider),
          eq(providerConnections.externalAccountId, account.externalAccountId),
          isNull(providerConnections.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(providerConnections)
        .set({
          accountLogin: account.login,
          accountDisplayName: account.displayName,
          credentials: parsed as typeof providerConnections.$inferInsert.credentials,
        })
        .where(eq(providerConnections.id, existing.id))
        .returning();

      return toPublicConnection(updated!);
    }

    const [created] = await db
      .insert(providerConnections)
      .values({
        userId,
        provider,
        accountLogin: account.login,
        accountDisplayName: account.displayName,
        externalAccountId: account.externalAccountId,
        credentials: parsed as typeof providerConnections.$inferInsert.credentials,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create provider connection");
    }

    return toPublicConnection(created);
  }

  async function deleteConnection(connectionId: string, userId: string) {
    const [deleted] = await db
      .update(providerConnections)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(providerConnections.id, connectionId),
          eq(providerConnections.userId, userId),
          isNull(providerConnections.deletedAt),
        ),
      )
      .returning();

    return deleted ? toPublicConnection(deleted) : null;
  }

  async function listRemoteRepositories(connectionId: string, userId: string) {
    const resolved = await getConnectionCredentials(connectionId, userId);
    if (!resolved) {
      return null;
    }

    const adapter = getSourceProvider(resolved.connection.provider);
    const repositories = await adapter.listRepositories(resolved.credentials);
    return repositories;
  }

  return {
    listProviders: listSourceProviders,
    listConnections,
    getConnectionForUser,
    getConnectionCredentials,
    getConnectionCredentialsInternal,
    createConnection,
    deleteConnection,
    listRemoteRepositories,
  };
}

export type ConnectionService = ReturnType<typeof createConnectionService>;
