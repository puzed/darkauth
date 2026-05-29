ALTER TABLE "clients" ADD COLUMN "key_delivery_version" text DEFAULT 'v2' NOT NULL;
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "delivered_key_kind" text DEFAULT 'client_app_key' NOT NULL;
--> statement-breakpoint
UPDATE "clients"
SET "key_delivery_version" = 'v1-drk',
    "delivered_key_kind" = 'root_key'
WHERE "zk_delivery" = 'fragment-jwe';
--> statement-breakpoint
ALTER TABLE "pending_auth" ADD COLUMN "key_delivery_version" text DEFAULT 'v2' NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_auth" ADD COLUMN "delivered_key_kind" text DEFAULT 'client_app_key' NOT NULL;
--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "zk_key_hash" text;
--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "zk_key_kind" text;
--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN "zk_key_version" text;
--> statement-breakpoint
UPDATE "auth_codes"
SET "zk_key_hash" = "drk_hash",
    "zk_key_kind" = 'root_key',
    "zk_key_version" = 'v1-drk'
WHERE "has_zk" = true AND "drk_hash" IS NOT NULL;
