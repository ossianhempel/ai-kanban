import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { env } from "@ai-kanban/env/server";
import type { Database } from "@ai-kanban/db";
import { schema } from "@ai-kanban/db";
import { eq } from "drizzle-orm";
import type { SessionUser } from "./authz";

type ApiTokenContext = Context<{
  Variables: {
    user: SessionUser | null;
    session: unknown;
  };
}>;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

let cachedApiUser: SessionUser | null | undefined;

async function resolveApiTokenUser(db: Database): Promise<SessionUser | null> {
  if (cachedApiUser !== undefined) {
    return cachedApiUser;
  }

  const [admin] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      image: schema.user.image,
      role: schema.user.role,
    })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"))
    .limit(1);

  cachedApiUser = admin
    ? {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        image: admin.image,
        role: admin.role,
      }
    : null;

  return cachedApiUser;
}

export function createApiTokenMiddleware(db: Database) {
  return async (c: ApiTokenContext, next: Next) => {
    const configuredToken = env.AIKANBAN_API_TOKEN;
    if (!configuredToken) {
      await next();
      return;
    }

    const bearer = readBearerToken(c.req.header("Authorization"));
    if (!bearer || !safeEqual(bearer, configuredToken)) {
      await next();
      return;
    }

    if (!c.get("user")) {
      const apiUser = await resolveApiTokenUser(db);
      if (apiUser) {
        c.set("user", apiUser);
      }
    }

    await next();
  };
}

export function invalidateApiTokenUserCache() {
  cachedApiUser = undefined;
}
