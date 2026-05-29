# Hosted Web Zero-Knowledge Security Review

## Status

Implemented security-hardening pass. The checklist at the end records the completed work and the explicit follow-up decisions.

This document captures the security review of DarkAuth's hosted web zero-knowledge model, including legacy DRK handoff and the keybag-based client-key handoff defined in `specs/USER_KEY_MANAGEMENT.md`.

- `auth.darknotes.com`: DarkAuth user UI, OIDC provider, OPAQUE login, wrapped DRK recovery, and fragment JWE creation.
- `app.darknotes.com`: Relying party app that stores only encrypted user data on its server and decrypts data in the user's browser.

The goal is not to make browser JavaScript invisible to the application. The goal is to ensure DarkAuth and app backends do not receive the user's password, `export_key`, plaintext DRK, or plaintext app data during honest operation.

## Security Claim

The strongest accurate hosted-web claim is:

If the user trusts their device and browser, trusts the JavaScript served by `auth.example.com` and `app.example.com`, and trusts the service operator not to deliberately ship code that captures passwords, keys, or plaintext, then DarkAuth's backend and the app backend cannot decrypt the user's encrypted app data.

This protects against:

- Database compromise of DarkAuth where the attacker gets OPAQUE records and wrapped DRK ciphertext.
- Database compromise of the app where the attacker gets only encrypted user content.
- Honest-but-curious backend services.
- Network observers when HTTPS is correctly deployed.
- Standard OIDC clients that do not opt into ZK delivery.

This does not protect against:

- Malicious JavaScript served by `auth.example.com`.
- Malicious JavaScript served by `app.example.com`.
- XSS in either origin.
- Browser extensions, device malware, or compromised browsers.
- Supply-chain compromise of frontend bundles.
- An app that the user authorizes and that intentionally exfiltrates the DRK or plaintext.

This is the normal ProtonMail-style hosted web zero-knowledge tradeoff. It is still valuable, but product and security language must not imply protection against malicious frontend code served by the operator.

## Current Project Shape

DarkAuth is an OIDC-compatible authorization server with an opt-in zero-knowledge extension.

The core implementation is split across:

- `packages/api`: OIDC endpoints, token issuance, OPAQUE server endpoints, sessions, audit logging, wrapped DRK storage, JWKS, clients, and admin APIs.
- `packages/user-ui`: Browser UI for user login, OPAQUE client operations, export key handling, DRK unwrap, and ZK authorization approval.
- `packages/darkauth-client`: RP SDK used by apps to start Authorization Code + PKCE, request ZK key delivery, handle callback fragments, exchange code, verify token-bound key hashes, and decrypt the fragment JWE.
- `packages/admin-ui`: Client and settings administration, including ZK delivery settings.
- `specs`: Design documents for OIDC, ZK delivery, OPAQUE, sessions, logging, OTP, RBAC, and implementation plans.

The live ZK flow currently works like this:

1. The RP SDK generates an ephemeral P-256 ECDH keypair and stores the private JWK in `sessionStorage` for callback continuity.
2. The RP sends `zk_pub=base64url(JSON.stringify(public_jwk))` on `/authorize`.
3. The API validates the client, redirect URI, PKCE, and ZK client configuration, then validates `zk_pub` as a P-256 public key.
4. The Auth UI completes OPAQUE login and receives the OPAQUE `export_key` in browser JavaScript.
5. The Auth UI derives wrapping keys from `export_key`, fetches `wrapped_drk`, and unwraps the DRK locally.
6. The Auth UI encrypts the DRK to the RP's ephemeral public key as compact JWE, computes `drk_hash = base64url(sha256(drk_jwe))`, and posts only that hash to `/authorize/finalize`.
7. The API stores `drk_hash` on the authorization code and later returns it as `zk_drk_hash` from `/token`.
8. The Auth UI redirects to the RP with `?code=...&state=...#drk_jwe=...`.
9. The RP SDK exchanges the code, verifies `sha256(fragment drk_jwe) == zk_drk_hash`, decrypts the JWE with the ephemeral private key, and returns the DRK to the app.

The important design property is that the API never stores or returns `drk_jwe`. The JWE is placed in the URL fragment by browser JavaScript, so it is not sent to the RP server as part of the HTTP request.

## Current Findings

### 1. Hosted Web ZK Trust Boundary Is Acceptable But Must Be Explicit

The model is sound for protecting against server-side storage compromise and backend-only access. It is not sound against malicious frontend code. This does not invalidate the product, but the product should be precise:

- DarkAuth backend cannot derive the DRK from stored OPAQUE and wrapped DRK records.
- App backend cannot decrypt user data if it stores only ciphertext.
- The browser can decrypt because the app needs browser-side decryption.
- Any JavaScript with same-origin execution on either trusted origin can access keys or plaintext at the moment they are usable.

This is an inherent hosted-web ZK limitation, not a bug that `HttpOnly` cookies can solve for the DRK.

### 2. Auth And Session Tokens Should Follow The Spec More Closely

The spec says first-party session and refresh credentials should use `HttpOnly` cookies and not be readable by JavaScript. The API has cookie helpers for this in `packages/api/src/services/sessions.ts`.

Before this hardening pass, the SDK persisted tokens in `localStorage`:

- `id_token` via `setStoredIdToken`.
- `access_token` via `setStoredAccessToken`.
- `refresh_token` in the callback and refresh paths.

That is not the desired first-party hosted-web profile. Auth/session tokens are not the DRK. They can and should be protected from JavaScript where the deployment supports same-site cookie transport.

The SDK now defaults to first-party cookie refresh with memory-only token and DRK state. Legacy localStorage persistence remains opt-in for non-first-party or compatibility deployments.

### 3. DRK Persistence Is The Main UX Versus Security Decision

The spec currently says the DRK is XOR-obfuscated and stored in `localStorage` for session persistence. The implementation does this in both the Auth UI and SDK.

This is useful for reload UX, but it is not meaningful cryptographic protection. Static XOR in `localStorage` should not support a strong zero-knowledge claim.

Recommended posture:

- Default security mode: DRK is memory-only in the app. A page refresh requires a new ZK handoff from DarkAuth.
- Session convenience mode: keep DRK or a non-extractable WebCrypto key only for the active browser session where possible.
- Avoid persistent DRK in `localStorage` for serious hosted-web ZK claims.

If a page refresh loses DRK, the app redirects to DarkAuth again. If the Auth UI still has an IdP session and a session-scoped `export_key`, it can unwrap DRK and return a fresh JWE without a password prompt. If `export_key` is gone, the Auth UI performs OPAQUE step-up to rederive it.

The default SDK and Auth UI paths now follow this posture. The legacy DRK storage helper remains only for cleanup and compatibility boundaries, not for the hosted-web ZK default.

### 4. Zeroed DRK Bug In Recovery/Generation Path

In `packages/user-ui/src/components/Authorize.tsx`, `generateNewKeys` clears `drk` before using it to create the immediate ZK JWE. Because `clearSensitiveData` mutates the array, the JWE can contain an all-zero DRK while still producing a valid hash binding.

This is a real security and data-loss risk. If an app encrypts data with that all-zero DRK, the data may be decryptable by anyone who recognizes the failure mode.

The implementation now passes a defensive DRK copy to the JWE creation path before clearing the original.

### 5. Audit Logging Can Capture Secrets

The audit wrapper captures mutation request bodies. For form-encoded requests it stores raw body text, and the sanitizer is incomplete for current field names.

Risks include logging:

- OAuth authorization codes.
- PKCE `code_verifier`.
- Refresh tokens.
- `wrapped_drk`.
- `wrapped_enc_private_jwk`.
- OPAQUE protocol payloads.
- Other token or key material in raw form bodies.

The spec already says these values must never be logged. The implementation now uses a field-aware sanitizer for JSON, form, query, headers, raw body data, details, changes, and error metadata.

### 6. Spec Had A Contradiction Around DRK Storage

`specs/2_CORE.md` says:

- First-party bearer tokens should not be persisted.
- `export_key` may be cached only in browser session scope.
- Missing `export_key` must require step-up password verification.
- But DRK is XOR-obfuscated and stored in `localStorage` for persistence.

For the intended hosted-web ZK story, DRK storage has been revised. `localStorage` DRK persistence is removed from the default profile and is labeled as a lower-security compatibility/convenience mode where it remains available.

## Recommended Architecture

### Keybag And Per-Client Key Delivery

The hosted-web ZK model should use the user key management architecture in `specs/USER_KEY_MANAGEMENT.md`.

Target posture:

- Treat the existing DRK as legacy Account Root Key material during migration.
- Store root material only as key envelopes.
- Split identity authentication from key unlock.
- Deliver a per-client Client App Key to ZK OAuth clients instead of delivering the account root.
- Keep the fragment-only JWE handoff and token-response hash binding.
- Preserve legacy DRK delivery only for clients explicitly registered for `key_delivery_version="v1-drk"`.

This improves blast-radius isolation between relying parties. A malicious or compromised ZK client can still exfiltrate the key it receives, but it should receive only its own CAK rather than a root key usable by other clients.

### First-Party Auth Session

- DarkAuth session cookie is `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and host-only.
- DarkAuth refresh cookie is also `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and host-only.
- RP apps should avoid persisted bearer tokens where cookie transport is available.
- The SDK should support a cookie-based first-party mode and avoid `localStorage` refresh tokens in that mode.

### App-Side Key Handling

Default:

- DRK exists only in memory.
- `drk_jwe` is removed from the URL immediately after callback handling.
- Reload without DRK triggers a new authorization request with a new `zk_pub`.
- Auth UI uses existing DarkAuth session and session-scoped `export_key` if available.
- Missing `export_key` triggers OPAQUE step-up.

Optional convenience mode:

- DRK is retained for the active browser session only.
- Prefer non-extractable `CryptoKey` handles where API design allows.
- Do not use static XOR as a security boundary.
- UI and docs must label this as a convenience tradeoff.

### Logging

- Sensitive routes should opt out of request body capture unless there is a compelling reason.
- Sanitization must understand JSON, form-encoded, query, headers, and raw bodies.
- Audit events should log metadata, not payloads.
- Logging tests should assert secrets never appear in audit rows or runtime logs.

### Browser And Frontend Hardening

The Auth UI, SDK, admin UI, demo app, and API code paths were reviewed for direct HTML/script execution sinks. The key-handling UIs do not use `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `eval`, or `new Function`. The remaining `dangerouslySetInnerHTML` occurrence is in brochureware chart CSS injection, outside the key-handling runtime.

Trusted Types enforcement is a good production hardening follow-up, but this pass does not enable `require-trusted-types-for 'script'` globally because the current shipped CSP and bundle behavior need compatibility testing before enforcement.

## Implementation Checklist

### Security-Critical Fixes

- [x] Fix the zeroed DRK bug in `packages/user-ui/src/components/Authorize.tsx`.
- [x] Add regression coverage proving newly generated DRKs are not zeroed before JWE handoff.
- [x] Refactor audit logging so token, OPAQUE, DRK, wrapped private key, authorization code, PKCE, session, and refresh token values are never captured.
- [x] Add tests that submit representative JSON, form, and raw bodies and assert audit rows contain no secrets.
- [x] Redact both snake_case and camelCase key names, including `wrapped_drk`, `wrapped_enc_private_jwk`, `drk_jwe`, `zk_pub`, `code`, `code_verifier`, `refresh_token`, `access_token`, `id_token`, `client_secret`, OPAQUE payloads, and password-derived values.

### Auth And Session Token Alignment

- [x] Add or finish SDK support for first-party cookie mode.
- [x] Stop persisting `id_token`, `access_token`, and `refresh_token` in `localStorage` for first-party web mode.
- [x] Use `HttpOnly` refresh cookie renewal for first-party refresh flows.
- [x] Keep PKCE verifier and ephemeral ZK private key in `sessionStorage` only for callback continuity.
- [x] Clear callback state, PKCE verifier, and ephemeral ZK private key immediately after callback handling.
- [x] Document the difference between auth/session token custody and key custody.

### DRK Custody Modes

- [x] Change the default SDK DRK mode to memory-only.
- [x] Decide whether to support session-only DRK convenience mode.
- [x] Defer session-only DRK convenience mode; keep persistent storage as explicit legacy compatibility only.
- [x] Remove persistent XOR-localStorage DRK storage from the default hosted-web ZK path.
- [x] Ensure page refresh without DRK starts a fresh authorization request with a new ephemeral `zk_pub`.
- [x] Ensure Auth UI can satisfy that fresh request from existing DarkAuth session plus session-scoped `export_key`.
- [x] Ensure missing `export_key` triggers OPAQUE step-up before DRK unwrap.

### Spec And Product Language

- [x] Update `specs/2_CORE.md` to remove or qualify the XOR-localStorage DRK requirement.
- [x] Update `specs/0_SECURITY_WHITEPAPER.md` with the hosted-web trust boundary.
- [x] Update `specs/0_OIDC_ZK_EXTENSION.md` to describe memory-only DRK as the default.
- [x] Add product wording that says servers cannot decrypt during honest operation, while frontend code trust remains required.
- [x] Avoid absolute claims that no one can ever decrypt under malicious frontend, XSS, compromised browser, or malicious app conditions.

### Browser And Frontend Hardening

- [x] Review CSP for Auth UI and app UI; keep scripts self-hosted and avoid inline script execution.
- [x] Consider Trusted Types for production builds where practical.
- [x] Ensure `drk_jwe` fragments are stripped from browser history immediately after callback handling.
- [x] Review all UI dependencies that execute before key handling code.
- [x] Add automated checks for accidental logging of key material through frontend logger calls.

### Protocol And Regression Tests

- [x] Test the full ZK code flow: `zk_pub` request, fragment JWE, `/token`, hash verification, JWE decryption, and encrypted app data round trip.
- [x] Test refresh/reload behavior for memory-only DRK.
- [x] Test step-up OPAQUE recovery when `export_key` is missing.
- [x] Test that non-ZK clients never receive DRK artifacts.
- [x] Test malformed `zk_pub` rejection and non-ZK client rejection.
- [x] Test authorization code, PKCE, refresh token, and client binding replay behavior.

### Operational Follow-Up

- [x] Define deployment guidance for trusted frontend origins.
- [x] Define incident response guidance for suspected frontend compromise.
- [x] Define audit log retention and encryption-at-rest expectations.
- [x] Add a release-note warning for any change that affects DRK persistence or reload behavior.
