CREATE TYPE "public"."knowledge_scope" AS ENUM('instance', 'project', 'ticket');--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"agent_playbook" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"scope" "knowledge_scope" NOT NULL,
	"project_id" uuid,
	"ticket_id" uuid,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"resolved_content" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "agent_context" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_refs" ADD CONSTRAINT "knowledge_refs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_refs" ADD CONSTRAINT "knowledge_refs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;