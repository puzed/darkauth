CREATE TABLE "scim_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "deprovision_action" text DEFAULT 'suspend_membership' NOT NULL,
  "delete_user_safety" text DEFAULT 'fail_closed' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scim_connections" ADD CONSTRAINT "scim_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_bearer_tokens" ADD COLUMN "connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "scim_bearer_tokens" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "scim_bearer_tokens" ADD COLUMN "scopes" text[] DEFAULT ARRAY['scim:read','scim:write']::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "scim_bearer_tokens" ADD CONSTRAINT "scim_bearer_tokens_connection_id_scim_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."scim_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_bearer_tokens" ADD CONSTRAINT "scim_bearer_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_users" ADD COLUMN "connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "scim_users" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "scim_users" ADD COLUMN "organization_member_id" uuid;
--> statement-breakpoint
ALTER TABLE "scim_users" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;
--> statement-breakpoint
ALTER TABLE "scim_users" DROP CONSTRAINT "scim_users_pkey";
--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_users_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_users_connection_id_scim_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."scim_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_users_organization_member_id_organization_members_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "public"."organization_members"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_groups" ADD COLUMN "connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "scim_groups" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_groups_connection_id_scim_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."scim_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "scim_connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_scim_connection_id_scim_connections_id_fk" FOREIGN KEY ("scim_connection_id") REFERENCES "public"."scim_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD COLUMN "scim_connection_id" uuid;
--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD COLUMN "scim_group_id" uuid;
--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD CONSTRAINT "organization_member_roles_scim_connection_id_scim_connections_id_fk" FOREIGN KEY ("scim_connection_id") REFERENCES "public"."scim_connections"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_member_roles" ADD CONSTRAINT "organization_member_roles_scim_group_id_scim_groups_id_fk" FOREIGN KEY ("scim_group_id") REFERENCES "public"."scim_groups"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
DROP INDEX IF EXISTS "scim_users_external_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "scim_users_user_name_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "scim_groups_external_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "scim_groups_display_name_idx";
--> statement-breakpoint
CREATE INDEX "scim_connections_organization_id_idx" ON "scim_connections" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "scim_connections_enabled_idx" ON "scim_connections" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX "scim_bearer_tokens_connection_id_idx" ON "scim_bearer_tokens" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "scim_bearer_tokens_organization_id_idx" ON "scim_bearer_tokens" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_connection_external_id_idx" ON "scim_users" USING btree ("connection_id","external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_connection_user_name_idx" ON "scim_users" USING btree ("connection_id","user_name");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_connection_user_sub_idx" ON "scim_users" USING btree ("connection_id","user_sub");
--> statement-breakpoint
CREATE INDEX "scim_users_connection_id_idx" ON "scim_users" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "scim_users_organization_id_idx" ON "scim_users" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "scim_users_user_sub_idx" ON "scim_users" USING btree ("user_sub");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_groups_connection_external_id_idx" ON "scim_groups" USING btree ("connection_id","external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_groups_connection_display_name_idx" ON "scim_groups" USING btree ("connection_id","display_name");
--> statement-breakpoint
CREATE INDEX "scim_groups_connection_id_idx" ON "scim_groups" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "scim_groups_organization_id_idx" ON "scim_groups" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "organization_members_scim_connection_id_idx" ON "organization_members" USING btree ("scim_connection_id");
--> statement-breakpoint
CREATE INDEX "organization_member_roles_scim_connection_id_idx" ON "organization_member_roles" USING btree ("scim_connection_id");
--> statement-breakpoint
CREATE INDEX "organization_member_roles_scim_group_id_idx" ON "organization_member_roles" USING btree ("scim_group_id");
--> statement-breakpoint
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs" USING btree ("organization_id");
