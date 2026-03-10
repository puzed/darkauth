ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "force_otp" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE "organizations" o
SET "force_otp" = true
WHERE EXISTS (
  SELECT 1
  FROM "organization_members" om
  INNER JOIN "organization_member_roles" omr ON omr."organization_member_id" = om."id"
  INNER JOIN "roles" r ON r."id" = omr."role_id"
  WHERE om."organization_id" = o."id" AND r."key" = 'otp_required'
);
--> statement-breakpoint
DELETE FROM "organization_member_roles" omr
USING "roles" r
WHERE omr."role_id" = r."id" AND r."key" = 'otp_required';
--> statement-breakpoint
DELETE FROM "role_permissions" rp
USING "roles" r
WHERE rp."role_id" = r."id" AND r."key" = 'otp_required';
--> statement-breakpoint
DELETE FROM "roles" WHERE "key" = 'otp_required';
