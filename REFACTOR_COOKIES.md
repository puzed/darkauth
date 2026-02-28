# REFACTOR_COOKIES

Goal: move to an opinionated cookie-session model for first-party web auth while preserving OPAQUE and ZK guarantees (password/private keys never leave the client in plaintext).

## 0) Security Baseline Definition

- [ ] Define and publish security invariants in one place:
- [ ] Password never leaves client plaintext.
- [ ] OPAQUE `export_key` never leaves client.
- [ ] DRK/private keys only leave client as wrapped ciphertext.
- [ ] Server never stores or returns `drk_jwe` plaintext.
- [ ] Session authentication for first-party web uses HttpOnly cookie only.
- [ ] Add a release gate: no auth/session change merges without invariants checklist signoff.

## 1) Cookie Session Model (First-Party Web)

- [ ] Introduce a single auth cookie name (for example `__Host-DarkAuth`).
- [ ] Set cookie flags: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`.
- [ ] Set explicit `Max-Age`/expiry aligned with short session TTL.
- [ ] Rotate session identifier on login, refresh, and privilege/OTP state transitions.
- [ ] Invalidate old session identifiers on rotation.
- [ ] Ensure logout clears cookie server-side and client-side state.
- [ ] Ensure all user/admin session endpoints read cookie first and reject bearer fallback for first-party UI routes.

## 2) OAuth/OIDC Flow Profiles (Opinionated)

- [ ] Define two explicit profiles in docs/spec:
- [ ] First-party web profile: cookie session at AS, no browser-stored session bearer token.
- [ ] Public SPA profile (if retained): PKCE, strict per-client CORS allowlist only.
- [ ] Confidential client profile: backend code exchange, no browser token endpoint calls.
- [ ] Enforce profile by client metadata and server checks.
- [ ] Reject profile-incompatible requests with clear OAuth errors.

## 3) CSRF Protections for Cookie Auth

- [ ] Add CSRF token for all state-changing endpoints that rely on cookie auth.
- [ ] Use double-submit or synchronizer-token pattern with strict origin checks.
- [ ] Enforce `Origin`/`Referer` validation on sensitive endpoints.
- [ ] Require `POST` for logout and any state mutation.
- [ ] Add tests for cross-site form POST and forged-origin failures.

## 4) CORS Hardening

- [ ] Stop reflecting arbitrary `Origin`.
- [ ] Enforce exact-match allowlist by client and environment.
- [ ] Only set `Access-Control-Allow-Credentials: true` when origin is explicitly allowed.
- [ ] Deny wildcard with credentials.
- [ ] Add integration tests for allowed/blocked origins per client type.

## 5) OPAQUE Hardening

- [ ] Keep identity binding to server-side OPAQUE login session only.
- [ ] Enforce one-time/short-lived OPAQUE login sessions.
- [ ] Rate-limit OPAQUE start/finish by IP + account identifier.
- [ ] Ensure constant-time comparisons for verifier/challenge checks.
- [ ] Zero sensitive OPAQUE material from memory after use where feasible.

## 6) ZK Delivery Hardening

- [ ] Keep `zk_pub` accepted only for clients with `zk_delivery=fragment-jwe`.
- [ ] Keep `drk_hash` required and bound to auth code when ZK is used.
- [ ] Keep `drk_jwe` fragment-only; never persist server-side.
- [ ] Validate JWE header (`alg`, `enc`) and payload binding (`sub`, `client_id`, `aud`).
- [ ] Enforce strict P-256 key validation and reject malformed/weak keys.
- [ ] Add replay tests and mismatched-hash tests for ZK callback/token exchange.

## 7) Token and Refresh Security

- [ ] Keep refresh tokens hashed at rest.
- [ ] Keep single-use refresh rotation atomic under concurrency.
- [ ] Bind refresh tokens to issuing `client_id`.
- [ ] Add token family reuse detection and forced revocation on suspected replay.
- [ ] Shorten token lifetimes to minimum operationally acceptable defaults.
- [ ] Add admin controls for immediate session/token revocation by user/client.

## 8) Browser Storage and XSS Risk Reduction

- [ ] Remove first-party session bearer token storage from `localStorage`/`sessionStorage` once cookie model is active.
- [ ] Keep only non-session crypto state needed for redirect continuity.
- [ ] Keep strict CSP and remove unnecessary inline/eval patterns.
- [ ] Add Trusted Types policy for production where possible.
- [ ] Add dependency review process for frontend supply-chain risk.

## 9) Headers and Transport Security

- [ ] Enforce HSTS in production with preload-ready policy.
- [ ] Keep secure header baseline (CSP, X-Frame-Options/frame-ancestors, XCTO, Referrer-Policy).
- [ ] Enforce HTTPS-only deployments for auth endpoints.
- [ ] Add automated checks to fail deploy if security headers regress.

## 10) Logging and Data Exposure Controls

- [ ] Prohibit logging of `zk_pub`, `drk_jwe`, wrapped keys, tokens, auth codes, and OPAQUE payloads.
- [ ] Add logger redaction rules and test them.
- [ ] Emit structured security events (login, refresh, revoke, CSRF deny, replay deny).
- [ ] Add alerting thresholds for anomalous auth activity.
