import { env } from "@ai-kanban/env/server";
import type { SignupPolicy } from "./signup-policy";

export const authProviderIds = ["microsoft", "github", "google"] as const;
export type AuthProviderId = (typeof authProviderIds)[number];

export type PublicAuthProvider = {
  id: AuthProviderId;
  label: string;
  kind: "oauth";
};

const providerLabels: Record<AuthProviderId, string> = {
  microsoft: "Microsoft",
  github: "GitHub",
  google: "Google",
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

function parseProviderFilter(): AuthProviderId[] | null {
  const entries = parseCsv(env.AUTH_PROVIDERS);
  if (entries.length === 0) {
    return null;
  }

  const allowed = new Set<string>(authProviderIds);
  const invalid = entries.filter((entry) => !allowed.has(entry));
  if (invalid.length > 0) {
    throw new Error(`Unknown AUTH_PROVIDERS entries: ${invalid.join(", ")}`);
  }

  return entries as AuthProviderId[];
}

function isProviderAllowed(id: AuthProviderId, filter: AuthProviderId[] | null): boolean {
  return filter === null || filter.includes(id);
}

export function buildSocialProviders(): {
  socialProviders: Record<string, Record<string, string>>;
  providers: PublicAuthProvider[];
} {
  const filter = parseProviderFilter();
  const socialProviders: Record<string, Record<string, string>> = {};
  const providers: PublicAuthProvider[] = [];

  if (
    env.MICROSOFT_CLIENT_ID &&
    env.MICROSOFT_CLIENT_SECRET &&
    isProviderAllowed("microsoft", filter)
  ) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: env.MICROSOFT_TENANT_ID ?? "common",
      authority: "https://login.microsoftonline.com",
      prompt: "select_account",
    };
    providers.push({ id: "microsoft", label: providerLabels.microsoft, kind: "oauth" });
  }

  if (env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET && isProviderAllowed("github", filter)) {
    socialProviders.github = {
      clientId: env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
    };
    providers.push({ id: "github", label: providerLabels.github, kind: "oauth" });
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && isProviderAllowed("google", filter)) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
    providers.push({ id: "google", label: providerLabels.google, kind: "oauth" });
  }

  return { socialProviders, providers };
}

export function isEmailPasswordEnabled(_providers: PublicAuthProvider[]): boolean {
  if (env.AUTH_EMAIL_PASSWORD_ENABLED !== undefined) {
    return env.AUTH_EMAIL_PASSWORD_ENABLED;
  }

  return true;
}

export type PublicAuthConfig = {
  signup: SignupPolicy;
  providers: PublicAuthProvider[];
  emailPassword: boolean;
};

export function buildPublicAuthConfig(signup: SignupPolicy): PublicAuthConfig {
  const { providers } = buildSocialProviders();

  return {
    signup,
    providers,
    emailPassword: isEmailPasswordEnabled(providers),
  };
}
