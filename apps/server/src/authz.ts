import { eq } from "drizzle-orm";
import { schema, type Database } from "@ai-kanban/db";
import type { UserRole } from "@ai-kanban/db/schema";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: UserRole | string | null;
};

export function isAdmin(user: SessionUser | null | undefined): boolean {
  return user?.role === "admin";
}

export function authorizeUser(user: SessionUser | null, options?: { admin?: boolean }) {
  if (!user) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  if (options?.admin && !isAdmin(user)) {
    return { ok: false as const, status: 403 as const, error: "Forbidden — instance admin required" };
  }
  return { ok: true as const, user };
}

export async function promoteFirstUserToAdmin(db: Database, userId: string) {
  const admins = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"))
    .limit(1);

  if (admins.length === 0) {
    await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, userId));
  }
}
