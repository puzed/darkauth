ALTER TABLE "pending_auth" ADD COLUMN "nonce" text;--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "nonce" text;
