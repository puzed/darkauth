# Enterprise federation and SCIM

## Ownership and boundaries

- Enterprise connections belong to exactly one organization.
- Federation provides OIDC SSO. OIDC is the only supported federation protocol; SAML and group-based federation are not product behavior.
- SCIM provides directory provisioning through separate connection, credential, user, and group records.
- Federation authentication state and SCIM provisioning state remain separate even though the portal groups them under Enterprise Connections.
- Instance admins can inspect and manage connections across all organizations. Organization users require `darkauth.org:manage` for connection management.
- Connection creation, updates, domain verification, token creation or revocation, login, and provisioning activity carry organization and enterprise-connection audit context.

## OIDC federation

- A connection stores its organization, issuer and discovery metadata, client credentials, scopes, claim mapping, account-linking policy, enabled state, and ZK unlock policies.
- OIDC discovery accepts public HTTPS endpoints and rejects loopback, link-local, private-network, and other internal targets.
- Client secrets are encrypted at rest, are never returned by reads, and are replaced rather than recovered.
- Login state is short-lived and binds the connection, organization, redirect continuation, nonce, and PKCE material.
- The callback validates issuer, audience, signature, nonce, state, mapped claims, and the connection's email-verification and account-linking policy.
- External identities are keyed by connection and upstream subject. A global DarkAuth user may link identities from connections in different organizations.

## Domains and routing

- Domains are normalized connection records with `pending`, `verified`, or `failed` verification status.
- Verification uses a connection-specific DNS TXT challenge. Routing is inactive until verification succeeds.
- Only one enabled, verified connection may own a domain. Multiple pending claims are allowed.
- Email routing considers enabled OIDC connections and enabled, verified domains only.
- An explicit organization restricts routing to that organization. An explicit connection must be enabled and valid for the selected organization.
- No match leaves the user on local sign-in. Ambiguous verified ownership is rejected rather than choosing a connection.
- A domain is a routing control, not proof of the callback identity.

## Membership and provisioning policy

- A successful federated login always resolves membership in the connection's organization.
- `jitProvisioning` permits creation of a global user when no local user exists.
- `membershipOnAuthentication` permits creating or activating membership in the connection organization.
- `requireScimPreProvisioning` requires an existing active membership provisioned before OIDC login.
- Federation-created users do not receive a personal organization.
- The completed user session selects the connection organization and applies its OTP policy.
- `accountLinkingPolicy` controls whether an upstream identity may attach to an existing local account. Verified-email linking is the normal safe default.

## ZK access after federation

- OIDC proves identity but does not reveal or recreate the user's DRK.
- Connection policy determines whether a password is required for ZK clients and whether passkey PRF, trusted-device approval, or a non-ZK setup bypass is available.
- A federated session without a valid unlock method may use non-ZK clients but cannot receive ZK key material when policy requires an unlocked key.

## SCIM connections and credentials

- A SCIM connection belongs to one organization and carries its deprovisioning and deletion-safety policy. Instance settings hold the group-to-role mappings and unknown-group policy, and mappings must match the connection organization.
- Each bearer token belongs to one SCIM connection and organization. The plaintext token is shown once; only its hash and identifying prefix are retained.
- Tokens may expire or be revoked. Reads expose metadata such as name, prefix, creation, expiry, last use, and revocation, not the credential.
- The SCIM base API is `/scim/v2`. Authentication resolves the organization exclusively from the bearer token; request data cannot select another organization.
- SCIM requests are rate-limited and audited as a distinct `scim` cohort.

## SCIM users, groups, and roles

- SCIM users are global DarkAuth users associated with a connection-specific external identity and membership in the connection organization.
- Create, replace, patch, list, read, and deactivation operations are scoped to that connection and organization.
- Deactivation suspends the organization membership and revokes affected server-side sessions, refresh state, authorization requests, and authorization codes. It does not delete the global user or unrelated organization memberships.
- SCIM groups are upstream directory objects, not DarkAuth authorization groups.
- SCIM group membership can assign mapped DarkAuth roles to organization memberships. Role assignment provenance is retained so removing a SCIM mapping does not remove independently assigned roles.
- Unknown-group behavior and role mappings follow instance settings scoped by mapping organization. Role and permission definitions remain instance-admin controlled.
- SCIM never exposes passwords, OPAQUE records, recovery keys, DRKs, client app keys, or plaintext key envelopes.

## Portal behavior

- Organization managers use the organization Enterprise Connections surface to configure OIDC, domains, verification, policies, SCIM connections, and SCIM tokens.
- The admin Federation view is a cross-organization overview and identifies each connection's organization, status, domains, and activity.
- Admin SCIM views require organization and connection context for token issuance and show connection health and credential metadata.
- Read admins can inspect connection configuration and routing state. Write admins are required to create, change, verify, disable, delete, issue, or revoke.
