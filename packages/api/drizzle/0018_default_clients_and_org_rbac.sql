INSERT INTO "permissions" ("key", "description")
VALUES
  ('darkauth.users:read', 'Allows searching and reading users from the user directory endpoints'),
  ('darkauth.org:manage', 'Allows management of organization members, roles, and invites')
ON CONFLICT ("key") DO UPDATE
SET
  "description" = EXCLUDED."description";
--> statement-breakpoint
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
JOIN "permissions" p ON p."key" IN ('darkauth.org:manage', 'darkauth.users:read')
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
--> statement-breakpoint
INSERT INTO "clients" (
  "client_id",
  "name",
  "type",
  "token_endpoint_auth_method",
  "client_secret_enc",
  "require_pkce",
  "zk_delivery",
  "zk_required",
  "allowed_jwe_algs",
  "allowed_jwe_encs",
  "redirect_uris",
  "post_logout_redirect_uris",
  "grant_types",
  "response_types",
  "scopes",
  "allowed_zk_origins",
  "created_at",
  "updated_at"
)
VALUES
  (
    'user',
    'User Portal',
    'public',
    'none',
    NULL,
    true,
    'none',
    false,
    ARRAY[]::text[],
    ARRAY[]::text[],
    ARRAY['http://localhost:9080/callback']::text[],
    ARRAY['http://localhost:9080']::text[],
    ARRAY['authorization_code', 'refresh_token']::text[],
    ARRAY['code']::text[],
    ARRAY[
      '{"key":"openid","description":"Authenticate you"}',
      '{"key":"profile","description":"Access your profile information"}',
      '{"key":"email","description":"Access your email address"}'
    ]::text[],
    ARRAY['http://localhost:9080']::text[],
    now(),
    now()
  ),
  (
    'demo-public-client',
    'Demo Public Client',
    'public',
    'none',
    NULL,
    true,
    'fragment-jwe',
    true,
    ARRAY['ECDH-ES']::text[],
    ARRAY['A256GCM']::text[],
    ARRAY[
      'http://localhost:9092/',
      'http://localhost:9092/callback',
      'http://localhost:3000/',
      'http://localhost:3000/callback',
      'https://app.example.com/',
      'https://app.example.com/callback'
    ]::text[],
    ARRAY['http://localhost:9092/', 'http://localhost:3000', 'https://app.example.com']::text[],
    ARRAY['authorization_code', 'refresh_token']::text[],
    ARRAY['code']::text[],
    ARRAY[
      '{"key":"openid","description":"Authenticate you"}',
      '{"key":"profile","description":"Access your profile information"}',
      '{"key":"email","description":"Access your email address"}'
    ]::text[],
    ARRAY['http://localhost:9092', 'http://localhost:3000', 'https://app.example.com']::text[],
    now(),
    now()
  ),
  (
    'demo-confidential-client',
    'Demo Confidential Client',
    'confidential',
    'client_secret_basic',
    NULL,
    false,
    'none',
    false,
    ARRAY[]::text[],
    ARRAY[]::text[],
    ARRAY['http://localhost:4000/callback', 'https://support.example.com/callback']::text[],
    ARRAY['http://localhost:4000', 'https://support.example.com']::text[],
    ARRAY['authorization_code', 'refresh_token', 'client_credentials']::text[],
    ARRAY['code']::text[],
    ARRAY[
      '{"key":"openid","description":"Authenticate you"}',
      '{"key":"profile","description":"Access your profile information"}',
      '{"key":"darkauth.users:read","description":"Search and read users from the directory"}'
    ]::text[],
    ARRAY[]::text[],
    now(),
    now()
  )
ON CONFLICT ("client_id") DO NOTHING;
