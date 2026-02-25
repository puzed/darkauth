DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'organization_status') THEN
    CREATE TYPE "organization_status" AS ENUM ('active', 'invited', 'suspended');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "created_by_user_sub" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "organizations_created_by_user_sub_users_sub_fk" FOREIGN KEY ("created_by_user_sub") REFERENCES "users"("sub") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "user_sub" text NOT NULL,
  "status" "organization_status" NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "organization_members_user_sub_users_sub_fk" FOREIGN KEY ("user_sub") REFERENCES "users"("sub") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_organization_user_idx" ON "organization_members" ("organization_id", "user_sub");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_user_sub_idx" ON "organization_members" ("user_sub");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_members_organization_id_idx" ON "organization_members" ("organization_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "system" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" uuid NOT NULL,
  "permission_key" text NOT NULL,
  CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY ("role_id", "permission_key"),
  CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
  CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permissions_role_id_idx" ON "role_permissions" ("role_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_member_roles" (
  "organization_member_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  CONSTRAINT "organization_member_roles_organization_member_id_role_id_pk" PRIMARY KEY ("organization_member_id", "role_id"),
  CONSTRAINT "organization_member_roles_organization_member_id_organization_members_id_fk" FOREIGN KEY ("organization_member_id") REFERENCES "organization_members"("id") ON DELETE CASCADE,
  CONSTRAINT "organization_member_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_member_roles_member_id_idx" ON "organization_member_roles" ("organization_member_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organization_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role_ids" uuid[] NOT NULL DEFAULT '{}',
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "accepted_at" timestamp,
  "created_by_user_sub" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "organization_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "organization_invites_created_by_user_sub_users_sub_fk" FOREIGN KEY ("created_by_user_sub") REFERENCES "users"("sub") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_invites_organization_id_idx" ON "organization_invites" ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_invites_email_idx" ON "organization_invites" ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organization_invites_expires_at_idx" ON "organization_invites" ("expires_at");
--> statement-breakpoint
ALTER TABLE "pending_auth" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
ALTER TABLE "auth_codes" ADD COLUMN IF NOT EXISTS "organization_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pending_auth_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "pending_auth"
      ADD CONSTRAINT "pending_auth_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auth_codes_organization_id_organizations_id_fk'
  ) THEN
    ALTER TABLE "auth_codes"
      ADD CONSTRAINT "auth_codes_organization_id_organizations_id_fk"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO "organizations" ("slug", "name", "created_at", "updated_at")
VALUES ('default', 'Default', now(), now())
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "organization_members" ("organization_id", "user_sub", "status", "created_at", "updated_at")
SELECT o.id, u.sub, 'active'::organization_status, now(), now()
FROM "users" u
JOIN "organizations" o ON o.slug = 'default'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "roles" ("key", "name", "system", "created_at", "updated_at")
SELECT g."key", g."name", false, now(), now()
FROM "groups" g
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r.id, gp."permission_key"
FROM "group_permissions" gp
JOIN "roles" r ON r."key" = gp."group_key"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "organization_member_roles" ("organization_member_id", "role_id")
SELECT om.id, r.id
FROM "user_groups" ug
JOIN "roles" r ON r."key" = ug."group_key"
JOIN "organizations" o ON o."slug" = 'default'
JOIN "organization_members" om ON om."organization_id" = o."id" AND om."user_sub" = ug."user_sub"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE "pending_auth" pa
SET "organization_id" = o.id
FROM "organizations" o
WHERE pa."organization_id" IS NULL AND o."slug" = 'default';
--> statement-breakpoint
UPDATE "auth_codes" ac
SET "organization_id" = o.id
FROM "organizations" o
WHERE ac."organization_id" IS NULL AND o."slug" = 'default';
