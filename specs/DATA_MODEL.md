# Data model

The canonical schema is `packages/api/src/db/schema.ts`. This document groups tables by ownership and records cross-table invariants; it is not a column-by-column substitute for the schema.

## Configuration and server keys

- `settings`: named shared configuration, metadata, defaults, and secure-value markers.
- `jwks`: public signing JWKs and encrypted private JWK material.
- `clients`: OIDC client registration, redirect and logout URIs, grants, scopes, PKCE, token lifetimes, dashboard metadata, and ZK delivery policy.

Private signing keys and confidential client secrets are ciphertext at rest. The KEK derivation passphrase remains outside the database.

## People and authentication

- `users`: user identity and profile state.
- `admin_users`: separate admin identity with `read` or `write` role.
- `opaque_records`, `admin_opaque_records`: current OPAQUE registration records.
- `opaque_login_sessions`: expiring server state and authoritative identities for an OPAQUE login attempt.
- `user_password_history`, `admin_password_history`, `user_opaque_record_history`: password policy and recovery/change support.
- `otp_configs`, `otp_backup_codes`: encrypted OTP configuration, replay/lockout state, and single-use backup codes.
- `webauthn_credentials`, `webauthn_challenges`, `trusted_devices`, `device_approval_requests`: passkey and device assurance state.
- `email_verification_tokens`, `password_reset_tokens`: expiring, one-time account lifecycle credentials.

Deletion of a user or admin cascades through owned authentication records where declared by the schema. Token material suitable for bearer use is stored as a hash where the flow permits it.

## Account keys

- `wrapped_root_keys`: legacy wrapped root-key representation.
- `account_keys`: versioned account key identity and lifecycle status.
- `key_envelopes`: wrapped account-key copies associated with an account and wrapping method.
- `recovery_keys`: recovery metadata and wrapped recovery material.
- `user_encryption_keys`: public encryption JWK and wrapped private JWK.

Account root keys and private encryption keys are never stored as plaintext. Key ownership is always bound to `users.sub`; key-delivery policy belongs to the OIDC client, not the account-key rows.

## OAuth and sessions

- `pending_auth`: expiring authorization request state, selected organization, PKCE, redirect, and ZK binding metadata.
- `auth_codes`: client/user/organization-bound, expiring, consumable authorization codes and key-delivery hashes.
- `sessions`: cohort-bound server sessions and refresh-token rotation state.

Authorization completion must copy only validated state from `pending_auth`. Authorization-code consumption and refresh rotation must be atomic. Organization context may be null only for flows whose client policy does not require selection.

## Organizations and authorization

- `organizations`: organization identity and policy such as forced OTP.
- `organization_members`: unique user membership with `active`, `invited`, or `suspended` status.
- `permissions`: stable permission keys.
- `roles`: named permission sets and default/system assignment policy.
- `role_permissions`: role-to-permission mapping.
- `organization_member_roles`: organization membership-to-role mapping, including SCIM provenance.
- `user_permissions`: direct user permission grants.
- `organization_invites`: hashed, expiring invitation credentials and intended role assignments.

A user's organization authorization is derived from an active membership, its assigned roles, role permissions, and any direct user permissions. Admin roles are separate and do not use these tables.

## Federation and provisioning

- `federation_connections`, `federation_connection_domains`: organization OIDC federation configuration and verified domain routing.
- `federation_identities`, `federation_oidc_states`: external identity links and expiring federation request state.
- `scim_connections`, `scim_bearer_tokens`: organization provisioning configuration and hashed bearer credentials.
- `scim_users`, `scim_groups`, `scim_group_members`: external-resource mappings and membership state.

External identifiers are unique within their connection. SCIM-derived assignments retain connection/group provenance so provisioning can remove managed state without removing unrelated grants.

## Audit

- `audit_logs`: timestamped request/security/admin events with actor, client, organization, outcome, resource, and sanitized detail fields.

Audit records must not contain credentials, OPAQUE messages, private or wrapped keys, ZK public keys, key-delivery ciphertext, or reset/verification tokens.

## Schema change checklist

- Define ownership and deletion behavior for every foreign key.
- Add uniqueness and lookup indexes for externally addressed or high-volume fields.
- Preserve atomic consumption for one-time state.
- Provide migration or compatibility handling before removing persisted fields.
- Update models, focused tests, this document, and any affected feature spec together.
