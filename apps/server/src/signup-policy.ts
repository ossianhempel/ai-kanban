import { asc, count, eq, and } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { schema, type Database } from "@ai-kanban/db";
import type { SignupAllowlistKind } from "@ai-kanban/db/schema";
import { env } from "@ai-kanban/env/server";

export type SignupMode = "bootstrap" | "open" | "allowlist" | "closed";

export type SignupPolicy = {
  enabled: boolean;
  mode: SignupMode;
  hint: string | null;
};

export type SignupAllowlistEntry = {
  id: string;
  kind: SignupAllowlistKind;
  value: string;
  createdAt: Date;
};

export type SignupPolicySettings = {
  policy: SignupPolicy;
  allowPublicSignup: boolean;
  allowlist: SignupAllowlistEntry[];
  envFallback: {
    allowPublicSignup: boolean;
    allowedEmails: string[];
    allowedDomains: string[];
  };
};

function parseCsv(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^@/, "").toLowerCase();
}

function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

function envAllowedEmails(): string[] {
  return parseCsv(env.SIGNUP_ALLOWED_EMAILS).map(normalizeEmail);
}

function envAllowedDomains(): string[] {
  return parseCsv(env.SIGNUP_ALLOWED_DOMAINS).map(normalizeDomain);
}

async function getInstanceSettingsRow(db: Database) {
  const [row] = await db.select().from(schema.instanceSettings).limit(1);
  if (row) {
    return row;
  }

  const [created] = await db.insert(schema.instanceSettings).values({ agentPlaybook: "" }).returning();
  return created!;
}

export async function getUserCount(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(schema.user);
  return Number(row?.value ?? 0);
}

async function listAllowlistEntries(db: Database): Promise<SignupAllowlistEntry[]> {
  const rows = await db
    .select({
      id: schema.signupAllowlist.id,
      kind: schema.signupAllowlist.kind,
      value: schema.signupAllowlist.value,
      createdAt: schema.signupAllowlist.createdAt,
    })
    .from(schema.signupAllowlist)
    .orderBy(asc(schema.signupAllowlist.createdAt));

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind as SignupAllowlistKind,
    value: row.value,
    createdAt: row.createdAt,
  }));
}

async function mergedAllowlist(db: Database) {
  const entries = await listAllowlistEntries(db);
  const dbEmails = entries.filter((entry) => entry.kind === "email").map((entry) => normalizeEmail(entry.value));
  const dbDomains = entries.filter((entry) => entry.kind === "domain").map((entry) => normalizeDomain(entry.value));

  return {
    emails: [...new Set([...dbEmails, ...envAllowedEmails()])],
    domains: [...new Set([...dbDomains, ...envAllowedDomains()])],
    entries,
  };
}

async function isPublicSignupEnabled(db: Database): Promise<boolean> {
  const settings = await getInstanceSettingsRow(db);
  return settings.signupAllowPublic || env.ALLOW_PUBLIC_SIGNUP;
}

export function isEmailOnAllowlist(
  email: string,
  allowlist: { emails: string[]; domains: string[] },
): boolean {
  const normalized = normalizeEmail(email);
  const domain = emailDomain(normalized);

  if (allowlist.emails.includes(normalized)) {
    return true;
  }

  return allowlist.domains.some((allowedDomain) => domain === allowedDomain);
}

export async function resolveSignupPolicy(db: Database): Promise<SignupPolicy> {
  const existingUserCount = await getUserCount(db);

  if (existingUserCount === 0) {
    return {
      enabled: true,
      mode: "bootstrap",
      hint: "Create the first admin account for this instance.",
    };
  }

  if (await isPublicSignupEnabled(db)) {
    return {
      enabled: true,
      mode: "open",
      hint: null,
    };
  }

  const allowlist = await mergedAllowlist(db);
  if (allowlist.emails.length > 0 || allowlist.domains.length > 0) {
    return {
      enabled: true,
      mode: "allowlist",
      hint: "Sign-up is limited to approved email addresses or domains.",
    };
  }

  return {
    enabled: false,
    mode: "closed",
    hint: "Sign-up is disabled on this instance. Ask an admin to add your email or domain.",
  };
}

export async function getSignupPolicySettings(db: Database): Promise<SignupPolicySettings> {
  const settings = await getInstanceSettingsRow(db);
  const allowlist = await mergedAllowlist(db);
  const policy = await resolveSignupPolicy(db);

  return {
    policy,
    allowPublicSignup: settings.signupAllowPublic,
    allowlist: allowlist.entries,
    envFallback: {
      allowPublicSignup: env.ALLOW_PUBLIC_SIGNUP,
      allowedEmails: envAllowedEmails(),
      allowedDomains: envAllowedDomains(),
    },
  };
}

export async function updateSignupAllowPublic(db: Database, allowPublicSignup: boolean) {
  const current = await getInstanceSettingsRow(db);
  const [updated] = await db
    .update(schema.instanceSettings)
    .set({ signupAllowPublic: allowPublicSignup })
    .where(eq(schema.instanceSettings.id, current.id))
    .returning();

  return updated ?? current;
}

function normalizeAllowlistValue(kind: SignupAllowlistKind, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Value is required");
  }

  if (kind === "email") {
    const normalized = normalizeEmail(trimmed);
    if (!normalized.includes("@")) {
      throw new Error("Enter a valid email address");
    }
    return normalized;
  }

  return normalizeDomain(trimmed);
}

export async function addSignupAllowlistEntry(db: Database, kind: SignupAllowlistKind, rawValue: string) {
  const value = normalizeAllowlistValue(kind, rawValue);

  const [created] = await db
    .insert(schema.signupAllowlist)
    .values({ kind, value })
    .onConflictDoNothing()
    .returning({
      id: schema.signupAllowlist.id,
      kind: schema.signupAllowlist.kind,
      value: schema.signupAllowlist.value,
      createdAt: schema.signupAllowlist.createdAt,
    });

  if (!created) {
    const [existing] = await db
      .select({
        id: schema.signupAllowlist.id,
        kind: schema.signupAllowlist.kind,
        value: schema.signupAllowlist.value,
        createdAt: schema.signupAllowlist.createdAt,
      })
      .from(schema.signupAllowlist)
      .where(and(eq(schema.signupAllowlist.kind, kind), eq(schema.signupAllowlist.value, value)))
      .limit(1);

    if (!existing) {
      throw new Error("Failed to add allowlist entry");
    }

    return existing as SignupAllowlistEntry;
  }

  return created as SignupAllowlistEntry;
}

export async function removeSignupAllowlistEntry(db: Database, entryId: string) {
  const [deleted] = await db
    .delete(schema.signupAllowlist)
    .where(eq(schema.signupAllowlist.id, entryId))
    .returning({
      id: schema.signupAllowlist.id,
      kind: schema.signupAllowlist.kind,
      value: schema.signupAllowlist.value,
      createdAt: schema.signupAllowlist.createdAt,
    });

  return (deleted as SignupAllowlistEntry | undefined) ?? null;
}

export async function assertSignupAllowed(db: Database, email: string) {
  const existingUserCount = await getUserCount(db);

  if (existingUserCount === 0) {
    return;
  }

  const policy = await resolveSignupPolicy(db);

  if (policy.mode === "open") {
    return;
  }

  if (policy.mode === "allowlist") {
    const allowlist = await mergedAllowlist(db);
    if (isEmailOnAllowlist(email, allowlist)) {
      return;
    }
  }

  throw new APIError("FORBIDDEN", {
    message:
      policy.mode === "closed"
        ? "Sign-up is disabled on this instance."
        : "This email is not on the sign-up allowlist for this instance.",
  });
}
