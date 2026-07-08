ALTER TABLE "clients" ADD COLUMN "require_organization_selection" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_auth" ADD COLUMN "require_organization_selection" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "require_organization_selection" boolean DEFAULT true NOT NULL;
