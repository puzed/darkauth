# OIDC RP-initiated logout

Status: completed

## Delivered

- [x] Advertise `end_session_endpoint` in OIDC discovery.
- [x] Implement browser-based logout with `id_token_hint`, `client_id`, `post_logout_redirect_uri`, and `state`.
- [x] Require exact per-client redirect allowlisting and explicit confirmation when no valid token hint is present.
- [x] Add user-facing confirmation and signed-out views while preserving first-party logout behavior.
- [x] Add client SDK support through `endSession()`.
- [x] Cover endpoint validation and redirect behavior in API tests and integration documentation.

## Evidence

- Endpoint, UI, tests, and documentation: PR #161 (`79ca0e8`).
- Core implementation commits: `6148fb2`, `9aea908`, `08092de`.
- Client SDK support: PR #169 (`6f08314`).
