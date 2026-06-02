import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { primaryId } from "./base";

export const signupAllowlistKinds = ["email", "domain"] as const;
export type SignupAllowlistKind = (typeof signupAllowlistKinds)[number];

export const signupAllowlist = pgTable(
  "signup_allowlist",
  {
    ...primaryId,
    kind: text("kind").notNull().$type<SignupAllowlistKind>(),
    value: text("value").notNull(),
  },
  (table) => [uniqueIndex("signup_allowlist_kind_value").on(table.kind, table.value)],
);
