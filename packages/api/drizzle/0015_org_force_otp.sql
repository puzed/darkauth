ALTER TABLE "organizations"
ADD COLUMN IF NOT EXISTS "force_otp" boolean NOT NULL DEFAULT false;
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
