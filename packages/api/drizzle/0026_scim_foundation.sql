CREATE TABLE "scim_bearer_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "token_hash" text NOT NULL,
  "token_prefix" text NOT NULL,
  "created_by_admin_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "last_used_at" timestamp,
  "expires_at" timestamp,
  "revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "scim_users" (
  "user_sub" text PRIMARY KEY NOT NULL,
  "external_id" text,
  "user_name" text NOT NULL,
  "display_name" text,
  "active" boolean DEFAULT true NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "external_id" text,
  "display_name" text NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_group_members" (
  "group_id" uuid NOT NULL,
  "user_sub" text NOT NULL,
  CONSTRAINT "scim_group_members_group_id_user_sub_pk" PRIMARY KEY("group_id","user_sub")
);
--> statement-breakpoint
ALTER TABLE "scim_bearer_tokens" ADD CONSTRAINT "scim_bearer_tokens_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_users_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_group_id_scim_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."scim_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scim_group_members" ADD CONSTRAINT "scim_group_members_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_bearer_tokens_token_hash_idx" ON "scim_bearer_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "scim_bearer_tokens_active_idx" ON "scim_bearer_tokens" USING btree ("revoked_at","expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_external_id_idx" ON "scim_users" USING btree ("external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_users_user_name_idx" ON "scim_users" USING btree ("user_name");
--> statement-breakpoint
CREATE INDEX "scim_users_active_idx" ON "scim_users" USING btree ("active");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_groups_external_id_idx" ON "scim_groups" USING btree ("external_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "scim_groups_display_name_idx" ON "scim_groups" USING btree ("display_name");
--> statement-breakpoint
CREATE INDEX "scim_group_members_user_sub_idx" ON "scim_group_members" USING btree ("user_sub");
