ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;
--> statement-breakpoint
UPDATE "user"
SET "role" = 'admin'
WHERE "id" = (
  SELECT "id" FROM "user" ORDER BY "created_at" ASC LIMIT 1
);
