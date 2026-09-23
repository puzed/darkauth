CREATE TABLE IF NOT EXISTS "user_client_consents" (
  "user_sub" text NOT NULL,
  "client_id" text NOT NULL,
  "scopes" text DEFAULT '' NOT NULL,
  "organization_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_client_consents_user_sub_client_id_pk" PRIMARY KEY("user_sub","client_id")
);
--> statement-breakpoint
ALTER TABLE "user_client_consents" ADD CONSTRAINT "user_client_consents_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_client_consents" ADD CONSTRAINT "user_client_consents_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_client_consents" ADD CONSTRAINT "user_client_consents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_client_consents_client_id_idx" ON "user_client_consents" ("client_id");
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "remember_consent" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "sign_in_id" text;
--> statement-breakpoint
ALTER TABLE "pending_auth" ADD COLUMN "prompt" text;
--> statement-breakpoint
INSERT INTO "settings" ("key", "name", "type", "category", "description", "tags", "default_value", "value", "secure", "updated_at") VALUES
('users.scim.allow_session_unlock', 'Allow session unlock', 'boolean', 'Users / SCIM Policy', 'Let SCIM-managed users keep their encryption key unlocked across tabs for the length of a sign-in.', ARRAY['users','scim','key-management']::text[], 'true'::jsonb, 'true'::jsonb, false, now())
ON CONFLICT ("key") DO UPDATE SET
"name" = excluded."name",
"type" = excluded."type",
"category" = excluded."category",
"description" = excluded."description",
"tags" = excluded."tags",
"default_value" = excluded."default_value",
"secure" = excluded."secure",
"updated_at" = now();
