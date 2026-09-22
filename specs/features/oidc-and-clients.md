# OIDC and clients

## Provider Contract

- DarkAuth is an OpenID Provider implementing the authorization-code flow. Discovery and JWKS are available from the public user origin.
- Supported protocol endpoints include authorization, authorization finalization, token exchange, UserInfo, introspection, revocation, JWKS, and RP-initiated logout.
- Authorization requests are stored as short-lived pending records bound to the browser session and client. Authorization codes are single-use, expire after at most 60 seconds, and are bound to the client, redirect URI, organization context, PKCE data, nonce, and any ZK delivery request.
- Public clients authenticate with `token_endpoint_auth_method: none`; confidential clients use `client_secret_basic`. Confidential secrets are returned only when created or rotated and are encrypted at rest.
- PKCE uses `S256`. A client can require PKCE; public clients are configured to use it by default.
- Token exchange rejects client, redirect-URI, code, or verifier mismatches. Refresh credentials are client-bound, rotated on use, and reject replay.
- ID tokens can include organization, role, permission, `amr`, and `acr` context derived from the completed authentication and selected organization.

## Client Contract

- Each client defines a unique ID, display name, `public` or `confidential` type, token endpoint authentication method, redirect URI allowlist, post-logout redirect URI allowlist, grant types, response types, scopes, and optional token lifetimes.
- Redirect and post-logout redirect matching is exact. A URI that was not registered for that client is rejected.
- Clients can require organization selection and can be displayed as applications in the user dashboard.
- Standard clients set `zkDelivery: "none"` and consume ordinary OIDC tokens with any conforming OIDC library.
- ZK clients use `zkDelivery: "fragment-jwe"`, declare allowed JWE algorithms, encryption methods, and origins, and choose the implemented key-delivery version and key scope. `zkRequired` prevents completion without an unlocked user key.
- ZK delivery is an extension to the authorization-code flow; it does not change client authentication, redirect validation, code binding, or token validation rules.

## Remembered Consent

- Approving an authorization records a consent in `user_client_consents` keyed by user and client: granted scopes, selected organization, and timestamps.
- A later authorization for the same client whose scopes are covered by the consent skips the approval screen and finalizes automatically, unless:
    - the client sets `rememberConsent: false` (default `true`);
    - the client requires organization selection and the user has other than exactly one eligible organization, or names an organization that is not that one;
    - the request carries `prompt=consent`, `prompt=login`, or `prompt=select_account`.
- `prompt=login` and `prompt=select_account` require a fresh authentication for that request; an existing session cannot approve it.
- With `prompt=none`, a request that cannot finalize silently returns `consent_required` or `login_required` to the redirect URI. If the browser then cannot restore the key without asking the user, it returns `interaction_required` rather than showing an unlock step.
- Silent finalization is still bound to the registered redirect URI, PKCE, and a fresh `zk_pub`. ZK requests are included: the user UI restores ARK from the session unlock envelope and delivers CAK without a prompt.
- New scopes, a lost organization membership, or a locked key that cannot be restored show the normal authorization screen. Approving it updates the consent.
- Denying does not record or clear consent.
- Access tokens carry `sid`, the sign-in that authorized them. Sessions created later from that token, such as organization switching, inherit it and are revoked with that sign-in.
- `POST /authorize/restart` returns an expired authorization request to the client: it validates `client_id` and the exact registered `redirect_uri`, then returns that URI with `error=invalid_request` and the original `state`. The user UI sends the browser there rather than stranding it on an error page.
- Users review and revoke consents in the portal. Revoking deletes the consent and revokes that client's refresh sessions for the user; the next authorization shows the approval screen.

## Upstream Federation

- Upstream federation is OIDC-only. Connection creation and routing accept `type: "oidc"`; SAML is not an implemented federation type.
- Enabled connections define issuer, client credentials, scopes, claim mapping, optional organization/domain routing, account-link policy, and unlock policy.
- Federation start creates state and nonce bound to a short-lived `__Host-DarkAuth-Federation` cookie. Callback handling validates state, issuer, signature, audience, nonce, and subject before linking or signing in.
- A successful upstream login creates a DarkAuth user session. It does not turn the upstream provider's tokens into a DarkAuth client session.
- Federated authentication can leave the user's encryption key locked. Non-ZK access can be permitted by connection policy; ZK authorization still requires an allowed key setup or unlock method.
- SCIM is provisioning, not federation or authentication. A SCIM-provisioned user must still sign in with a configured DarkAuth authentication method.

## Revocation and Logout

- Refresh-token revocation deletes the matching active client-bound session. Revoking stateless access or ID tokens is a successful no-op; their configured short lifetime limits use.
- RP-initiated logout follows the behavior in `specs/features/authentication-and-sessions.md` and validates redirects against the resolved client's post-logout allowlist.
