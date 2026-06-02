ALTER TABLE "instance_settings" ADD COLUMN "agent_directive_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;
