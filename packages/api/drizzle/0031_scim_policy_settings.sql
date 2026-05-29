INSERT INTO "settings" ("key", "name", "type", "category", "description", "tags", "default_value", "value", "secure", "updated_at") VALUES
('users.scim.only_provisioned_sign_in', 'Only SCIM users may sign in', 'boolean', 'Users / SCIM Policy', 'Allow sign-in only for users provisioned by SCIM.', ARRAY['users','scim','policy']::text[], 'false'::jsonb, 'false'::jsonb, false, now()),
('users.scim.require_key_unlock_for_zk', 'Require key unlock for ZK clients', 'boolean', 'Users / SCIM Policy', 'Require SCIM-managed users to unlock encrypted keys for ZK clients.', ARRAY['users','scim','policy']::text[], 'true'::jsonb, 'true'::jsonb, false, now()),
('users.scim.allow_password_envelopes', 'Allow password unlock envelopes', 'boolean', 'Users / SCIM Policy', 'Let SCIM-managed users create and use password-based encryption unlock envelopes.', ARRAY['users','scim','key-management']::text[], 'true'::jsonb, 'true'::jsonb, false, now()),
('users.scim.allow_passkey_prf_envelopes', 'Allow PRF passkey unlock', 'boolean', 'Users / SCIM Policy', 'Let SCIM-managed users create passkey PRF encryption unlock envelopes.', ARRAY['users','scim','key-management','passkeys']::text[], 'true'::jsonb, 'true'::jsonb, false, now()),
('users.scim.allow_trusted_device_approval', 'Allow trusted-device approval', 'boolean', 'Users / SCIM Policy', 'Let trusted devices approve encrypted key access on new browsers for SCIM-managed users.', ARRAY['users','scim','key-management','devices']::text[], 'true'::jsonb, 'true'::jsonb, false, now()),
('users.scim.deprovision_action', 'Deprovision action', 'string', 'Users / SCIM Policy', 'Choose how SCIM delete or active=false affects DarkAuth users.', ARRAY['users','scim','deprovisioning']::text[], '"suspend"'::jsonb, '"suspend"'::jsonb, false, now()),
('users.scim.unknown_group_policy', 'Unknown group policy', 'string', 'Users / SCIM Mapping', 'Choose what happens when SCIM sends a group without a mapping.', ARRAY['users','scim','mapping']::text[], '"ignore"'::jsonb, '"ignore"'::jsonb, false, now()),
('users.scim.group_role_mappings', 'Group and role mappings', 'object', 'Users / SCIM Mapping', 'Map SCIM group display names or external IDs to DarkAuth organizations and roles.', ARRAY['users','scim','mapping']::text[], '{"mappings":[]}'::jsonb, '{"mappings":[]}'::jsonb, false, now())
ON CONFLICT ("key") DO UPDATE SET
"name" = excluded."name",
"type" = excluded."type",
"category" = excluded."category",
"description" = excluded."description",
"tags" = excluded."tags",
"default_value" = excluded."default_value",
"secure" = excluded."secure",
"updated_at" = now();
