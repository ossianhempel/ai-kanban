import { asc, count, eq } from "drizzle-orm";
import type { Database } from "@ai-kanban/db";
import { schema } from "@ai-kanban/db";
import type { UserRole } from "@ai-kanban/db/schema";

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
};

export function createUserService(db: Database) {
  async function listUsers(): Promise<UserSummary[]> {
    const rows = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
      })
      .from(schema.user)
      .orderBy(asc(schema.user.createdAt));

    return rows.map((row) => ({
      ...row,
      role: row.role as UserRole,
    }));
  }

  async function getUser(userId: string): Promise<UserSummary | null> {
    const [row] = await db
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1);

    if (!row) {
      return null;
    }

    return { ...row, role: row.role as UserRole };
  }

  async function countAdmins(): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(schema.user)
      .where(eq(schema.user.role, "admin"));
    return Number(row?.value ?? 0);
  }

  async function updateUserRole(userId: string, role: UserRole): Promise<UserSummary | null> {
    const existing = await getUser(userId);
    if (!existing) {
      return null;
    }

    if (existing.role === "admin" && role === "member") {
      const admins = await countAdmins();
      if (admins <= 1) {
        throw new Error("Cannot demote the last instance admin");
      }
    }

    const [updated] = await db
      .update(schema.user)
      .set({ role })
      .where(eq(schema.user.id, userId))
      .returning({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
      });

    if (!updated) {
      return null;
    }

    return { ...updated, role: updated.role as UserRole };
  }

  return {
    listUsers,
    getUser,
    updateUserRole,
  };
}

export type UserService = ReturnType<typeof createUserService>;
