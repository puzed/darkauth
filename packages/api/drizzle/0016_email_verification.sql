ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pending_email" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pending_email_set_at" timestamp;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_sub" text NOT NULL REFERENCES "users"("sub") ON DELETE cascade,
  "purpose" text NOT NULL,
  "target_email" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "consumed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_verification_tokens_user_purpose_idx" ON "email_verification_tokens" ("user_sub", "purpose");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" ("expires_at");
