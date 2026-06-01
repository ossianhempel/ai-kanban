import { count } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { schema, type Database } from "@ai-kanban/db";
import { env } from "@ai-kanban/env/server";

export type SignupMode = "bootstrap" | "open" | "allowlist" | "closed";

export type SignupPolicy = {
  enabled: boolean;
  mode: SignupMode;
  hint: string | null;
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

function emailDomain(email: string): string {
  return normalizeEmail(email).split("@")[1] ?? "";
}

function allowedEmails(): string[] {
  return parseCsv(env.SIGNUP_ALLOWED_EMAILS).map(normalizeEmail);
}

function allowedDomains(): string[] {
  return parseCsv(env.SIGNUP_ALLOWED_DOMAINS).map((domain) => domain.replace(/^@/, "").toLowerCase());
}

export async function getUserCount(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(schema.user);
  return Number(row?.value ?? 0);
}

export function isEmailOnSignupAllowlist(email: string): boolean {
  const normalized = normalizeEmail(email);
  const domain = emailDomain(normalized);

  if (allowedEmails().includes(normalized)) {
    return true;
  }

  return allowedDomains().some((allowedDomain) => domain === allowedDomain);
}

export function resolveSignupPolicy(existingUserCount: number): SignupPolicy {
  if (existingUserCount === 0) {
    return {
      enabled: true,
      mode: "bootstrap",
      hint: "Create the first admin account for this instance.",
    };
  }

  if (env.ALLOW_PUBLIC_SIGNUP) {
    return {
      enabled: true,
      mode: "open",
      hint: null,
    };
  }

  const hasAllowlist = allowedEmails().length > 0 || allowedDomains().length > 0;
  if (hasAllowlist) {
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

export async function assertSignupAllowed(db: Database, email: string) {
  const existingUserCount = await getUserCount(db);
  const policy = resolveSignupPolicy(existingUserCount);

  if (existingUserCount === 0) {
    return;
  }

  if (policy.mode === "open") {
    return;
  }

  if (policy.mode === "allowlist" && isEmailOnSignupAllowlist(email)) {
    return;
  }

  throw new APIError("FORBIDDEN", {
    message:
      policy.mode === "closed"
        ? "Sign-up is disabled on this instance."
        : "This email is not on the sign-up allowlist for this instance.",
  });
}
