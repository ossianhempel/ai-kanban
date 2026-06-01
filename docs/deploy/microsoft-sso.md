# Microsoft Entra ID (Azure AD) SSO

Configure **Sign in with Microsoft** for a work instance. Uses Better Auth’s built-in `microsoft` provider — no separate auth stack.

## Prerequisites

- Public HTTPS URL for the instance (`BETTER_AUTH_URL` / `WEB_ORIGIN`)
- Azure Entra ID permission to register an application (or ask IT)
- Sign-up policy aligned with your org (recommended: domain allowlist)

## 1. Register the app in Entra ID

1. [Azure portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Name: e.g. `AI Kanban`
3. Supported account types:
   - **Single tenant** — only your organization (typical for work)
4. Redirect URI → **Web**:
   ```text
   https://kanban.yourcompany.com/api/auth/callback/microsoft
   ```
   For local dev (if testing OAuth locally):
   ```text
   http://localhost:5180/api/auth/callback/microsoft
   ```
5. Register → note **Application (client) ID** and **Directory (tenant) ID**

## 2. Create a client secret

1. App → **Certificates & secrets** → **New client secret**
2. Copy the **Value** immediately (shown once)

## 3. API permissions

Default delegated permissions are usually enough: `openid`, `profile`, `email`, `User.Read`.

## 4. Instance environment

Add to `.env` (or Coolify env):

```bash
MICROSOFT_CLIENT_ID=<application-client-id>
MICROSOFT_CLIENT_SECRET=<client-secret>
MICROSOFT_TENANT_ID=<your-tenant-id>

# Work instance: SSO only + org domain allowlist
AUTH_EMAIL_PASSWORD_ENABLED=false
ALLOW_PUBLIC_SIGNUP=false
SIGNUP_ALLOWED_DOMAINS=yourcompany.com

# Optional: only expose Microsoft even if other OAuth vars are set
AUTH_PROVIDERS=microsoft
```

| Variable | Notes |
|----------|--------|
| `MICROSOFT_TENANT_ID` | Your tenant GUID for single-org lock-down. Omit or use `common` only if you need multi-tenant. |
| `AUTH_EMAIL_PASSWORD_ENABLED` | `false` hides the email/password form when SSO is configured. |
| `SIGNUP_ALLOWED_DOMAINS` | Still applies to **first-time** SSO users — `@gmail.com` cannot join even with a valid Microsoft login elsewhere. |

Redeploy / restart after changing env.

## 5. Verify

1. Open `/login` — **Continue with Microsoft** should appear
2. Sign in with a work account on the allowlisted domain
3. First user on the instance becomes **admin** (same as email sign-up)

## Other OAuth providers

Same pattern — set client ID + secret; button appears automatically:

| Provider | Env vars |
|----------|----------|
| GitHub | `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |

Use `AUTH_PROVIDERS=microsoft,github` to restrict which configured providers are shown.

Callback URLs:

```text
https://<your-domain>/api/auth/callback/github
https://<your-domain>/api/auth/callback/google
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Redirect URI in Entra must exactly match `{BETTER_AUTH_URL}/api/auth/callback/microsoft` |
| Sign-in works but “not on allowlist” | Add domain to `SIGNUP_ALLOWED_DOMAINS` or email to `SIGNUP_ALLOWED_EMAILS` |
| No Microsoft button | Check both `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` are set and app restarted |
| Wrong tenant | Set `MICROSOFT_TENANT_ID` to your company tenant GUID |

See also: [installation-from-source.md](./installation-from-source.md), [examples/env.production.example](./examples/env.production.example).
