ALTER TABLE "instance_settings" ADD COLUMN "signup_allow_public" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "signup_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"kind" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "signup_allowlist_kind_value" ON "signup_allowlist" ("kind","value");
