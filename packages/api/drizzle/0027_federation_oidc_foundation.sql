CREATE TYPE "public"."federation_connection_type" AS ENUM('oidc');
--> statement-breakpoint
CREATE TYPE "public"."federation_account_linking_policy" AS ENUM('disabled', 'email_verified', 'email');
--> statement-breakpoint
CREATE TABLE "federation_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "federation_connection_type" DEFAULT 'oidc' NOT NULL,
	"name" text NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" bytea,
	"discovery_url" text NOT NULL,
	"authorization_endpoint" text NOT NULL,
	"token_endpoint" text NOT NULL,
	"jwks_uri" text NOT NULL,
	"userinfo_endpoint" text,
	"scopes" text[] DEFAULT '{"openid","profile","email"}' NOT NULL,
	"claim_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"account_linking_policy" "federation_account_linking_policy" DEFAULT 'email_verified' NOT NULL,
	"domains" text[] DEFAULT '{}' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_sub" text NOT NULL,
	"issuer" text NOT NULL,
	"external_subject" text NOT NULL,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"claims" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"last_login_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "federation_oidc_states" (
	"state_hash" text PRIMARY KEY NOT NULL,
	"connection_id" uuid NOT NULL,
	"nonce_hash" text NOT NULL,
	"code_verifier_hash" text,
	"return_to" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "federation_identities" ADD CONSTRAINT "federation_identities_connection_id_federation_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."federation_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_identities" ADD CONSTRAINT "federation_identities_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "federation_oidc_states" ADD CONSTRAINT "federation_oidc_states_connection_id_federation_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."federation_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_connections_issuer_client_idx" ON "federation_connections" USING btree ("issuer","client_id");
--> statement-breakpoint
CREATE INDEX "federation_connections_enabled_idx" ON "federation_connections" USING btree ("enabled");
--> statement-breakpoint
CREATE UNIQUE INDEX "federation_identities_connection_subject_idx" ON "federation_identities" USING btree ("connection_id","external_subject");
--> statement-breakpoint
CREATE INDEX "federation_identities_user_sub_idx" ON "federation_identities" USING btree ("user_sub");
--> statement-breakpoint
CREATE INDEX "federation_identities_email_idx" ON "federation_identities" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "federation_oidc_states_connection_id_idx" ON "federation_oidc_states" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "federation_oidc_states_expires_at_idx" ON "federation_oidc_states" USING btree ("expires_at");
