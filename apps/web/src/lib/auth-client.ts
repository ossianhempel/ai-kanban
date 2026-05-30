import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BETTER_AUTH_URL ?? "",
});

export const { useSession, signIn, signUp, signOut } = authClient;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
};
