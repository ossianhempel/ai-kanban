import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@ai-kanban/env/server";
import type { SourceProviderId } from "@ai-kanban/integrations";

export type ProviderOAuthState = {
  userId: string;
  provider: SourceProviderId;
  organization?: string;
  nonce: string;
  exp: number;
};

export type ProviderOAuthAvailability = {
  github: boolean;
  azure_devops: boolean;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(payload).digest("base64url");
}

export function createProviderOAuthState(input: Omit<ProviderOAuthState, "nonce" | "exp">): string {
  const state: ProviderOAuthState = {
    ...input,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const payload = base64UrlEncode(JSON.stringify(state));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function parseProviderOAuthState(raw: string): ProviderOAuthState | null {
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = signPayload(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const state = JSON.parse(base64UrlDecode(payload)) as ProviderOAuthState;
    if (!state.userId || !state.provider || !state.exp || Date.now() > state.exp) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function getProviderOAuthAvailability(): ProviderOAuthAvailability {
  return {
    github: Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET),
    azure_devops: Boolean(
      env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_TENANT_ID,
    ),
  };
}

function callbackUrl(provider: SourceProviderId): string {
  return `${env.WEB_ORIGIN}/api/connections/oauth/${provider}/callback`;
}

export function buildProviderAuthorizeUrl(
  provider: SourceProviderId,
  state: string,
  options?: { organization?: string },
): string {
  if (provider === "github") {
    const clientId = env.GITHUB_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new Error("GitHub OAuth is not configured");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl("github"),
      scope: "read:user repo read:org",
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  if (provider === "azure_devops") {
    const clientId = env.MICROSOFT_CLIENT_ID;
    const tenantId = env.MICROSOFT_TENANT_ID ?? "common";
    if (!clientId) {
      throw new Error("Microsoft OAuth is not configured");
    }
    if (!options?.organization?.trim()) {
      throw new Error("Azure DevOps organization is required");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: callbackUrl("azure_devops"),
      response_mode: "query",
      scope: "499b84ac-1321-427f-aa17-267ca6975798/.default offline_access openid profile email",
      state,
    });
    return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  throw new Error(`OAuth is not supported for provider "${provider}"`);
}

export async function exchangeProviderOAuthCode(
  provider: SourceProviderId,
  code: string,
): Promise<{ accessToken: string; organization?: string }> {
  if (provider === "github") {
    const clientId = env.GITHUB_OAUTH_CLIENT_ID;
    const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("GitHub OAuth is not configured");
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl("github"),
      }),
    });

    const body = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
    if (!response.ok || !body.access_token) {
      throw new Error(body.error_description ?? body.error ?? "GitHub token exchange failed");
    }

    return { accessToken: body.access_token };
  }

  if (provider === "azure_devops") {
    const clientId = env.MICROSOFT_CLIENT_ID;
    const clientSecret = env.MICROSOFT_CLIENT_SECRET;
    const tenantId = env.MICROSOFT_TENANT_ID ?? "common";
    if (!clientId || !clientSecret) {
      throw new Error("Microsoft OAuth is not configured");
    }

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: callbackUrl("azure_devops"),
        }),
      },
    );

    const body = (await tokenResponse.json()) as { access_token?: string; error_description?: string };
    if (!tokenResponse.ok || !body.access_token) {
      throw new Error(body.error_description ?? "Microsoft token exchange failed");
    }

    return { accessToken: body.access_token };
  }

  throw new Error(`OAuth is not supported for provider "${provider}"`);
}
