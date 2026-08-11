# Zero-knowledge key delivery

Status: implemented v2 flow and explicit legacy compatibility

## Preconditions

- The client is registered for ZK delivery and has an explicit `key_delivery_version`.
- Authorization Code with PKCE, exact registered redirect URI matching, normal consent/policy checks, and authenticated user context still apply.
- The client creates a fresh ephemeral P-256 ECDH key pair. The private key stays in the client browser; `zk_pub` carries the public JWK.
- A v2 authorization cannot finalize until the user UI has locally unlocked or created ARK.

## V2 flow

1. Client starts `/authorize` with PKCE, state, nonce when used, and `zk_pub`.
2. API validates the authorization request and passes the registered delivery version and validated context to the user UI.
3. User authenticates. If ARK is locked, the UI performs password-envelope, passkey-PRF, trusted-device, recovery, or setup flow.
4. User UI derives CAK from ARK and the validated subject, account-key, client, audience, and organization context.
5. User UI creates a compact JWE with protected header `alg = ECDH-ES`, `enc = A256GCM` for the client's ephemeral public key.
6. User UI computes `base64url(SHA-256(JWE))` and sends only that hash to `/authorize/finalize`.
7. API binds the hash to the one-time authorization code.
8. Browser redirects with the code and state in the query and `darkauth_key_jwe` in the fragment.
9. Client exchanges the code. `/token` returns `zk_key_hash`, `zk_key_kind = "client_app_key"`, and `zk_key_version = "v2"`.
10. Client verifies the fragment hash, decrypts the JWE, verifies every payload binding, removes callback state, and exposes CAK in memory.

## V2 JWE payload

The authenticated payload binds at least:

- key type and version
- `sub`, `client_id`, and `aud`
- `org_id` when authorization is organization-scoped
- authorization request identifier
- hashes of OAuth `state` and redirect URI
- account `key_id`
- `key_kind = "client_app_key"`
- base64url CAK
- short-lived `iat` and `exp`

The client rejects missing, expired, malformed, or mismatched fields and never exposes the key on failure.

## Why the fragment and hash both exist

- URI fragments are not sent to the redirect server in the HTTP request.
- The API never stores or returns the key JWE; it stores only its digest.
- The token-bound digest detects substitution between browser redirect and token exchange.
- Fragment delivery does not protect against code running in the client page. The client origin is inside the hosted-web trust boundary.

## Custody and cleanup

- ARK and CAK remain memory-only by default.
- The ephemeral private key and PKCE verifier may survive the redirect in `sessionStorage` and are deleted after success or failure.
- The client removes the fragment with history replacement before application code continues.
- Reload without in-memory CAK starts a fresh authorization and fresh `zk_pub`.
- Logs, analytics, error reports, and audit records must not capture `zk_pub`, the JWE, its plaintext, or ephemeral private key.

## Legacy v1 DRK flow

- Compatibility is selected only by `key_delivery_version = "v1-drk"` on the registered client.
- The legacy fragment is `drk_jwe`; the token binding is `zk_drk_hash`; the decrypted payload contains legacy DRK/root material.
- Existing DRK may also be migrated as ARK input, but direct root-key delivery remains legacy behavior.
- A v2 registration must not infer, downgrade to, or emit v1 fields.

## Trust statement

The flow protects keys from ordinary redirect requests, token responses, API storage, and backend-only compromise during honest frontend operation. It does not protect a usable key or plaintext from malicious DarkAuth or client JavaScript, XSS, compromised dependencies, extensions, browsers, devices, or an intentionally malicious client.

## Verification

- User UI tests assert v2 uses CAK and `darkauth_key_jwe` and legacy mode remains distinct.
- API authorize/token tests assert delivery configuration, code binding, and returned hash metadata.
- Client SDK tests assert hash-before-decrypt, payload binding, fragment cleanup, and v1 compatibility.
