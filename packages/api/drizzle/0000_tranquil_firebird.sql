CREATE TYPE "public"."admin_role" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TYPE "public"."client_type" AS ENUM('public', 'confidential');--> statement-breakpoint
CREATE TYPE "public"."session_cohort" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."token_endpoint_auth_method" AS ENUM('none', 'client_secret_basic');--> statement-breakpoint
CREATE TYPE "public"."zk_delivery" AS ENUM('none', 'fragment-jwe');--> statement-breakpoint
CREATE TABLE "admin_opaque_records" (
	"admin_id" uuid PRIMARY KEY NOT NULL,
	"envelope" "bytea" NOT NULL,
	"server_pubkey" "bytea" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_password_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"export_key_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "admin_role" NOT NULL,
	"password_reset_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"cohort" text,
	"user_id" text,
	"admin_id" uuid,
	"client_id" text,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"success" boolean NOT NULL,
	"status_code" integer,
	"error_code" text,
	"error_message" text,
	"resource_type" text,
	"resource_id" text,
	"action" text,
	"request_body" jsonb,
	"changes" jsonb,
	"response_time" integer,
	"details" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_sub" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text,
	"code_challenge_method" text,
	"expires_at" timestamp NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"has_zk" boolean DEFAULT false NOT NULL,
	"zk_pub_kid" text,
	"drk_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "client_type" NOT NULL,
	"token_endpoint_auth_method" "token_endpoint_auth_method" NOT NULL,
	"client_secret_enc" "bytea",
	"require_pkce" boolean DEFAULT true NOT NULL,
	"zk_delivery" "zk_delivery" DEFAULT 'none' NOT NULL,
	"zk_required" boolean DEFAULT false NOT NULL,
	"allowed_jwe_algs" text[] DEFAULT '{}' NOT NULL,
	"allowed_jwe_encs" text[] DEFAULT '{}' NOT NULL,
	"redirect_uris" text[] DEFAULT '{}' NOT NULL,
	"post_logout_redirect_uris" text[] DEFAULT '{}' NOT NULL,
	"grant_types" text[] DEFAULT '{"authorization_code"}' NOT NULL,
	"response_types" text[] DEFAULT '{"code"}' NOT NULL,
	"scopes" text[] DEFAULT '{"openid","profile"}' NOT NULL,
	"allowed_zk_origins" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_permissions" (
	"group_key" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "group_permissions_group_key_permission_key_pk" PRIMARY KEY("group_key","permission_key")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"kid" text PRIMARY KEY NOT NULL,
	"alg" text NOT NULL,
	"public_jwk" jsonb NOT NULL,
	"private_jwk_enc" "bytea",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"rotated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "opaque_records" (
	"sub" text PRIMARY KEY NOT NULL,
	"envelope" "bytea" NOT NULL,
	"server_pubkey" "bytea" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_auth" (
	"request_id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"state" text,
	"code_challenge" text,
	"code_challenge_method" text,
	"zk_pub_kid" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"user_sub" text,
	"origin" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"cohort" "session_cohort" NOT NULL,
	"user_sub" text,
	"admin_id" uuid,
	"csrf" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refresh_token" text,
	"refresh_token_expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"user_sub" text NOT NULL,
	"group_key" text NOT NULL,
	CONSTRAINT "user_groups_user_sub_group_key_pk" PRIMARY KEY("user_sub","group_key")
);
--> statement-breakpoint
CREATE TABLE "user_password_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_sub" text NOT NULL,
	"export_key_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_sub" text NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "user_permissions_user_sub_permission_key_pk" PRIMARY KEY("user_sub","permission_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"sub" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"password_reset_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wrapped_root_keys" (
	"sub" text PRIMARY KEY NOT NULL,
	"wrapped_drk" "bytea" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_opaque_records" ADD CONSTRAINT "admin_opaque_records_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_password_history" ADD CONSTRAINT "admin_password_history_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_codes" ADD CONSTRAINT "auth_codes_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_codes" ADD CONSTRAINT "auth_codes_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_group_key_groups_key_fk" FOREIGN KEY ("group_key") REFERENCES "public"."groups"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opaque_records" ADD CONSTRAINT "opaque_records_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_auth" ADD CONSTRAINT "pending_auth_client_id_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_auth" ADD CONSTRAINT "pending_auth_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admin_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_key_groups_key_fk" FOREIGN KEY ("group_key") REFERENCES "public"."groups"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_password_history" ADD CONSTRAINT "user_password_history_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wrapped_root_keys" ADD CONSTRAINT "wrapped_root_keys_sub_users_sub_fk" FOREIGN KEY ("sub") REFERENCES "public"."users"("sub") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_admin_id_idx" ON "audit_logs" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "audit_logs_event_type_idx" ON "audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" USING btree ("resource_type","resource_id");