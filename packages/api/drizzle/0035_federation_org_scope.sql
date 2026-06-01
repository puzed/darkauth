DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'federation_domain_verification_status') THEN
    CREATE TYPE "federation_domain_verification_status" AS ENUM ('pending', 'verified', 'failed');
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
UPDATE "federation_connections"
SET "organization_id" = (
  SELECT "id" FROM "organizations" ORDER BY "created_at" ASC, "id" ASC LIMIT 1
)
WHERE "organization_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "federation_connections" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'federation_connections_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "federation_connections"
      ADD CONSTRAINT "federation_connections_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "protocol" text NOT NULL DEFAULT 'oidc';
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "jit_provisioning" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "membership_on_authentication" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "require_scim_pre_provisioning" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "require_password_for_zk" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "allow_passkey_prf" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "allow_trusted_device_approval" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "federation_connections" ADD COLUMN IF NOT EXISTS "allow_non_zk_key_setup_bypass" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "federation_connections_organization_id_idx" ON "federation_connections" ("organization_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "federation_connection_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "domain" text NOT NULL,
  "verification_status" "federation_domain_verification_status" NOT NULL DEFAULT 'pending',
  "verification_token_hash" text,
  "verified_at" timestamp,
  "last_checked_at" timestamp,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "federation_connection_domains_connection_id_federation_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "federation_connections"("id") ON DELETE CASCADE,
  CONSTRAINT "federation_connection_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "federation_connection_domains_connection_domain_idx" ON "federation_connection_domains" ("connection_id", "domain");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "federation_connection_domains_connection_id_idx" ON "federation_connection_domains" ("connection_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "federation_connection_domains_organization_id_idx" ON "federation_connection_domains" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "federation_connection_domains_domain_idx" ON "federation_connection_domains" ("domain");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "federation_connection_domains_verified_unique_idx" ON "federation_connection_domains" ("domain") WHERE "enabled" = true AND "verification_status" = 'verified';
--> statement-breakpoint
INSERT INTO "federation_connection_domains" (
  "connection_id",
  "organization_id",
  "domain",
  "verification_status",
  "verified_at",
  "enabled",
  "created_at",
  "updated_at"
)
SELECT
  fc."id",
  fc."organization_id",
  lower(trim(domain_value)),
  'verified'::federation_domain_verification_status,
  now(),
  true,
  now(),
  now()
FROM "federation_connections" fc
CROSS JOIN LATERAL unnest(fc."domains") AS domain_value
WHERE trim(domain_value) <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "federation_oidc_states" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
UPDATE "federation_oidc_states" fos
SET "organization_id" = fc."organization_id"
FROM "federation_connections" fc
WHERE fos."connection_id" = fc."id" AND fos."organization_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "federation_oidc_states" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'federation_oidc_states_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "federation_oidc_states"
      ADD CONSTRAINT "federation_oidc_states_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "federation_oidc_states" ADD COLUMN IF NOT EXISTS "client_id" text DEFAULT 'user';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'federation_oidc_states_client_id_clients_client_id_fk'
  ) THEN
    ALTER TABLE "federation_oidc_states"
      ADD CONSTRAINT "federation_oidc_states_client_id_clients_client_id_fk"
      FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "federation_oidc_states_organization_id_idx" ON "federation_oidc_states" ("organization_id");
