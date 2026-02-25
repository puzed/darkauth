INSERT INTO "roles" ("key", "name", "description", "system", "created_at", "updated_at")
VALUES
  ('org_admin', 'Organization Admin', 'Can manage organization members, roles, and invitations', true, now(), now()),
  ('member', 'Member', 'Default organization member role', true, now(), now())
ON CONFLICT ("key") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "system" = EXCLUDED."system",
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_key")
SELECT r."id", p."key"
FROM "roles" r
JOIN "permissions" p ON p."key" = 'darkauth.org:manage'
WHERE r."key" = 'org_admin'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "organization_member_roles" ("organization_member_id", "role_id")
SELECT om."id", r."id"
FROM "organization_members" om
JOIN "roles" r ON r."key" = 'member'
LEFT JOIN "organization_member_roles" omr ON omr."organization_member_id" = om."id"
WHERE omr."organization_member_id" IS NULL
ON CONFLICT DO NOTHING;
