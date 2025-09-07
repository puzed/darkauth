OAuth 2.0 / OpenID Connect: DarkAuth DRK and Client‑Side Key Delivery Extension

Status: Adopted (DarkAuth v1)

Abstract

- This document specifies an extension to OAuth 2.0 and OpenID Connect that enables privacy‑preserving delivery of a per‑user Data Root Key (DRK) to relying party (RP) applications, and defines auxiliary endpoints for publishing user encryption keys. The extension composes with standard Authorization Code + PKCE. It does not alter token semantics, discovery, or client authentication.

Notational Conventions

- MUST, SHOULD, and MAY are to be interpreted as described in RFC 2119.
- “Authorization Server” (AS) refers to DarkAuth. “Client” refers to an RP application.

1. Overview

- The user authenticates to the AS using OPAQUE (RFC 9380). The client never learns the password; the AS never receives the password.
- The OPAQUE export_key deterministically derives a wrapping key KW on the user device. KW wraps a randomly generated Data Root Key (DRK). The AS stores only the wrapped DRK; the AS never sees KW or DRK.
- ZK‑enabled clients supply an ephemeral ECDH public key in the authorization request. After user login, browser code produces a compact JWE of the DRK to that key and completes the authorization. **CRITICAL**: The DRK JWE exists solely in client memory and URL fragments - never stored by or transmitted through the AS.
- The token response includes a hash that binds the authorization code to the fragment JWE, enabling the client to verify integrity of the out‑of‑band handoff.
- Auxiliary endpoints allow users to publish their long‑term public encryption key and store a DRK‑wrapped private key for recovery/portability.

2. Cryptographic Building Blocks

- PAKE: OPAQUE (RFC 9380) is used for password authentication and to obtain export_key on the client.
- Key derivation (client):
  - MK = HKDF‑SHA256(export_key, salt = H("DarkAuth|v1|tenant=default|user=" + sub), info = "mk")
  - KW = HKDF‑SHA256(MK, salt = "DarkAuth|v1", info = "wrap-key")
- DRK: 32‑byte random value generated client‑side on first login; wrapped and persisted server‑side under KW using AEAD (AES‑256‑GCM). AAD MUST include sub.
- JWE: ECDH‑ES (P‑256) with A256GCM (compact serialization) for DRK handoff to clients.
- Hash binding: drk_hash = base64url(SHA‑256(drk_jwe)).

3. Discovery and Compatibility

- Discovery and JWKS remain standard. The extension is opt‑in per client; non‑ZK clients operate unchanged.
- Client metadata (registration):
  - zk_delivery: "none" | "fragment-jwe" (MUST be "fragment-jwe" to use this extension)
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
  - drk_hash: string (base64url) (REQUIRED when zk_pub was provided)
- Server actions:
  - Validate the pending request and session; issue an authorization code (TTL ≤ 60 s).
  - If zk_pub_kid was present, set has_zk = true and store drk_hash when provided.
  - Do not redirect; return JSON { redirect_uri, code, state } so the Auth UI can attach the fragment.
- Client (Auth UI) action for ZK flow:
  - Construct drk_jwe = JWE_ECDH‑ES_A256GCM(DRK, zk_pub) with AAD = { sub, client_id }.
  - Compute drk_hash; send in finalize; then navigate to redirect_uri with the fragment: `#drk_jwe=<url-encoded>`.

6. Token Endpoint Extension

- Endpoint: POST /token (unchanged grant = authorization_code)
- Response additions when has_zk = true on the code:
  - zk_drk_hash: string (base64url of SHA‑256(drk_jwe))
- **CRITICAL SECURITY**: Token endpoint NEVER returns `zk_drk_jwe`. The server does not store JWE ciphertext - only the hash for verification.
- JWE is transmitted ONLY via URL fragment, never through server responses.
- Clients MUST verify base64url(SHA‑256(fragment drk_jwe)) == zk_drk_hash before decrypting.

7. DRK Storage Endpoints

- GET /crypto/wrapped-drk → { wrapped_drk } or 404
- PUT /crypto/wrapped-drk with { wrapped_drk }
- Semantics:
  - wrapped_drk is AEAD(KW, DRK, aad = sub). Only the client can unwrap using KW derived from export_key.
  - AS MUST require an authenticated end‑user session. AS MUST NOT accept empty or oversized payloads.

8. User Encryption Key Endpoints

- PUT /crypto/enc-pub with { enc_public_jwk }
  - Upserts the caller’s long‑term public encryption JWK (e.g., ECDH P‑256). Used for user‑to‑user messaging or data sharing.
- GET /crypto/user-enc-pub?sub=... → { enc_public_jwk }
  - Visibility is governed by server setting enc_public_visible_to_authenticated_users. When false, only the owner may read.
- PUT /crypto/wrapped-enc-priv with { wrapped_enc_private_jwk }
  - Stores the caller’s private encryption JWK encrypted under a DRK‑derived key. Used for recovery on new devices after OPAQUE.
- GET /crypto/wrapped-enc-priv → { wrapped_enc_private_jwk } or 404
- All endpoints require an authenticated end‑user session. Servers MUST bound payload sizes and reject invalid base64url inputs.

9. ZK Client Flow (End‑to‑End)

- App generates an ephemeral ECDH P‑256 keypair and calls /authorize with zk_pub and standard OIDC parameters (PKCE S256 required).
- User authenticates via OPAQUE in the Auth UI. The browser derives KW from export_key, retrieves or creates DRK, and ensures the server has a wrapped DRK.
- If zk_pub was supplied, the browser creates drk_jwe to zk_pub, computes drk_hash, calls /authorize/finalize, then navigates to the redirect_uri with `#drk_jwe`.
- App parses fragment, calls /token, verifies zk_drk_hash, and decrypts drk_jwe with its ephemeral private key to obtain DRK.
- Standard clients omit zk_pub and proceed unchanged.

10. Security Considerations

- Confidentiality:
  - DRK is never transmitted to or stored by the AS in plaintext. KW is derived client‑side; the AS never observes export_key or KW.
  - The fragment JWE is never seen by the AS; it is produced client‑side and transmitted only via URL fragment.
- Binding and replay:
  - drk_hash binds the out‑of‑band fragment to the authorization code. Clients MUST verify the hash prior to decryption.
  - Authorization codes MUST be single‑use and short‑lived (≤ 60 s). PKCE S256 MUST be enforced for public clients and SHOULD be enforced generally.
- Downgrade resilience:
  - Servers MUST only honor zk_pub for clients registered with zk_delivery = "fragment-jwe".
  - Servers MUST ignore or reject zk_pub for non‑ZK clients.
- **Logging and secrets handling**:
  - **Prohibited**: Servers MUST NOT log `zk_pub`, `drk_jwe`, `wrapped_drk`, or any cryptographic payloads
  - **Safe audit logging**: Log only metadata (timestamps, client_id, user subjects, success/failure outcomes)  
  - **Hash correlation**: Use `zk_pub_kid` and `drk_hash` for debugging/correlation, never the source values
  - **Production requirements**: Implement structured logging with explicit field filtering to prevent accidental disclosure
  - **Development**: Even in development, MUST NOT log cryptographic material - only high-level flow events
- Key algorithms:
  - JWE alg MUST be ECDH‑ES on P‑256; enc MUST be A256GCM. Clients SHOULD validate header alg and enc before decryption.
- Sessions and cookies:
  - Standard OIDC protections apply. Session cookies MUST be Secure + HttpOnly with SameSite=Lax or stricter.

11. Privacy Considerations

- The AS does not learn user passwords (OPAQUE) or DRK contents. The AS stores only wrapped artifacts. The ephemeral zk_pub is provided by the client per authorization and SHOULD NOT be reused across authorizations to limit linkability.

12. Errors

- invalid_request: malformed or missing parameters (including bad zk_pub; missing redirect_uri; absent code_verifier when PKCE required).
- unauthorized_client: client not registered for zk_delivery or using an unsupported client authentication method.
- invalid_grant: invalid/expired/consumed code; PKCE verification failure; redirect_uri mismatch.
- access_denied: user canceled or login failed.
- server_error: generic failures.

13. Backwards Compatibility

- Clients that do not include zk_pub interoperate with standard OIDC flows unchanged.
- **CRITICAL SECURITY**: Servers MUST NOT return `zk_drk_jwe` in token responses; the JWE is transmitted only via URL fragment.
- **Server storage**: Servers NEVER store JWE ciphertext - only hash values for verification binding.
- **Fragment-only delivery**: JWE exists solely in client memory and URL fragments, never in server responses or storage.

14. IANA Considerations

- None.

Appendix A: Data Formats

- zk_pub (request parameter): base64url(JSON.stringify(JWK)), where JWK has kty="EC", crv="P-256", x, y.
- drk_jwe (fragment or token field): compact JWE with protected header { alg:"ECDH-ES", enc:"A256GCM" } and AAD containing { sub, client_id }.
- wrapped_drk: base64url of AES‑GCM ciphertext. AAD MUST contain sub.

