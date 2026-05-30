ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "opaque_login_identity" text;
--> statement-breakpoint
UPDATE "users" SET "opaque_login_identity" = "email" WHERE "opaque_login_identity" IS NULL AND "email" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_opaque_login_identity_idx" ON "users" ("opaque_login_identity");
