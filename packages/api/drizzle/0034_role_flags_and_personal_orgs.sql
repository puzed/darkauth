ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "assignable" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "default_member" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "default_creator" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE "roles"
SET
  "assignable" = true,
  "default_creator" = true,
  "updated_at" = now()
WHERE "key" = 'org_admin';
--> statement-breakpoint
UPDATE "roles"
SET
  "assignable" = true,
  "default_member" = true,
  "updated_at" = now()
WHERE "key" = 'member';
--> statement-breakpoint
WITH fallback_default_member AS (
  SELECT "id" FROM "roles" ORDER BY "system" DESC, "created_at" ASC, "id" ASC LIMIT 1
)
UPDATE "roles"
SET "default_member" = true, "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM fallback_default_member)
  AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "default_member" = true);
--> statement-breakpoint
WITH fallback_default_creator AS (
  SELECT "id" FROM "roles" ORDER BY "system" DESC, "created_at" ASC, "id" ASC LIMIT 1
)
UPDATE "roles"
SET "default_creator" = true, "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM fallback_default_creator)
  AND NOT EXISTS (SELECT 1 FROM "roles" WHERE "default_creator" = true);
