ALTER TABLE "sessions" ADD COLUMN "refresh_token_consumed_at" timestamp;
--> statement-breakpoint
UPDATE "sessions" SET "refresh_token" = NULL WHERE "refresh_token" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_refresh_token_idx" ON "sessions" ("refresh_token");
