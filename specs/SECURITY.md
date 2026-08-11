# Security Model

Status: implemented behavior and constraints

## Trust boundaries

- DarkAuth separates identity authentication from encryption-key unlock. A valid `session` does not imply that the browser has unlocked an Account Root Key (ARK).
- The API stores OPAQUE records, encrypted key envelopes, public keys, hashes, and metadata. During honest frontend operation it does not receive the password, OPAQUE `export_key`, envelope wrapping keys, plaintext ARK, or Client App Key (CAK).
- Hosted web zero knowledge depends on the JavaScript served by the DarkAuth user origin and the client origin. Same-origin malicious code, XSS, a compromised dependency, browser extension, browser, or device can read a usable ARK, CAK, or plaintext.
- An authorized client can deliberately retain or disclose its CAK and plaintext. Per-client derivation limits that client's access; it does not make the client trustworthy.
- Backend or database compromise alone should expose ciphertext and metadata, not plaintext keys. This claim does not cover an attacker that can change frontend assets.

## Key boundaries

- ARK is a browser-generated random 32-byte account root.
- The API stores ARK only inside authenticated key envelopes. Password envelopes are wrapped with a key derived client-side from the OPAQUE `export_key`.
- A v2 zero-knowledge client receives a CAK derived from ARK with subject, account-key, client, audience, and organization context. It never receives ARK.
- Plaintext ARK and CAK are memory-only by default. `localStorage`, `sessionStorage`, JavaScript-readable cookies, and IndexedDB plaintext are not supported security boundaries.
- Temporary PKCE and ephemeral delivery-key state may use `sessionStorage` for redirect continuity and must be removed after callback handling.
- Non-extractable browser keys can reduce at-rest exposure, but same-origin code can still invoke them while available.

## Delivery boundary

- The client creates a fresh ephemeral P-256 ECDH key pair for authorization and sends only its public JWK as `zk_pub`.
- The user UI unlocks ARK, derives CAK, and encrypts a short-lived metadata-bound payload as compact `ECDH-ES`/`A256GCM` JWE.
- The API receives and persists only the JWE hash on authorization finalization. The browser appends `darkauth_key_jwe` to the redirect URI fragment.
- The token response returns `zk_key_hash`, `zk_key_kind`, and `zk_key_version`, never the JWE or plaintext key.
- The client must verify the hash and payload bindings before exposing CAK, then remove fragment and ephemeral callback state.

## Legacy compatibility

- `key_delivery_version = "v1-drk"` is compatibility behavior for explicitly registered legacy clients. It uses `drk_jwe` and `zk_drk_hash` and delivers the user's legacy DRK/root material.
- Existing DRK material may seed ARK during migration. This does not make direct root-key delivery acceptable for v2 clients.
- `key_delivery_version = "v2"` uses CAK delivery and must not silently fall back to legacy DRK delivery.

## Operational controls

- Session and refresh cookies use `HttpOnly`, `Secure` in production, and an appropriate `SameSite` policy. Keys never belong in cookies.
- Logs and audit events must redact passwords, OPAQUE messages, authorization codes, PKCE verifiers, tokens, `zk_pub`, JWEs, envelopes, wrapped private keys, and derived key material.
- Authorization requests validate the registered redirect URI, PKCE, client ZK configuration, and P-256 public key before key delivery.
- Authorization codes and device approvals are short-lived and single-use. Key JWE payloads include issue and expiry times.
- Security-sensitive responses and frontend assets require restrictive CSP and cache policy appropriate to their runtime.

## Verification

- API keybag tests cover envelope ownership, metadata, and revocation behavior.
- User UI authorization tests cover v2 CAK derivation and `darkauth_key_jwe` handoff.
- Client SDK tests cover fragment hash verification, JWE metadata validation, cleanup, and legacy compatibility.
- Logger safety tests cover sensitive key and protocol field names.
