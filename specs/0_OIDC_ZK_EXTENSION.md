OAuth 2.0 / OpenID Connect: DarkAuth Client-Side Key Delivery Extension

Status: normative target

Abstract

- This document specifies an extension to OAuth 2.0 and OpenID Connect that enables privacy-preserving delivery of client-side encryption keys to relying party (RP) applications during honest hosted-web operation. The extension composes with Authorization Code + PKCE. It does not alter standard token semantics, discovery, or client authentication.
- New clients receive a per-client Client App Key (CAK) derived from the user's Account Root Key (ARK). The ARK is never delivered to OAuth clients.
- Legacy v1 clients may receive the historical DRK payload only when explicitly registered for `key_delivery_version="v1-drk"`.

Notational Conventions

- MUST, SHOULD, and MAY are to be interpreted as described in RFC 2119.
- “Authorization Server” (AS) refers to DarkAuth. “Client” refers to an RP application.

1. Overview

- The user authenticates to the AS using an auth method such as OPAQUE password, passkey, or upstream federation. Authentication establishes identity, not necessarily key unlock.
- The user's Account Root Key (ARK) is generated client-side and stored server-side only as encrypted key envelopes. Password envelopes use an OPAQUE `export_key`-derived wrapping key. Passkey PRF, trusted-device, and recovery envelopes are defined in `specs/USER_KEY_MANAGEMENT.md`.
- ZK-enabled clients supply an ephemeral ECDH public key in the authorization request. After authentication and key unlock, browser code derives a Client App Key (CAK), produces a compact JWE to the RP public key, and completes authorization. **CRITICAL**: The designed flow keeps the key JWE in browser memory and URL fragments, not AS storage or token responses.
- Hosted-web trust boundary: users must trust the JavaScript served by the AS and RP frontend origins while keys and plaintext are usable. Malicious frontend code, XSS, compromised browsers/extensions/devices, supply-chain compromise, or an RP that intentionally exfiltrates secrets can access CAK or plaintext.
- The token response includes a hash that binds the authorization code to the fragment JWE, enabling the client to verify integrity of the out‑of‑band handoff.
- Auxiliary endpoints allow users to manage key envelopes, trusted devices, recovery keys, and long-term public encryption keys.

2. Cryptographic Building Blocks

- OPAQUE: used for password authentication and password-envelope unlock. The OPAQUE `export_key` remains client-side.
- ARK: 32-byte random Account Root Key generated client-side. The AS stores ARK only as encrypted key envelopes.
- CAK: per-client Client App Key derived from ARK:
  - `CAK = HKDF-SHA256(ARK, salt = H("DarkAuth|v2|client-key|sub=" + sub + "|key_id=" + key_id), info = "client_id=" + client_id + "|org_id=" + org_id + "|aud=" + aud, length = 32)`
- JWE: ECDH-ES (P-256) with A256GCM (compact serialization) for CAK handoff to clients.
- Hash binding: `zk_key_hash = base64url(SHA-256(darkauth_key_jwe))`.
- Legacy binding: `zk_drk_hash = base64url(SHA-256(drk_jwe))` only for clients registered with `key_delivery_version="v1-drk"`.

3. Discovery and Compatibility

- Discovery and JWKS remain standard. The extension is opt‑in per client; non‑ZK clients operate unchanged.
- Client metadata (registration):
  - zk_delivery: "none" | "fragment-jwe" (MUST be "fragment-jwe" to use this extension)
  - key_delivery_version: "v2-client-key" | "v1-drk"
  - client_key_scope: "account" | "organization"
  - allowed_jwe_algs: ["ECDH-ES"]
  - allowed_jwe_encs: ["A256GCM"]

4. Authorization Request Extension

- Parameter: zk_pub
  - Value: base64url(JSON JWK) for an ephemeral ECDH P‑256 public key (kty="EC", crv="P-256", x, y).
  - Preconditions:
    - Client zk_delivery MUST be "fragment-jwe".
    - PKCE with S256 MUST be used.
  - **Validation Requirements**:
    - **Format**: MUST be valid `base64url(JSON.stringify(JWK))`
    - **JWK Structure**: MUST contain `kty="EC"`, `crv="P-256"`, valid `x` and `y` coordinates
    - **Coordinate Validation**: `x` and `y` MUST be 32-byte base64url-encoded values representing valid P-256 curve points
    - **Cryptographic Validation**: Server MUST verify the public key lies on the P-256 curve
    - **Rejection Policy**: Server MUST return `invalid_request` for malformed, invalid, or weak keys
    - **Privacy**: MUST NOT contain private key components (`d` field)
  - Server behavior:
    - If zk_pub is present and the client is ZK‑enabled, compute zk_pub_kid = SHA‑256 over the exact zk_pub string and bind it to the pending authorization request.
    - Servers MUST NOT log zk_pub or any derived cryptographic material.

5. Authorization Finalization

- Endpoint: POST /authorize/finalize
- Auth: End‑user session at the AS is required.
- Request (form‑encoded):
  - request_id: string (required)
  - zk_key_hash: string (base64url) (REQUIRED for v2 ZK requests)
  - drk_hash: string (base64url) (REQUIRED only for legacy v1 ZK requests)
- Server actions:
  - Validate the pending request and session; issue an authorization code (TTL ≤ 60 s).
  - If zk_pub_kid was present for a v2 client, `zk_key_hash` MUST be present; otherwise return invalid_request.
  - If zk_pub_kid was present for a legacy v1 client, `drk_hash` MUST be present; otherwise return invalid_request.
  - If zk_pub_kid was present, set has_zk = true and store the appropriate hash metadata.
  - Do not redirect; return JSON { redirect_uri, code, state } so the Auth UI can attach the fragment.
- Client (Auth UI) action for ZK flow:
  - For v2 clients, derive CAK from ARK and construct `darkauth_key_jwe = JWE_ECDH-ES_A256GCM(payload={key_kind:"client_app_key", cak, sub, client_id, aud, request_id, state_hash, redirect_uri_hash, key_id, iat, exp}, zk_pub)`.
  - Compute `zk_key_hash`; send in finalize; then navigate to redirect_uri with the fragment: `#darkauth_key_jwe=<url-encoded>`.
  - For legacy v1 clients, construct `drk_jwe`, send `drk_hash`, and use `#drk_jwe=<url-encoded>`.

6. Token Endpoint Extension

- Endpoint: POST /token (unchanged grant = authorization_code)
- Response additions when has_zk = true on the code:
  - v2: `zk_key_hash`, `zk_key_kind="client_app_key"`, `zk_key_version="v2"`
  - legacy v1: `zk_drk_hash`
- **CRITICAL SECURITY**: Token endpoint MUST NOT return key-delivery JWE ciphertext. The server stores only the hash for verification. When `has_zk=false` on the code, all ZK hash fields MUST be omitted.
- JWE is delivered via URL fragment, not through server responses.
- Clients MUST verify `base64url(SHA-256(fragment_jwe))` equals the token response hash before decrypting.

7. Keybag Storage Endpoints

- GET /crypto/keybag
- POST /crypto/keybag/account-key
- GET /crypto/keybag/envelopes
- POST /crypto/keybag/envelopes
- DELETE /crypto/keybag/envelopes/{envelope_id}
- POST /crypto/keybag/recovery
- POST /crypto/keybag/rotate
- Semantics:
  - Key envelopes wrap ARK for password, passkey PRF, trusted-device, and recovery unlock methods.
  - Password envelopes use a wrapping key derived from OPAQUE `export_key`.
  - The AS stores envelope ciphertext and metadata only.
  - AS MUST require an authenticated end‑user session. AS MUST NOT accept empty or oversized payloads.
  - Legacy `GET/PUT /crypto/wrapped-drk` MAY remain for `key_delivery_version="v1-drk"` migration.

8. User Encryption Key Endpoints

- PUT /crypto/enc-pub with { enc_public_jwk }
  - Upserts the caller’s long‑term public encryption JWK (e.g., ECDH P‑256). Used for user‑to‑user messaging or data sharing.
- GET /crypto/user-enc-pub?sub=... → { enc_public_jwk }
  - Visibility is governed by server setting enc_public_visible_to_authenticated_users. When false, only the owner may read.
- PUT /crypto/wrapped-enc-priv with { wrapped_enc_private_jwk }
  - Stores the caller’s private encryption JWK encrypted under an ARK-derived key. Used for recovery on new devices after key unlock.
- GET /crypto/wrapped-enc-priv → { wrapped_enc_private_jwk } or 404
- All endpoints require an authenticated end‑user session. Servers MUST bound payload sizes and reject invalid base64url inputs.

9. ZK Client Flow (End‑to‑End)

- App generates an ephemeral ECDH P‑256 keypair and calls /authorize with zk_pub and standard OIDC parameters (PKCE S256 required).
- User authenticates via OPAQUE, passkey, or upstream federation in the Auth UI.
- If the client requests ZK, the Auth UI unlocks ARK using an allowed unlock method or routes the user through key setup.
- For v2 clients, the browser derives CAK, creates `darkauth_key_jwe` to `zk_pub`, computes `zk_key_hash`, calls /authorize/finalize, then navigates to the redirect_uri with `#darkauth_key_jwe`.
- App parses fragment, calls /token, verifies `zk_key_hash`, decrypts the JWE with its ephemeral private key, verifies payload metadata, and obtains CAK.
- Legacy v1 apps use `drk_jwe` / `zk_drk_hash` only by explicit registration.
- Standard clients omit zk_pub and proceed unchanged.

10. Security Considerations

- Confidentiality:
  - ARK and CAK are not transmitted to or stored by the AS in plaintext in the designed flow. Password wrapping keys are derived client-side; during honest frontend operation the AS does not observe export_key, envelope wrapping keys, ARK, or CAK.
  - The fragment JWE is produced client-side and delivered via URL fragment rather than AS token responses or AS storage.
  - These claims depend on trusted frontend code. Same-origin malicious JavaScript, XSS, compromised browsers/extensions/devices, or an RP that intentionally exfiltrates secrets can access CAK or plaintext in the browser.
- Binding and replay:
  - The token response hash binds the out-of-band fragment to the authorization code. Clients MUST verify the hash prior to decryption.
- Authorization codes MUST be single‑use and short‑lived (≤ 60 s), and code consumption at redemption MUST be atomic to prevent concurrent double redemption. PKCE S256 MUST be enforced for public clients and SHOULD be enforced generally.
- Downgrade resilience:
  - Servers MUST only honor zk_pub for clients registered with zk_delivery = "fragment-jwe".
  - Servers MUST ignore or reject zk_pub for non‑ZK clients.
- **Logging and secrets handling**:
  - **Prohibited**: Servers MUST NOT log `zk_pub`, `darkauth_key_jwe`, `drk_jwe`, key envelopes, `wrapped_drk`, or any cryptographic payloads
  - **Safe audit logging**: Log only metadata (timestamps, client_id, user subjects, success/failure outcomes)  
  - **Hash correlation**: Use `zk_pub_kid`, `zk_key_hash`, and legacy `drk_hash` for debugging/correlation, never the source values
  - **Production requirements**: Implement structured logging with explicit field filtering to prevent accidental disclosure; retain audit logs for a documented period and encrypt them at rest
  - **Development**: Even in development, MUST NOT log cryptographic material - only high-level flow events
- Key algorithms:
  - JWE alg MUST be ECDH‑ES on P‑256; enc MUST be A256GCM. Clients SHOULD validate header alg and enc before decryption.
- Sessions/tokens:
  - Standard OIDC protections apply.
  - First-party web profile uses an HttpOnly cookie session at the AS (`__Host-DarkAuth`, `Secure`, `HttpOnly`, `SameSite=Lax`) with CSRF protection.
  - First-party refresh credential is also an HttpOnly cookie (`__Host-DarkAuth-User-Refresh`) and MUST NOT be exposed to JavaScript.
  - Silent renewal is performed with standard OAuth refresh grant for a public client (`authorization_code` + PKCE S256).
  - Refresh tokens are rotated single-use, client-bound, and replay-rejected; successful refresh reissues the first-party session cookie.
  - First-party API transport remains cookie-based; bearer access/session tokens are not persisted for first-party API auth.
  - The OPAQUE `export_key` used to unwrap password envelopes is not a transport token; it MAY be cached only in session-scoped browser storage and on loss (for example browser restart) MUST be restored via step-up OPAQUE password verification before password-envelope unlock continues.
- Key custody:
  - RP apps MUST treat memory-only CAK custody as the default hosted-web ZK profile.
  - After callback handling, apps MUST remove key-delivery JWE fragments from the URL and clear the ephemeral ZK private key.
  - Reload without an in-memory CAK SHOULD start a fresh authorization request with a new `zk_pub`.
  - Persistent plaintext ARK or CAK storage in `localStorage`, `sessionStorage`, JS-readable cookies, or IndexedDB MUST NOT be the default and MUST NOT be described as cryptographic protection.
  - Persistent trusted-device convenience may store only encrypted envelopes and local non-extractable key handles where supported.
- Deployment and incident response:
  - Trusted AS and RP frontend origins MUST be explicit, HTTPS in production, and aligned with registered redirect URIs and `allowed_zk_origins`; wildcard origins and user-scriptable trusted origins are prohibited for serious hosted-web ZK deployments.
  - On suspected frontend compromise, operators SHOULD disable affected ZK clients or ZK delivery, revoke sessions and refresh tokens, redeploy clean frontend assets, review audit metadata, notify affected users, and require key unlock before resuming key handoff.

11. Privacy Considerations

- During honest frontend operation, the AS does not learn user passwords through OPAQUE or ARK/CAK contents from server-side state. The AS stores only wrapped artifacts and hash metadata. The ephemeral zk_pub is provided by the client per authorization and SHOULD NOT be reused across authorizations to limit linkability.

12. Errors

- invalid_request: malformed or missing parameters (including bad zk_pub; missing redirect_uri; absent code_verifier when PKCE required).
- unauthorized_client: client not registered for zk_delivery or using an unsupported client authentication method.
- invalid_grant: invalid/expired/consumed code; PKCE verification failure; redirect_uri mismatch.
- access_denied: user canceled or login failed.
- server_error: generic failures.

13. Backwards Compatibility

- Clients that do not include zk_pub interoperate with standard OIDC flows unchanged.
- **CRITICAL SECURITY**: Servers MUST NOT return key-delivery JWE ciphertext in token responses; the JWE is delivered via URL fragment.
- **Server storage**: Servers store hash values for verification binding, not JWE ciphertext.
- **Fragment-only delivery**: JWE is produced in browser code and handled through client memory and URL fragments, not server responses or storage in the designed flow.
- **Release-note warning**: Changes that make CAK custody memory-only by default affect reload behavior. App developers and operators MUST warn that reloads may require a fresh ZK authorization and may require key unlock when no local unlock method is available.

14. IANA Considerations

- None.

Appendix A: Data Formats

- zk_pub (request parameter): base64url(JSON.stringify(JWK)), where JWK has kty="EC", crv="P-256", x, y.
- darkauth_key_jwe (fragment field): compact JWE with protected header { alg:"ECDH-ES", enc:"A256GCM" } and payload containing key metadata and CAK.
- drk_jwe: legacy fragment field for v1 clients only.
- key envelope: base64url or bytea AEAD ciphertext. AAD MUST contain sub, key_id, envelope_id, type, and wrapping_alg.
