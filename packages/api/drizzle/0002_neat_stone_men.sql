CREATE TABLE "opaque_login_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"server_state" "bytea" NOT NULL,
	"identity_s" text NOT NULL,
	"identity_u" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_encryption_keys" (
	"sub" text PRIMARY KEY NOT NULL,
	"enc_public_jwk" jsonb NOT NULL,
	"enc_private_jwk_wrapped" "bytea",
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "drk_jwe" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "default_value" jsonb;--> statement-breakpoint
ALTER TABLE "user_encryption_keys" ADD CONSTRAINT "user_encryption_keys_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;