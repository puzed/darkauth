# Core product contract

## Scope

DarkAuth is a self-hosted identity provider with:

- OIDC/OAuth endpoints for relying-party clients.
- OPAQUE password authentication for separate `user` and `admin` cohorts.
- Optional OTP, WebAuthn, recovery, federation, and trusted-device flows.
- Organization-scoped membership and role authorization.
- Optional ZK delivery of a client-specific key to an authorized browser client.
- A dedicated administration surface and first-run installer.

DarkAuth does not provide a hosted control plane. Standard OIDC clients must work without participating in DarkAuth key delivery.

## Runtime contract

- The user server listens on `userPort`, default `9080`, and owns the user UI plus public OIDC/OAuth APIs.
- The admin server listens on `adminPort`, default `9081`, and owns installation and administration.
- Before initialization, installation is gated by a one-time token and the normal runtime is unavailable.
- Storage is either remote PostgreSQL or embedded PGLite.
- `config.yaml` contains instance bootstrap/runtime values: database mode and location, ports, UI proxying, KEK passphrase, issuer/public origin, and RP ID.
- Shared mutable application settings live in the `settings` table.
- Private signing material and stored client secrets are encrypted when persisted; the KEK passphrase is not stored in the database.

## Identity and session contract

- `user` and `admin` are distinct cohorts with distinct OPAQUE records and session identities.
- OPAQUE authenticates a password without sending the password to the server.
- Login completion is bound to the identity stored in the server-side OPAQUE login session; client-supplied identity fields are not authoritative.
- Sessions are server-side records with an expiry and cohort. Admin authorization is the coarse `read` or `write` role.
- User authorization combines organization membership, assigned roles, role permissions, and direct permissions.
- Organization context is selected and bound during authorization when a client requires it.

## OIDC/OAuth contract

- Discovery and JWKS are public on the user origin.
- Authorization codes are short-lived, single-use, and bound to the client and redirect URI.
- Public clients use PKCE with `S256`; confidential clients may authenticate with `client_secret_basic`.
- Token, refresh, userinfo, introspection, revocation, and logout behavior is implemented on the user server.
- Refresh tokens are client-bound and rotated on use.
- Token claims are constrained by requested scopes and the selected organization context.

## Key-delivery contract

- ZK key delivery is opt-in per client through `zkDelivery`; it is not part of standard OIDC.
- The client supplies an ephemeral P-256 public JWK. Private components and invalid curve points are rejected.
- Browser code unlocks the account key, derives a client app key using client and organization context, and encrypts it with `ECDH-ES` and `A256GCM`.
- The ciphertext is delivered in the redirect fragment. The authorization server persists hash/binding metadata, not the delivered plaintext key.
- The token response returns verification metadata so the relying party can bind the fragment payload to the authorization-code exchange.
- Hosted-browser ZK protects against passive database/backend access during the designed flow; it does not remove trust in JavaScript served by the DarkAuth and relying-party origins.

## Security invariants

- Never log passwords, OPAQUE payloads, session or OAuth credentials, KEK values, private keys, wrapped account keys, ephemeral ZK keys, or key-delivery ciphertext.
- Validate redirect URIs by exact registered value and constrain post-logout redirects to client registration.
- Consume one-time credentials atomically where concurrency could otherwise permit replay.
- Bind authentication, authorization, organization, redirect, and key-delivery state across every multi-step flow.
- Apply rate limits to authentication, recovery, OTP, and other abuse-sensitive endpoints.
- Audit authentication outcomes and administrative mutations without recording protected payloads.

## Implementation references

- Server lifecycle: `packages/api/src/createServer.ts`
- Context and secret redaction: `packages/api/src/context/createContext.ts`
- HTTP routing: `packages/api/src/http/routers/`
- OIDC controllers: `packages/api/src/controllers/user/`
- Persistence schema: `packages/api/src/db/schema.ts`
- Browser key handling: `packages/user-ui/src/`
