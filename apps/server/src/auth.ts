import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@ai-kanban/db";
import { schema } from "@ai-kanban/db";
import { env } from "@ai-kanban/env/server";
import { promoteFirstUserToAdmin } from "./authz";
import { buildSocialProviders, isEmailPasswordEnabled } from "./auth-providers";
import { assertSignupAllowed } from "./signup-policy";

export function createAuth(db: Database) {
  const { socialProviders, providers } = buildSocialProviders();
  const emailPasswordEnabled = isEmailPasswordEnabled(providers);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "member",
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (createdUser) => {
            await assertSignupAllowed(db, createdUser.email);
            return { data: createdUser };
          },
          after: async (createdUser) => {
            await promoteFirstUserToAdmin(db, createdUser.id);
          },
        },
      },
    },
    emailAndPassword: {
      enabled: emailPasswordEnabled,
      requireEmailVerification: false,
    },
    ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL, env.WEB_ORIGIN],
  });
}

export type Auth = ReturnType<typeof createAuth>;
