ALTER TABLE "clients" ADD COLUMN "client_key_scope" text DEFAULT 'organization' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_auth" ADD COLUMN "client_key_scope" text DEFAULT 'organization' NOT NULL;
