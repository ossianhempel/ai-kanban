CREATE TYPE "public"."source_provider" AS ENUM('github', 'azure_devops', 'gitlab');--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" text NOT NULL,
	"provider" "source_provider" NOT NULL,
	"account_login" text NOT NULL,
	"account_display_name" text,
	"external_account_id" text NOT NULL,
	"credentials" jsonb NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "provider" "source_provider";--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "owner" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "repo_name" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "visibility" text;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "activity_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "branch_name" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "pull_request_url" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "pull_request_external_id" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "pull_request_number" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "pull_request_state" text;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE set null ON UPDATE no action;