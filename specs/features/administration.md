# Administration and installation

## Administrative access

- The admin application runs on the configured admin port and uses the separate admin authentication cohort.
- Admin accounts authenticate with OPAQUE and hold a coarse `read` or `write` role. The API enforces the role on every privileged mutation.
- Admin sessions, refresh credentials, CSRF state, OTP configuration, and password history remain separate from user accounts.
- Before installation completes, the admin port serves only the token-gated installer. Normal administration becomes available after bootstrap and restart.

## Managed resources

- Administrators can inspect and manage users, organizations, memberships, roles, permissions, OIDC clients, enterprise OIDC connections, SCIM connections, signing keys, settings, branding, email templates, admin accounts, and audit records.
- User operations include creation, profile and status changes, temporary password/reset flows, email-verification state, OTP recovery controls, and revocation of key envelopes or trusted devices.
- Organization operations include lifecycle state, members and roles, forced OTP policy, federation domains, and SCIM provisioning.
- Client operations include redirect and post-logout URI allowlists, grants, scopes, PKCE, token lifetimes, dashboard presentation, secrets, organization selection, and ZK delivery policy.
- Confidential client secrets and SCIM bearer tokens are shown only when created or rotated. Stored values are encrypted or hashed according to their use.

## Settings and presentation

- Database-backed settings are grouped by product area and validated according to their declared type.
- SMTP settings support a test-send action. Email templates are managed separately from transport configuration.
- Branding uses shared semantic tokens and production user surfaces for previews.
- Signing-key management publishes public JWK material without exposing encrypted private material.

## Audit and safety

- Privileged reads and mutations produce sanitized audit context with actor, organization, resource, outcome, and request metadata where applicable.
- Audit records can be searched, inspected, and exported without revealing credentials or protected cryptographic payloads.
- Destructive operations preserve organization safety rules, protected default roles, and other domain invariants enforced by the API.
- Read-only admins must not be able to mutate state even if a client renders an unavailable action.

## Acceptance criteria

1. The admin and user cohorts cannot use each other's credentials or sessions.
2. Every administrative mutation requires a valid admin session, CSRF proof, and write authorization.
3. One-time secrets are never recoverable from later list or detail responses.
4. Installation cannot be replayed after the instance becomes initialized.
5. Administrative actions remain auditable without placing secrets in logs or audit detail.
