ALTER TABLE "clients" ADD COLUMN "id_token_lifetime_seconds" integer;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "refresh_token_lifetime_seconds" integer;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "csrf";