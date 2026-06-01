ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "enterprise_connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "enterprise_connection_type" text;
