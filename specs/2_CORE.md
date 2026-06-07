Below is a complete, implementable spec for DarkAuth. It is OIDC-compatible by default, adds opt-in zero-knowledge client key delivery via fragment JWE, uses OPAQUE (RFC 9380) for password auth, supports keybag-based user encryption, and stores shared/runtime settings in Postgres. The only required env at install is **POSTGRES\_URI**. Everything else is seeded into the DB.

Config rules:

- Shared and generated configuration is stored in Postgres `settings`.
- UI runtime configuration is served from the API as a runtime script `/config.js` and read by the UIs at load.
- OPAQUE server state (OPRF seed, AKE keypair, server identity) is persisted in Postgres `settings` (encrypted when KEK available).
- `config.yaml` is instance‑specific only: network/ports, database URI, KEK passphrase, dev flags. It must not contain shared secrets except the KEK passphrase.
- KEK passphrase is required in `config.yaml`; KDF params are stored in `settings`. The passphrase itself is never stored in database.

---

# DarkAuth Technical Spec

**Status:** implement now
**Principles:**

* Passwords are not sent to the server during the OPAQUE flow.
* Same deterministic client secret every session for a user+password (`export_key`).
* Server stores only **opaque verifier** + **encrypted key envelopes** for user key recovery/unlock.
* Hosted-web ZK protects against backend/database access during honest frontend operation; users still trust the JavaScript served by the DarkAuth and RP origins while keys are usable in the browser.
* Default ARK/CAK custody for hosted web apps is memory-only. Persistent plaintext key storage is not a supported security boundary.
* OIDC-compatible for every client; ZK client key delivery is **per-client opt-in**.
* User key management uses the v2 keybag model in `specs/USER_KEY_MANAGEMENT.md`: authentication and key unlock are distinct states, the Account Root Key is wrapped only in key envelopes, and ZK OAuth clients receive a per-client Client App Key rather than the account root.
* No config file at runtime; **all settings in Postgres**. Install script seeds defaults.

---

## 1. Components

* **User UI (port 9080)**: HTML/JS pages implementing OPAQUE client, keybag unlock/setup, and optional fragment JWE creation. Public OIDC origin (e.g., `https://auth.puzed.com`).
* **Auth API (port 9080)**: OIDC `/authorize`, `/token`, discovery, JWKS, OPAQUE server endpoints, and encrypted key envelope storage.
* **Admin UI (port 9081)**: Admin console for settings, clients, keys, users, groups, and permissions. Restricted access; not exposed publicly.
* **Apps (RP clients)**: Redirect to `/authorize`, exchange code at `/token`.

  * **ZK-enabled clients** add `zk_pub` and receive a per-client key via fragment JWE; standard clients do not receive key material.

* **Install UI (first-run only, served on admin port)**: One-time initialization UI gated by a single-use token (query param). Collected data seeds defaults and config. Served on the admin port until installation completes. Exactly one bootstrap admin may be created, bound to the installer-provided email. The install token is invalidated on the first successful admin OPAQUE finish and all install endpoints are disabled once initialized.

---

## 2. Cryptography

* **OPAQUE (RFC 9380)**: PAKE for password auth. Produces a **client-only `export_key`** (stable per user+password). The server stores an **opaque record** (envelope/verifier), not a password.
  - Identity binding requirement: On login finish, the server MUST bind the authenticated account to the `identityU` persisted in the server-side OPAQUE login session created during start. Any client-supplied identity fields (e.g., user `sub/email`, admin `adminId`) MUST be ignored when minting sessions.
* **Key schedule (client)**

  ```
  MK  = HKDF-SHA256(export_key, salt=H("DarkAuth|v1|tenant=" + TENANT + "|user=" + sub), info="mk")
  KW  = HKDF-SHA256(MK, salt="DarkAuth|v1", info="wrap-key")       // wraps DRK
  KDerive = HKDF-SHA256(MK, salt="DarkAuth|v1", info="data-derive")// per-record keys if needed
  ```
  For v1 (single‑tenant), use `TENANT = "default"`.
* **DRK (Data Root Key)**: 32 bytes random, generated once on first login.

  * Server stores **WRAPPED\_DRK = AEAD\_Encrypt(KW, DRK, aad=sub)**.
  * Client unwraps DRK using `KW` each session. During honest frontend operation the server cannot derive DRK or KW from stored state, but same-origin frontend code can access DRK while it is usable in the browser.
  * In the v2 keybag model, this root secret is the Account Root Key (ARK). Existing DRK rows are treated as ARK material during migration.
  * New ZK OAuth clients MUST receive a Client App Key (CAK) derived from ARK with client-specific context. They MUST NOT receive ARK/DRK directly.
* **JWE for client key handoff (ZK delivery)**: **ECDH-ES + A256GCM** (compact JWE) using **P‑256**.

  * Receiver key: app’s ephemeral `zk_pub` JWK from `/authorize` query.
  * AAD/payload binding includes `sub`, `client_id`, `aud`, `request_id`, `state_hash`, `redirect_uri_hash`, `key_id`, `iat`, and `exp`.
  * v2 clients receive `darkauth_key_jwe` containing `key_kind="client_app_key"` and `cak`.
  * **`zk_key_hash = base64url(SHA-256(darkauth_key_jwe))`** is stored with the auth code and returned by `/token` to bind fragment → code.
  * Legacy v1 clients may receive `drk_jwe` and `zk_drk_hash` only when registered with `key_delivery_version="v1-drk"`.
  * **CRITICAL SECURITY**: The AS protocol stores only the JWE hash for verification, not the JWE. The JWE is delivered via URL fragment during honest hosted-web operation.

### 2.1 P-256 Public Key Validation Requirements

When processing `zk_pub` parameter containing an ECDH public key:

* **Format validation**: MUST be valid `base64url(JSON.stringify(JWK))` where JWK contains:
  - `kty`: MUST be "EC"
  - `crv`: MUST be "P-256" 
  - `x`, `y`: MUST be valid base64url-encoded P-256 curve coordinates (32 bytes each when decoded)
  - MUST NOT contain private key components (`d`)
* **Cryptographic validation**: Server MUST verify the public key lies on the P-256 curve
* **Rejection policy**: Server MUST reject requests with malformed, invalid, or weak keys
* **Logging**: Server MUST NOT log the `zk_pub` value in any form (see §2.2)

### 2.2 Secure Logging Practices for Production

To protect cryptographic material and user privacy, the following logging restrictions are MANDATORY:

#### 2.2.1 Prohibited Logging (NEVER log these values)
* `zk_pub` - Ephemeral ECDH public keys from authorization requests
* `darkauth_key_jwe` / `drk_jwe` - JWE ciphertext containing encrypted key material
* key envelopes / `wrapped_drk` - User root key ciphertext
* OPAQUE protocol messages: `envelope`, `server_pubkey`, request/response payloads
* Raw password attempts or password-derived values
* Session tokens, refresh tokens, or authorization codes in plaintext
* Private key material or KEK-related values

#### 2.2.2 Safe Audit Logging (Production Requirements)
* **High-level events only**: Authentication success/failure, authorization grants, token issuance
* **Metadata only**: timestamps, client_id, user subject identifiers, IP addresses, user agents
* **Hash identifiers**: Use `zk_pub_kid = SHA-256(zk_pub)` and `drk_hash` for correlation, never the source values
* **Rate limiting events**: Failed attempts, exceeded quotas, suspicious patterns
* **Admin actions**: Configuration changes, key rotations, user management operations

#### 2.2.3 Development vs Production
* **Development**: May log additional detail for debugging but MUST NOT include cryptographic payloads
* **Production**: MUST use structured logging with explicit field filtering to prevent accidental disclosure
* **Log retention**: Production logs containing user metadata SHOULD have an explicit retention period, SHOULD be minimized to operational need, and MUST be encrypted at rest

#### 2.2.4 Monitoring and Alerting
* **Security events**: Multiple failed authentications, unusual access patterns, key validation failures
* **System health**: Database connectivity, KEK availability, certificate expiration
* **Performance metrics**: Request rates, response times, resource utilization (without sensitive data)

* **Tokens**: JWT ID/Access tokens signed with **EdDSA (Ed25519)** via `jose`.

* **KEK and secure-at-rest**
  * Derive a **KEK with Argon2id** from an install/boot passphrase. Store only KDF params (salt, memoryCost, iterations, parallelism) in `settings.kek_kdf`.
  * Encrypt private JWKs and client secrets with **AES‑256‑GCM** using a random 96‑bit IV; store IV alongside ciphertext.

---

## 3. Database (all settings in Postgres)

### 3.1 Schema (Drizzle ORM)

Implemented with **Drizzle ORM** in `src/db/schema.ts` and applied via **drizzle‑kit push**. No raw SQL is checked in for core tables.

Tables and key fields:

- settings: `key` (pk), `value` (jsonb), `secure` (bool), `updated_at`.
- jwks: `kid` (pk), `alg`, `public_jwk` (jsonb), `private_jwk_enc` (bytea|null), `created_at`, `rotated_at`.
- clients: `client_id` (pk), `name`, `type` in `public|confidential`, `token_endpoint_auth_method` in `none|client_secret_basic`, `client_secret_enc` (bytea|null), `require_pkce` (bool), `zk_delivery` in `none|fragment-jwe`, `zk_required` (bool), `key_delivery_version` in `v1-drk|v2-client-key`, `client_key_scope` in `account|organization`, `allowed_jwe_algs` (text[]), `allowed_jwe_encs` (text[]), `redirect_uris` (text[]), `post_logout_redirect_uris` (text[]), `grant_types` (text[] default `authorization_code`), `response_types` (text[] default `code`), `scopes` (text[]), `allowed_zk_origins` (text[]), `created_at`, `updated_at`.
- users: `sub` (pk), `email` (unique, nullable), `name` (nullable), `created_at`.
- opaque_records: `sub` (pk, fk users.sub), `envelope` (bytea), `server_pubkey` (bytea), `updated_at`.
- wrapped_root_keys: `sub` (pk, fk users.sub), `wrapped_drk` (bytea), `updated_at`.
- account_keys: `key_id` (pk), `sub` (fk users.sub), `version`, `status`, `created_at`, `rotated_at`.
- key_envelopes: `envelope_id` (pk), `key_id` (fk account_keys.key_id), `sub` (fk users.sub), `type`, `label`, `wrapping_alg`, `wrapped_key` (bytea), `aad` (bytea), `metadata` (jsonb), `created_at`, `last_used_at`, `revoked_at`.
- trusted_devices: `device_id` (pk), `sub` (fk users.sub), `label`, `public_key_jwk` (jsonb|null), `key_handle_metadata` (jsonb), `created_at`, `last_used_at`, `revoked_at`.
- device_approval_requests: `request_id` (pk), `sub`, `new_device_public_jwk` (jsonb), `verification_code_hash`, `status`, `expires_at`, `approved_by_device_id`, `encrypted_approval` (bytea|null).
- user_auth_identities: `identity_id` (pk), `sub`, `type`, `provider_id`, `external_subject`, `email`, `email_verified`, `created_at`, `last_used_at`.
- federation_connections: `connection_id` (pk), `type`, `issuer_or_entity_id`, `client_id`, `encrypted_client_secret`, `jwks_uri`, `metadata`, `enabled`.
- scim_tokens: `token_id` (pk), `organization_id`, `token_hash`, `scopes`, `created_at`, `expires_at`, `revoked_at`.
- scim_external_ids: `organization_id`, `resource_type`, `external_id`, `local_id`.
- user_encryption_keys: `sub` (pk, fk users.sub), `enc_public_jwk` (jsonb), `enc_private_jwk_wrapped` (bytea|null), `updated_at`.
- auth_codes: `code` (pk), `client_id` (fk clients.client_id), `user_sub`, `redirect_uri`, `code_challenge`, `code_challenge_method`, `expires_at`, `consumed` (bool), `has_zk` (bool), `zk_pub_kid` (text), `drk_hash` (text|null).
- sessions: `id` (pk), `cohort` in `user|admin`, `user_sub` (nullable), `admin_id` (nullable), `created_at`, `expires_at`, `data` (jsonb), `refresh_token` (text|null, SHA-256 base64url hash at rest), `refresh_token_expires_at` (timestamp|null), `refresh_token_consumed_at` (timestamp|null).
- opaque_login_sessions: `id` (pk), `server_state` (bytea), `identity_s` (text), `identity_u` (text), `created_at`, `expires_at`.
- pending_auth: `request_id` (pk), `client_id`, `redirect_uri`, `state`, `code_challenge`, `code_challenge_method`, `zk_pub_kid` (text|null), `created_at`, `expires_at`, `user_sub` (nullable until login), `origin` (for CSRF binding).

Admin and RBAC tables:

- admin_users: `id` (uuid pk), `email` (unique), `name`, `role` in `read|write`, `created_at`.
- admin_opaque_records: `admin_id` (pk, fk admin_users.id), `envelope` (bytea), `server_pubkey` (bytea), `updated_at`.
- permissions: `key` (pk), `description`.
- groups: `key` (pk), `name`.
- group_permissions: composite pk (`group_key`, `permission_key`).
- user_groups: composite pk (`user_sub`, `group_key`).
- user_permissions: composite pk (`user_sub`, `permission_key`).

### 3.1.1 Cohorts and Authorization Model

Two distinct cohorts exist: `admin_users` and `users`.

Admin users have a coarse role: `read` (read everything) or `write` (write everything). Regular users have customizable groups and permissions.

Implemented in Drizzle ORM as: `admin_users`, `admin_opaque_records`, `permissions`, `groups`, `group_permissions`, `user_groups`, `user_permissions`.

### 3.2 Seed defaults (install)

* Row(s) in `settings`:

  * `issuer`, `public_origin`, `rp_id`
  * `code`: `{"lifetime_seconds":60,"single_use":true}`
  * `pkce`: `{"required_for_public_clients":true,"methods":["S256"]}`
  * `id_token`: `{"lifetime_seconds":300}`
  * `access_token`: `{"enabled":false,"lifetime_seconds":600}`
  * `user_keys`: `{"enc_public_visible_to_authenticated_users":true}`
  * `zk_delivery`: `{"fragment_param":"darkauth_key_jwe","legacy_fragment_param":"drk_jwe","jwe_alg":"ECDH-ES","jwe_enc":"A256GCM","hash_alg":"SHA-256"}`
  * `opaque`: e.g., `{"kdf":"ristretto255","envelope_mode":"base"}`
  * `users`: `{"self_registration_enabled": false}`
  * `security_headers`, `rate_limits`, etc.
* `jwks`: generate Ed25519; store public JWK; **encrypt private JWK** with KEK in secure mode.
* `clients`: seed at least:

  * `app-web` (public, `zk_delivery='fragment-jwe'`, `zk_required=true`)
  * `support-desk` (confidential, `zk_delivery='none'`)

* `admin_users`: create at least one bootstrap admin with `role='write'` (interactive during install). Admin must set password during installation via OPAQUE registration, creating the initial `admin_opaque_records` entry.
* **KEK (required)**: Derive KEK with Argon2id from passphrase in config.yaml → encrypt private JWKs & any client secrets. Save KDF params in `settings.kek_kdf`.

---

## 4. Runtime environment

* **Required env:** `POSTGRES_URI`
* **Required config.yaml:** `kekPassphrase` for deriving KEK at boot. KDF is Argon2id; parameters are stored in `settings.kek_kdf`.
* No YAML/JSON config files at runtime; all tuning is via DB (`settings` table).
* **Ports:** user/UI/OIDC on `9080`; admin UI/API on `9081`. During first run (uninitialized), the admin port serves the install UI and APIs; the user port shows maintenance. After installation, the admin port serves the admin UI and the user port becomes active.

---

## 5. OIDC + ZK Delivery

### 5.1 Discovery

* `GET /.well-known/openid-configuration` → standard fields (issuer, authorization\_endpoint, token\_endpoint, userinfo\_endpoint, introspection\_endpoint, revocation\_endpoint, jwks\_uri, response\_types\_supported, grant\_types\_supported, code\_challenge\_methods\_supported, scopes\_supported).
* `GET /.well-known/jwks.json` → `{ keys: [public JWKs] }`.

### 5.2 Authorization (two modes)

**A) Standard client (no ZK):**
`GET /authorize?client_id=&redirect_uri=&response_type=code&scope=openid%20profile&state=&code_challenge=&code_challenge_method=S256`

* DarkAuth validates client/redirect/PKCE (S256 only), shows login (OPAQUE).
* On success, issues code and `302` to `redirect_uri?code=...&state=...`.

**B) ZK-enabled client (client key via fragment JWE):**
Same as above **+** `&zk_pub=<base64url(JWK)>` (ephemeral ECDH public key).

* DarkAuth **only** honors `zk_pub` if the client has `zk_delivery='fragment-jwe'`.
* **SECURITY PRINCIPLE**: JWE ciphertext is produced in browser code and delivered through the URL fragment; the AS stores only hash metadata in the protocol path.
* After authentication and key unlock, the UI has ARK/DRK in memory long enough to derive the delivered key.
* For `key_delivery_version="v2-client-key"`:

  1. Browser JS derives `CAK = HKDF(ARK, context={sub,key_id,client_id,org_id,aud,version})`.
  2. Browser JS creates `darkauth_key_jwe = JWE_ECDH_ES_A256GCM(payload={key_kind:"client_app_key", cak, sub, client_id, aud, request_id, state_hash, redirect_uri_hash, key_id, iat, exp}, zk_pub)`.
  3. Browser JS calls `/authorize/finalize` with `{ request_id, zk_key_hash }` where `zk_key_hash = base64url(SHA256(darkauth_key_jwe))`.
  4. Server creates `code` and stores `has_zk=true`, `zk_pub_kid=SHA256(zk_pub)`, `zk_key_hash`, `zk_key_kind="client_app_key"`, and `zk_key_version="v2"`.
  5. Browser redirects with `#darkauth_key_jwe=${encodeURIComponent(darkauth_key_jwe)}`.

* For legacy `key_delivery_version="v1-drk"`:

  1. Browser JS creates `drk_jwe = JWE_ECDH_ES_A256GCM(DRK, zk_pub)` with AAD `{sub, client_id}`.
  2. Browser JS calls `/authorize/finalize` (POST) with:
     `{ request_id, drk_hash }` where `drk_hash = base64url(SHA256(drk_jwe))`
     Server creates `code` and stores `has_zk=true`, `zk_pub_kid=SHA256(zk_pub)`, and `drk_hash`.
  3. Browser redirects:
     `location.assign(`\${redirect\_uri}?code=...\&state=...#drk\_jwe=\${encodeURIComponent(drk\_jwe)}`)`

> **CRITICAL**: The AS does not receive or store key-delivery JWE ciphertext in the designed flow. The fragment redirect is client-side only; a server 302 cannot attach the fragment safely.

**/authorize internals**

* `GET /authorize` creates a **pending auth** record bound to the IdP session and returns the login page with a `request_id`.
* `POST /authorize/finalize` (Auth UI JS only, requires IdP session): validates pending auth, creates the code, and returns `{ code, state }`.

### 5.3 Token

`POST /token` (form): `grant_type=authorization_code&code=&redirect_uri=&client_id=&code_verifier`

- Validates code (unexpired, not consumed), PKCE (S256), client, `redirect_uri`.
- Mints `id_token` (and `access_token` if enabled by settings).
- Returns a `refresh_token` bound to the session and issuing `client_id`.
- Refresh grant enforces `client_id` binding: only the original client can rotate that refresh token.
- Refresh token rotation is single-use and atomic: exactly one concurrent redemption can succeed.
- Optionally includes user authorization data as custom claims when configured: `permissions` (array of strings) and `groups` (array of strings). These reflect the union of direct user permissions and permissions derived from groups.
- **SECURITY**: If the code had `has_zk=true`, include only hash metadata for verification. For v2 clients return `zk_key_hash`, `zk_key_kind`, and `zk_key_version`. For legacy v1 clients return `zk_drk_hash`. The token endpoint MUST NOT return key-delivery JWE ciphertext.
- Atomically consume the code so concurrent redemption attempts cannot both succeed.

### 5.3.1 UserInfo, Introspection, and Revocation

* `GET /userinfo` and `POST /userinfo` accept a bearer access token. The endpoint validates the JWT signature, issuer, expiration, and `token_use="access"`, then returns claims allowed by the token scopes:
  - Always: `sub`.
  - `profile`: `name`.
  - `email`: `email`, `email_verified`.
  - DarkAuth organization/access claims already present in the access token MAY be returned for first-party API clients: `org_id`, `org_slug`, `roles`, `permissions`.
* `POST /introspect` accepts `token` and optional `token_type_hint`. The caller MUST authenticate as a confidential client using `client_secret_basic`. Active JWT access tokens return selected claims only when the authenticated client is the token audience or authorized party. Active refresh tokens return metadata only when the authenticated client matches the refresh token's bound `client_id`.
* `POST /revoke` accepts `token` and optional `token_type_hint`. Confidential clients authenticate with `client_secret_basic`; public clients identify with `client_id`. Refresh token revocation deletes the matching active refresh-token session when the caller matches the bound `client_id`. Access and ID tokens are stateless and short-lived in v1, so revocation is a successful no-op for those token types.
* Dynamic Client Registration and Device Authorization Grant are deferred. DCR requires explicit registration policy, initial access token handling, and client lifecycle controls. Device Authorization requires a new user-code verification UX and pending device state.

### 5.4 App behavior (ZK vs Standard)

* **ZK client**:

  1. Generate ephemeral ECDH keypair; send `zk_pub` on `/authorize`.
  2. For v2 clients, after landing back, read `#darkauth_key_jwe` from URL fragment; call `/token`; verify `base64url(sha256(darkauth_key_jwe)) === zk_key_hash`; decrypt JWE using local ephemeral private key; verify payload metadata; expose **CAK** in memory.
  3. For legacy v1 clients, read `#drk_jwe`, verify against `zk_drk_hash`, and decrypt **DRK** in memory.
  4. **SECURITY**: The designed flow keeps JWE in browser memory and the URL fragment, not in AS token responses or AS storage.
* **Standard client**: ignore ZK. Normal OIDC.

---

## 6. Auth UI Flow (client-side on DarkAuth origin)

1. **OPAQUE login** (via `/opaque/login/start` + `/opaque/login/finish`):

   * On success, an IdP session is issued via `__Host-DarkAuth` HttpOnly cookie for the bound identity; **client gets `export_key`** in JS.
2. **Unlock user keybag**:

   * For password unlock, derive `KW` from `export_key` and unwrap the password key envelope to obtain ARK in memory.
   * For passkey PRF unlock, request PRF output and unwrap the passkey key envelope to obtain ARK in memory.
   * For trusted-device approval, consume the encrypted approval envelope to obtain ARK in memory.
   * If no ARK exists and the client requires ZK, generate a 32-byte ARK client-side and create at least one key envelope before continuing.
   * Legacy `GET/PUT /crypto/wrapped-drk` is used only for v1 migration; migrated DRK is treated as ARK.
   * If no unlock method is available, the Auth UI MUST route the user through key setup or recovery before continuing ZK authorization.
3. **If ZK**:

   * read `zk_pub` from `location.search`.
   * For v2 clients, derive CAK from ARK, create `darkauth_key_jwe`, compute `zk_key_hash`, and call `/authorize/finalize`.
   * For legacy v1 clients, create `drk_jwe`, compute `drk_hash`, and call `/authorize/finalize`.
   * Redirect with the appropriate fragment parameter for the registered key delivery version.
4. **Else** (non-ZK): call `/authorize/finalize` (no `drk_hash`), then 302.

---

### 6.1 OTP Gating (MFA Overview)

After OPAQUE login completes, DarkAuth can require a second factor using TOTP. When OTP is enabled and required by cohort or organization policy (`organizations.force_otp`), the server creates a partial session with `data.otp_required=true` and the UI redirects to the OTP flow. On successful verification, the session includes `data.otp_verified=true` and normal navigation resumes. ID tokens for MFA sessions include `amr=['pwd','otp']` and `acr='urn:ietf:params:acr:mfa'`. Implementation details, endpoints, and schema are defined in specs/9_OTP.md.

## 7. HTTP Endpoints (precise)

All endpoints in this section are served on port `9080` (user). Admin UI/API runs on port `9081`.

### 7.1 Discovery

* **GET `/.well-known/openid-configuration`**
  Returns JSON with: `issuer`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `introspection_endpoint`, `revocation_endpoint`, `end_session_endpoint`, `jwks_uri`, `scopes_supported`, `response_types_supported`, `grant_types_supported`, `code_challenge_methods_supported`.

* **GET `/.well-known/jwks.json`**
  `{ "keys": [ {kty, crv/kid/x/y/..., alg, use} ] }`

### 7.2 OIDC

* **GET `/authorize`** (Rate-limited: 10 req/15min per IP for OPAQUE flows)
  **Query**: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`, optional `zk_pub` (base64url JWK).
  **Behavior**: validate request, record a pending-auth row bound to IdP session, serve login page with `request_id`. If `zk_pub` present, compute/store `zk_pub_kid = SHA256(zk_pub)` for that pending request (only if client `zk_delivery='fragment-jwe'`).

* **POST `/authorize/finalize`** (Auth UI only; requires IdP session; Rate-limited: 10 req/15min per IP)
  **Body**: `{ request_id, drk_hash? }` (`drk_hash` is required when pending auth includes `zk_pub_kid`)
  **Server**: look up pending auth. If `zk_pub_kid` is present and `drk_hash` is missing, return `invalid_request`. Otherwise create authorization code with: `has_zk` (based on whether `zk_pub_kid` recorded), `zk_pub_kid`, and bound `drk_hash`.
  **Response**: `{ redirect_uri, code, state? }`.

* **POST `/token`**
  Content‑Type: `application/x-www-form-urlencoded`
  **Body**: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier` (and client auth if confidential via `client_secret_basic`).
  **Response**:

  ```
  {
    "id_token": "...",
    "token_type": "Bearer",
    "expires_in": 300,
    "refresh_token": "...",
    "zk_key_hash": "...",      // v2 ZK clients only
    "zk_key_kind": "client_app_key",
    "zk_key_version": "v2",
    "zk_drk_hash": "..."       // legacy v1 ZK clients only
  }
  ```

* **GET/POST `/userinfo`**
  Auth: `Authorization: Bearer <access_token>`
  **Response**:

  ```json
  {
    "sub": "user-sub",
    "name": "User Name",
    "email": "user@example.com",
    "email_verified": true,
    "org_id": "...",
    "org_slug": "green-star-bubble-yhgw84",
    "roles": ["member"],
    "permissions": ["darkauth.users:read"]
  }
  ```

* **POST `/introspect`**
  Auth: confidential client `client_secret_basic`.
  Body: `token`, optional `token_type_hint`.
  **Response**: `{ "active": false }` for inactive, expired, malformed, wrong-client, or unsupported tokens. Active access and refresh tokens return `active: true` plus standard metadata such as `client_id`, `sub`, `scope`, `exp`, `iat`, `iss`, `aud`, `token_type`, and DarkAuth organization/access claims when present.

* **POST `/revoke`**
  Auth: confidential client `client_secret_basic` or public client `client_id`.
  Body: `token`, optional `token_type_hint`.
  **Response**: `200 OK` with an empty JSON object. Refresh tokens bound to the authenticated client are revoked. Stateless access and ID tokens are accepted but are not server-side revoked in v1.

### 7.3 OPAQUE (Rate-Limited)

* **POST `/opaque/register/start`**, **/finish** (10 req/15min per IP). Self‑registration is disabled by default and gated by `settings.users.self_registration_enabled`.
* **POST `/opaque/login/start`**, \**/finish`** (10 req/15min per IP). Admin OPAQUE endpoints on the admin API are rate-limited the same way.  
  *Uses Cloudflare's opaque-ts library (RFC 9380 compliant). The server stores the `opaque_records` row on register; login sets IdP session and returns whatever the client needs to compute `export_key`. Rate limiting prevents brute force attacks.*

Enumeration resistance:

* Start responses MUST be indistinguishable for existing vs non-existing accounts. When the account is missing, the server MUST return a uniform response using a fixed dummy OPAQUE record and a sessionId that will fail at finish, without leaking existence.
* Finish MUST return a generic Unauthorized on failure without revealing whether the account exists.

### 7.4 Keybag storage

* **GET `/crypto/keybag`** (IdP session required) → account key metadata, key state, envelope metadata, trusted-device metadata.
* **POST `/crypto/keybag/account-key`** (IdP session required) → create account key metadata after client-side ARK generation.
* **GET `/crypto/keybag/envelopes`** (IdP session required) → list caller's key envelopes without plaintext.
* **POST `/crypto/keybag/envelopes`** (IdP session required) → store a password, passkey PRF, trusted-device, or recovery envelope.
* **DELETE `/crypto/keybag/envelopes/{envelope_id}`** (IdP session required) → revoke an envelope.
* **POST `/crypto/keybag/recovery`** (IdP session required) → create or rotate recovery envelope metadata.
* **POST `/crypto/keybag/rotate`** (IdP session required) → rotate account key according to keybag policy.
* **GET/PUT `/crypto/wrapped-drk`** MAY remain for legacy v1 clients and migration only.

### 7.4.1 User encryption keys

Endpoints for publishing a user’s public encryption key and storing their wrapped private key (wrapped under an ARK-derived key):

- **PUT `/crypto/enc-pub`** (IdP session required)
  Body: `{ enc_public_jwk: {kty, crv, x, y, ...} }`
  Upserts caller’s public JWK into `user_encryption_keys`.

- **GET `/crypto/user-enc-pub?sub=...`** (IdP session required)
  Returns `{ enc_public_jwk: {...} }` for the given subject. Visibility is controlled by `settings.user_keys.enc_public_visible_to_authenticated_users` (when false, only the owner can read).

- **PUT `/crypto/wrapped-enc-priv`** (IdP session required)
  Body: `{ wrapped_enc_private_jwk: base64url }` where the payload is AES-GCM(`serialize(private_jwk)`) using a key derived from ARK.

- **GET `/crypto/wrapped-enc-priv`** (IdP session required)
  Returns `{ wrapped_enc_private_jwk: base64url }` for the caller or `404` if not set.

### 7.5 Session + Logout (optional)

* **GET `/session`** → minimal info for Auth UI.

* **GET `/logout`** (`end_session_endpoint`, advertised as `<publicOrigin>/api/logout`) → OIDC RP-Initiated Logout. RPs redirect the browser here.
  **Query**: `id_token_hint` (recommended), `post_logout_redirect_uri` (optional), `client_id` (optional), `state` (optional).
  **Behavior**: `id_token_hint` is a previously-issued ID Token; its signature and issuer are verified and expired tokens are accepted (per the RP-Initiated Logout spec), and its `aud` identifies the client. `client_id` resolves the client when no `id_token_hint` is present; if both are present, `client_id` MUST equal `id_token_hint.aud`. `post_logout_redirect_uri` must exactly match an entry in the resolved client's per-client allowlist (`post_logout_redirect_uris`) and requires a resolvable client. With a valid `id_token_hint`, DarkAuth ends the current SSO session (deletes the session, clears cookies) and 302-redirects to the allowlisted `post_logout_redirect_uri` (echoing `state`), or to a signed-out page if none. Without a valid `id_token_hint`, an active session shows a confirmation page before logging out and redirecting, while no active session redirects straight to the validated target. An invalid `post_logout_redirect_uri`, unknown client, or `client_id`≠`aud` returns `400`.

* **POST `/logout`** → first-party logout used by the user portal and the confirmation page. Requires a session and CSRF, always clears the session, and returns JSON: `{ logged_out: true, redirect_uri }` when a valid allowlisted `post_logout_redirect_uri` was supplied, else `{ message, logged_out: true }`.

* **POST `/token`** with `grant_type=refresh_token` rotates refresh tokens atomically, enforces `client_id` binding, and rejects replay after first successful use.

### 7.6 User Directory

Authenticated endpoints to discover users and their published public encryption keys:

- **GET `/users/search?q=...`** → `{ users: [{ sub, display_name, public_key_jwk }] }` matching by name or email within the caller's active organization context.
- **GET `/users/:sub`** → `{ sub, display_name, public_key_jwk }` for a specific user within the caller's active organization context.
- Service clients using `client_credentials` with `darkauth.users:read` may use the same endpoints in management mode for cross-organization directory access.

### 7.6.1 Federation, SCIM, Passkeys, And Device Approval

These surfaces follow `specs/USER_KEY_MANAGEMENT.md`.

Federation:

- Admin APIs manage upstream OIDC/SAML connections, claim mapping, account linking policy, and domain routing.
- User callback endpoints authenticate upstream identities and bind them to local DarkAuth subjects.
- Upstream SSO authenticates identity only. ZK clients still require key unlock before CAK delivery.

SCIM:

- `/scim/v2/Users`, `/scim/v2/Groups`, `/scim/v2/ServiceProviderConfig`, `/scim/v2/ResourceTypes`, and `/scim/v2/Schemas`.
- SCIM provisions users/groups and lifecycle state. It does not authenticate users.
- SCIM deactivation revokes active sessions and refresh tokens.

Passkeys:

- `/webauthn/register/start`, `/webauthn/register/finish`, `/webauthn/login/start`, `/webauthn/login/finish`.
- Passkeys without PRF authenticate only.
- Passkeys with verified PRF may also create a key envelope and unlock ARK.

Device approval:

- `/crypto/device-approvals` create/list pending approvals.
- `/crypto/device-approvals/{request_id}/approve` encrypts ARK from an existing unlocked device to the new device public key.
- `/crypto/device-approvals/{request_id}/consume` lets the new device retrieve and decrypt the approval envelope.
- Approval requests are short-lived, single-use, and audited.

### 7.7 Admin API (port 9081)

Admin UI and API are available on port `9081` and require an admin session (OPAQUE-based) tied to an `admin_users` account.

Authorization is coarse:

* `role=read`: read-only access to all admin resources.
* `role=write`: create, update, delete across admin resources.

Representative endpoints:

* `/admin/session`, `/admin/logout`.
* `/admin/users` (list regular users), `/admin/users/:sub/groups`, `/admin/users/:sub/permissions`.
* `/admin/groups` CRUD, `/admin/groups/:key/permissions` CRUD.
* `/admin/permissions` CRUD.
* `/admin/clients` CRUD, `/admin/settings` read/write, `/admin/jwks` rotate/list.

Admin login uses separate OPAQUE endpoints on port `9081`: `/admin/opaque/login/start` and `/admin/opaque/login/finish`.
Bootstrap: initial admin identity and OPAQUE record are created during installation (see §10). The account is seeded with `role='write'` and the admin sets their password during the installation process via OPAQUE registration.

### 7.8 Install (served on admin port during first-run)

When the database is uninitialized (no `settings.initialized=true` row):

* The admin port (`9081`) serves the installation UI and exposes install APIs under `/api/install/*`.
* The user port (`9080`) returns a maintenance page and `503` for user APIs.

Endpoints:

* **GET `/api/install?token=…`**
  Requires `token` query parameter. If the token is valid and unexpired, returns 200. If invalid/expired, returns `403`. The UI is served from the admin port root when not initialized.

* **POST `/api/install/complete`**
  Body includes: `adminEmail`, `adminName`, `adminPassword`.

  Server behavior:
  1. Validates and consumes the install token.
  2. Applies schema migrations (Drizzle push).
  3. Seeds defaults (settings, JWKS, clients).
  4. Creates the single bootstrap admin user with `role='write'`, bound to the installer-provided email.
  5. Admin completes OPAQUE registration via install OPAQUE endpoints; on first successful finish, the install token is invalidated. After initialization, all install endpoints return `already_initialized`.
  6. Derives KEK with Argon2id from passphrase (from config.yaml), encrypts private JWKs and any client secrets, stores KDF params in `settings.kek_kdf`.
  7. Marks `settings.initialized=true`. The admin port begins serving the normal admin UI; the user port stops showing maintenance.

### 7.9 Password Change (verify + rotate)

Sensitive operations require reauthentication with the current password. Password change is a two-phase process using OPAQUE for verification, followed by OPAQUE re‑registration for the new password.

• POST `/password/change/verify/start` (Rate‑limited: auth policy)
  Body: `{ request: base64url }` (OPAQUE login start with current password)
  Response: `{ message: base64url, sessionId: string }`

• POST `/password/change/verify/finish` (Rate‑limited: auth policy)
  Body: `{ finish: base64url, sessionId: string }`
  Response: `{ reauth_token: string }`
  Notes: `reauth_token` is a short‑lived JWT (EdDSA) with claims `{ sub, purpose: "password_change" }`, TTL `10m`.

• POST `/password/change/start`
  Body: `{ request: base64url }` (OPAQUE registration start for new password)
  Response: `{ message: base64url, serverPublicKey: string, identityU: string }`

• POST `/password/change/finish`
  Body: `{ record: base64url, export_key_hash: base64url, reauth_token: string }`
  Behavior:
  - Verifies `reauth_token` is valid, unexpired, and `purpose == "password_change"` for the same `sub`.
  - Prevents password reuse by comparing `export_key_hash` against `user_password_history`.
  - Updates the stored OPAQUE record and records the new `export_key_hash`.
  - Clears `password_reset_required` for the user.

Client guidance: preserve ARK by unwrapping it with the old password envelope, then creating a new password envelope from the new `export_key`. If password-envelope recovery fails, require another envelope or recovery method; otherwise generate a new ARK and treat existing encrypted app data as unrecoverable.

## 8. Client (RP) Integration — ZK-enabled

**Before `/authorize`:**

* Generate ephemeral ECDH keypair (**P‑256**).
* Encode public JWK → `zk_pub = base64url(JSON.stringify(jwk))`.
* Add `zk_pub` to `/authorize` URL along with PKCE parameters.

**After redirect:**

* For v2 clients, parse `#darkauth_key_jwe` from `location.hash`.
* Exchange code at `/token`, read `zk_key_hash`, `zk_key_kind`, and `zk_key_version`.
* Verify `base64url(sha256(darkauth_key_jwe)) === zk_key_hash`.
* Decrypt JWE with ephemeral private key.
* Verify payload `typ`, `key_kind`, `client_id`, `sub`, `aud`, `state_hash`, `redirect_uri_hash`, `key_id`, and `exp`.
* Expose **CAK** in memory.
* Legacy v1 clients parse `#drk_jwe`, verify `zk_drk_hash`, and decrypt DRK only when registered with `key_delivery_version="v1-drk"`.

**App data crypto (four functions using CAK):**

```ts
export async function encrypt(data: unknown, cak: CryptoKey|ArrayBuffer): Promise<string> {
  const key = await asAesGcmKey(cak);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  return toB64Url(concat(iv, new Uint8Array(ct)));
}
export async function decrypt(b64: string, cak: CryptoKey|ArrayBuffer): Promise<any> {
  const buf = fromB64Url(b64); const iv = buf.slice(0,12); const ct = buf.slice(12);
  const key = await asAesGcmKey(cak);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}
export const encrypt_old = encrypt;  // same, using DRK recovered via old password during change
export const decrypt_old = decrypt;
async function asAesGcmKey(k: CryptoKey|ArrayBuffer){ return k instanceof CryptoKey ? k :
  crypto.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt','decrypt']); }
```

---

## 9. Project Structure (Node.js + TS, minimal deps)

Single process starts two HTTP listeners: `9080` (user/OIDC) and `9081` (admin). Use **drizzle‑kit push** for schema migrations.

```
DarkAuth/
├─ src/
│  ├─ main.ts
│  ├─ http/createServer.ts
│  ├─ context/createContext.ts
│  ├─ types.ts
│  ├─ errors.ts
│  ├─ db/
│  │  ├─ schema.ts            # Drizzle ORM schema (core tables)
│  │  ├─ drizzle.ts           # drizzle pg adapter
│  │  └─ seedInstall.ts       # install script (see §10)
│  ├─ drizzle.config.ts
│  ├─ services/
│  │  ├─ jwks.ts               # load/rotate keys (decrypt with KEK)
│  │  ├─ tokens.ts             # sign id/access tokens
│  │  ├─ opaque.ts             # server side OPAQUE glue
│  │  ├─ keybag.ts             # account keys, key envelopes, trusted devices
│  │  ├─ authorize.ts          # pending auth management + code issuing
│  │  └─ settings.ts           # read/write settings table
│  │  └─ rbac.ts               # users/groups/permissions resolution
│  ├─ controllers/
│  │  ├─ wellKnown.ts
│  │  ├─ jwks.ts
│  │  ├─ authorizeGet.ts
│  │  ├─ authorizeFinalize.ts
│  │  ├─ token.ts
│  │  ├─ opaqueLoginStart.ts / opaqueLoginFinish.ts / ...
│  │  └─ cryptoWrappedDrk.ts
│  │  ├─ admin/                # port 9081 controllers
│  │  │  ├─ session.ts
│  │  │  ├─ users.ts           # list users, assign groups/permissions
│  │  │  ├─ groups.ts          # CRUD groups and group permissions
│  │  │  ├─ permissions.ts     # CRUD permissions
│  │  │  ├─ clients.ts         # manage clients
│  │  │  └─ settings.ts        # read/write settings
│  ├─ ui/                      # Auth UI static files (OPAQUE client + DRK unwrap + JWE)
│  ├─ admin-ui/                # Admin UI static files
│  └─ utils/
│     ├─ http.ts               # readBody, sendJson, etc.
│     ├─ pkce.ts
│     ├─ b64.ts
│     └─ hash.ts               # sha256 helpers
├─ scripts/
│  └─ install.ts               # run migrations + seed defaults + generate JWKS
├─ package.json
└─ tsconfig.json
```

**Dependencies (minimal):**

- `drizzle-orm`, `pg`
- `jose` for JWT/JWE (Ed25519, ECDH‑ES + A256GCM with P‑256)
- OPAQUE library (client + server; vetted implementation). Decision: vendor a fixed, audited build of `opaque-ke` (RFC 9380) compiled to WebAssembly, expose thin TypeScript wrappers, and pin integrity via checksum. No custom cryptography.
- `argon2` (Argon2id) for KEK derivation
- No web frameworks; use Node `http`. Cookies `HttpOnly`, `SameSite=Lax`.

Client auth in v1: `none` (public) and `client_secret_basic` (confidential). `private_key_jwt` is deferred.

---

## 10. Installation (first-run UI on admin port) and Script fallback

Primary path (recommended): browser-based first-run UI on the admin port (`9081`).

Flow:

1. On first start with only `POSTGRES_URI` set, the process detects an uninitialized DB and prints an installer URL on the admin port: `http://localhost:9081/install?token=<random>`.
2. A single-use, high-entropy token is generated and logged for local development.
3. The install UI collects: `adminEmail`, `adminName`, and `adminPassword`.
4. Submission runs migrations, seeds settings, generates Ed25519 JWKS, configures clients (`app-web` ZK-enabled; `support-desk` standard), and sets `settings.initialized=true`.
5. The initial admin user is created with `role='write'` in `admin_users` and OPAQUE registration is performed with the provided password.
6. After installation, the admin port serves the normal admin UI, and the user port becomes active. No ports are stopped or started as part of installation.

Fallback path (headless/CI): `POSTGRES_URI=... node scripts/install.ts` remains supported, performing the same steps non-interactively. It requires KEK passphrase in config.yaml.

Runtime: on boot, derive KEK from passphrase in config.yaml. Decrypt private keys/secrets into memory and start servers.

---

## 11. Detailed Flows

### 11.1 Registration (first device)

1. `GET /authorize` → Auth UI page with `request_id`.
2. **OPAQUE register** → store `opaque_records`.
3. **Derive `export_key` client-side**.
4. **Generate random ARK** (32 bytes).
5. Derive password envelope wrapping key from `export_key`; store password key envelope via `/crypto/keybag/envelopes`.
6. If ZK: derive CAK, create `darkauth_key_jwe`, compute `zk_key_hash`, `POST /authorize/finalize` → get `code` → redirect with `#darkauth_key_jwe`. Else: finalize & redirect.

### 11.2 Login (other devices)

1. Same `/authorize`.
2. **OPAQUE login** → client gets `export_key`.
3. Fetch keybag metadata/envelopes; unwrap ARK with password, passkey PRF, trusted-device approval, or recovery.
4. ZK client: derive CAK, do fragment JWE + finalize + redirect. Standard client: finalize & redirect.

### 11.3 Password change

1. User verifies current password:
   - OPAQUE login via `/password/change/verify/start` → `/password/change/verify/finish`.
   - Receives `reauth_token` (JWT, 10m, `{ sub, purpose: "password_change" }`).
2. User sets a new password:
   - OPAQUE re‑registration via `/password/change/start` → `/password/change/finish` with `{ record, export_key_hash, reauth_token }`.
   - Server enforces reuse prevention using `export_key_hash` history and updates the OPAQUE record.
3. ARK handling on client:
   - Try to unwrap existing ARK with the old password envelope; if successful, create a new password envelope from the new `export_key`.
   - If recovery fails, require another envelope or recovery method. Email/password reset alone MUST NOT decrypt existing ARK.

---

## 12. Security Rules (non-negotiable)

* **Secure logging**: Follow the comprehensive logging restrictions defined in §2.2. NEVER log cryptographic material.
* `/authorize` only accepts `zk_pub` if `client.zk_delivery='fragment-jwe'`.
* `/token` only returns ZK hash metadata if the code has `has_zk=true`.
* **Bind everything**: pending-auth ↔ IdP session, code ↔ client\_id, `zk_key_hash` or legacy `drk_hash` ↔ code, `zk_pub_kid` ↔ code.
* **Short TTLs**: code ≤ 60 s; access/session token TTL short (e.g., 15 min).
* **Reauth for sensitive ops**: password change requires OPAQUE verification and a short‑lived JWT (`purpose="password_change"`, 10m) bound to the same subject.
* **Password reuse prevention**: server tracks `export_key_hash` per user and rejects reuse during `/password/change/finish`.
* **CSP** on all UIs: no inline scripts; self only.
* **CSP details**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'` (trusted-types disabled in dev for tooling compatibility). Admin and Install UIs use the same policy.
* **Security Headers**: X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, X-XSS-Protection: 1; mode=block
* **HSTS**: Strict-Transport-Security header set in production (max-age=31536000; includeSubDomains; preload)
* **Session transport (default)**: first-party web apps use cookie session authentication with OAuth refresh-assisted renewal.
  - Cookie name: `__Host-DarkAuth`.
  - Cookie flags: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`.
  - Refresh cookie name: `__Host-DarkAuth-User-Refresh`, flags: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`.
  - Session cookie is short-lived and uses explicit `Max-Age`.
  - Session identifier is rotated on login and OTP/privilege state transitions.
  - Silent renewal uses Authorization Code + PKCE issued refresh tokens with OAuth 2.0 refresh grant semantics.
  - Refresh token rotation remains single-use, client-bound, and atomic.
  - On successful refresh, the AS reissues the first-party session cookie so `/session` and UI state remain aligned.
* **Key custody (hosted-web default)**:
  - ARK and CAK are memory-only by default after callback handling.
  - The app removes `darkauth_key_jwe` or legacy `drk_jwe` from the URL immediately after processing and clears the ephemeral ZK private key after decrypting.
  - Reload without an in-memory CAK starts a fresh authorization request with a new `zk_pub`. If the Auth UI still has a valid session and an available unlock method, it can return a fresh JWE without prompting for the password. Otherwise key unlock is required.
  - Persistent plaintext ARK/CAK storage in `localStorage`, `sessionStorage`, JS-readable cookies, or IndexedDB MUST NOT be the default hosted-web ZK profile and MUST NOT be described as cryptographic protection.
  - Optional convenience modes MAY retain encrypted envelopes or non-extractable WebCrypto handles and MUST be labeled as a UX/security tradeoff.
* **Client-side browser storage (first-party web profile)**:
  - First-party cookie session ID is never readable by JS (`HttpOnly`) and is never stored in `localStorage` or `sessionStorage`.
  - First-party refresh credentials are also `HttpOnly` cookies and are never readable by JS.
  - Access/session bearer tokens are not persisted for first-party API transport.
  - `export_key` MAY be cached only in browser session scope (`sessionStorage`) for active-tab continuity and MUST be cleared on browser close.
  - When `export_key` is missing, the UI MUST require step-up password verification to rederive it; silent fallback to weaker key material is prohibited.
  - `pkce_verifier` and ephemeral ZK private key are kept in `sessionStorage` only for callback continuity and cleared immediately after callback/logout.
  - Public-client protections are mandatory: PKCE S256, strict `client_id` binding on refresh, single-use rotation, replay rejection, short lifetimes, CSP, and rate limiting.
* **Hosted-web ZK trust boundary**:
  - Security claims assume trusted user devices/browsers and trusted JavaScript from configured DarkAuth and RP frontend origins.
  - During honest operation, DarkAuth and app backends cannot decrypt app data from server-side state alone.
  - Malicious frontend code, XSS, compromised dependencies, browser extensions, device malware, compromised browsers, or an intentionally exfiltrating RP app can access DRK or plaintext while the browser can.
  - Trusted frontend origins for ZK clients MUST be explicit, HTTPS in production, and aligned with registered redirect URIs and `allowed_zk_origins`. Do not share a trusted origin with unrelated apps or user-controlled script surfaces.
* Admin authorization is coarse: `read` → deny all mutating operations; `write` → allow.
* User authorization is data-driven: effective permissions are the union of direct user permissions and those implied by groups.

---

## 13. Rate Limiting

The system implements comprehensive rate limiting to prevent brute force attacks and resource exhaustion:

### 13.1 Endpoint-Specific Limits

* **OPAQUE endpoints** (`/opaque/*`, `/authorize` with OPAQUE): 10 requests per 1 minutes per IP
  - Applies equally to admin OPAQUE login endpoints
* **Token endpoint** (`/token`): 30 requests per 1 minutes per IP
* **General API**: 100 requests per 1 minutes per IP
* **Admin endpoints**: 50 requests per 1 minutes per IP
* **Install endpoint**: 3 attempts per hour

### 13.2 Configuration

Rate limits are configurable via `settings.rate_limits` in the database:
```json
{
  "opaque": { "window_minutes": 1, "max_requests": 10, "enabled": true },
  "token": { "window_minutes": 1, "max_requests": 30, "enabled": true },
  "auth": { "window_minutes": 1, "max_requests": 20, "enabled": true },
  "general": { "window_minutes": 1, "max_requests": 100, "enabled": true }
}
```

### 13.3 Enforcement

* **Headers**: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
* **Response**: 429 Too Many Requests with retry information
* **Blocking**: IPs with excessive violations are temporarily blocked (1 hour)
* **Email-based limiting**: Additional rate limiting by email for auth endpoints

---

## 14. Errors (consistent with OAuth/OIDC)

* `invalid_request`: missing/invalid parameter (`zk_pub` present but client not ZK-enabled; missing `redirect_uri`; bad `code_challenge`).
* `unauthorized_client`: client not allowed for grant.
* `access_denied`: user canceled or login failed.
* `unsupported_response_type`: not `code`.
* `invalid_grant`: bad/expired/consumed code, PKCE mismatch.
* `server_error`: unhandled.
* Install errors: `forbidden_install_token`, `expired_install_token`, `already_initialized`.

Return JSON for token errors; use standard error fields.

---

## 14. Example: ZK client flow (wire)

**App → /authorize (with ZK)**

```
GET /authorize?
  client_id=app-web
  &redirect_uri=https%3A%2F%2Fapp.whatever.com%2Fcb
  &response_type=code
  &scope=openid%20profile
  &state=abc
  &code_challenge=...&code_challenge_method=S256
  &zk_pub=eyJrdHkiOiJ...   (base64url JWK)
```

**Auth UI JS (after authentication + key unlock)**

* `CAK = HKDF(ARK, context={sub,key_id,client_id,org_id,aud,version})`
* `darkauth_key_jwe = ECDH-ES+A256GCM({key_kind:"client_app_key", cak, ...metadata}, zk_pub)`
* `zk_key_hash = base64url(sha256(darkauth_key_jwe))`
* `POST /authorize/finalize { request_id, zk_key_hash }` → `{ code, state }` (server stores `zk_key_hash`)
* `location.assign(redirect_uri + '?code=...&state=...' + '#darkauth_key_jwe=' + encodeURIComponent(darkauth_key_jwe))`

**App → /token**

```
POST /token
  grant_type=authorization_code
  code=...
  client_id=app-web
  redirect_uri=https://app.whatever.com/cb
  code_verifier=...
```

**/token response**

```json
{
  "access_token":"...",
  "id_token":"...",
  "token_type":"Bearer",
  "expires_in":300,
  "zk_key_hash":"7mGfP3v9...",
  "zk_key_kind":"client_app_key",
  "zk_key_version":"v2"
}
```

**App verifies + decrypts**

* `if base64url(sha256(darkauth_key_jwe)) !== zk_key_hash` → abort.
* Else decrypt JWE with ephemeral private key.
* Verify `key_kind`, `client_id`, `sub`, `aud`, `state_hash`, `redirect_uri_hash`, `key_id`, and `exp`.
* Use CAK for app crypto.

---

## 15. Testing

* **Unit**:

  * Code/PKCE verification.
  * JOSE JWE round-trips with ephemeral keys.
  * ARK envelope wrap/unwrap determinism from a fixed `export_key`.
* **Integration**:

  * OPAQUE register/login (use the real lib; persist `opaque_records`).
  * `/authorize` pending logic → `/authorize/finalize` → code creation → `/token`.
  * ZK flow: `zk_pub` → fragment JWE → `zk_key_hash` binding.
* **E2E**:

  * ZK client SPA redirects, gets fragment JWE, completes token exchange, verifies hash and metadata, decrypts CAK, encrypts/decrypts a sample record.
  * Standard OIDC client (support desk) completes without ZK.

---

## 16. Performance & Limits

* Fragment size: JWE for 32-byte CAK plus metadata with P-256/A256GCM is expected to fit normal browser URL fragment limits; clients and tests must enforce practical size bounds.
* Code lifetime: 60 s; key handoff happens immediately on redirect.
* Settings and JWKS are cached in memory and reloaded on change (admin API optional).

---

## 17. Guardrails & Footguns

* If you refuse a bootstrap secret (KEK) and your DB leaks, attackers can mint tokens (private JWKs are in plaintext). That’s on you.
* Client-side crypto does not protect against XSS, malicious same-origin frontend code, compromised browsers/extensions, or RP apps that intentionally exfiltrate CAK/plaintext. Keep CSP strict and keep trusted origins narrow.
* Do **not** fall back to “hash password in JS and send to server”. That is not zero‑knowledge.

---

## 18. Demo Application (Zero-Knowledge Notes)

The system includes a fully functional demo application showcasing zero-knowledge encrypted note-taking:

### 18.1 Architecture
* **Frontend**: React + TypeScript with TipTap editor
* **Storage**: All notes encrypted client-side before server storage
* **Sharing**: End-to-end encrypted sharing using recipient's public keys

### 18.2 Cryptographic Implementation
* **Note Encryption**: AES-GCM with per-note DEK derived from user's DRK
* **Key Derivation**: `DEK = HKDF(DRK, salt="DarkAuth|demo-notes", info="note:" + noteId)`
* **Sharing Protocol**:
  1. Owner derives DEK from their DRK
  2. DEK wrapped with recipient's public key (ECDH-ES)
  3. Recipient unwraps DEK with their private key
  4. Both parties can decrypt note content

### 18.3 Security Properties
* During honest frontend operation, servers do not receive plaintext notes.
* During honest frontend operation, servers cannot decrypt shared notes from stored ciphertext alone.
* Perfect forward secrecy per note
* Cryptographic binding of notes to users

## 19. Implementation Notes (Node/TS)

* Use **Node 20+**, TS 5+.
* **`jose`** for JWT/JWE; **WebCrypto** in browser for ECDH/HKDF.
* OPAQUE: uses Cloudflare's `opaque-ts` library (RFC 9380 compliant); persist `opaque_records`.
* Keep a small “pending auth” store (DB table or in‑memory with session binding) keyed by `request_id`.
* Controller boundaries:

  * `/authorize` GET → validate & create pending; serve UI.
  * Auth UI → OPAQUE → DRK unwrap → `/authorize/finalize` → redirect.
  * `/token` → exchange code; emit `zk_key_hash` for v2 ZK clients or `zk_drk_hash` for legacy v1 clients.

---

## 19. Done Criteria

* Standard OIDC clients can authenticate and get tokens without any ZK additions.
* ZK-enabled v2 clients can receive CAK via fragment JWE, verify `zk_key_hash`, validate payload metadata, and decrypt app data locally.
* Password is not sent to the server in the OPAQUE flow; during honest frontend operation the server cannot derive ARK or CAK from stored state.
* All settings live in Postgres; install works with only `POSTGRES_URI`.
* Keys at rest are always encrypted with KEK.

---

If you want codegen to start immediately, point it at:

* the **schema SQL** above,
* the **endpoint contracts** here,
* generate the **Auth UI** page that runs the OPAQUE client, unwraps DRK, and (if `zk_pub`) creates the fragment JWE and calls `/authorize/finalize`.

This spec is tight enough to build the whole thing without guesswork.

---

# Implementation Decisions (v1)

- OPAQUE library: uses Cloudflare's `opaque-ts` implementation of RFC 9380. The library is properly vendored and provides TypeScript bindings for both browser (Auth/Admin UIs) and Node (server endpoints). We do not implement cryptography in JavaScript.
- Sessions and pending auth: store both in Postgres. Browser/API auth for first-party UI uses the `__Host-DarkAuth` HttpOnly cookie and CSRF token protection. Session state, pending-auth records, refresh token rotation state, and authorization codes are bound in DB for revocation and horizontal scaling.
- KEK passphrase (mandatory): Must be provided in `config.yaml`. System refuses to start without valid KEK.
- Defaults: seed `issuer` and `public_origin` to `http://localhost:9080` for development and require HTTPS origins in production. Seed `rp_id` accordingly.
- Trusted frontend origins: production ZK clients must use explicit HTTPS origins for Auth UI and RP frontends, with redirect URI allowlists and `allowed_zk_origins` kept in sync. Avoid wildcard origins and isolate apps that can execute user-authored content.
- Frontend compromise response: if Auth UI or RP frontend code, build pipeline, CDN, or dependency supply chain is suspected compromised, immediately disable affected ZK clients or ZK delivery, rotate/redeploy clean frontend assets, revoke active sessions and refresh tokens, review audit logs for suspicious authorization/finalize/token activity, notify affected users, and require key unlock before resuming key handoff.
- Audit log retention: keep authentication, authorization, client-admin, key-management, and ZK handoff metadata for a documented retention window; encrypt logs at rest; never retain cryptographic payloads or bearer secrets.
- Release note requirement: any change from persistent DRK storage to memory-only custody must warn operators that page reloads can require a fresh ZK authorization and may require OPAQUE step-up when `export_key` is no longer session-cached.
- UI technology: build the Auth UI and Admin UI with React + TypeScript + CSS Modules. The Node HTTP server serves the built static assets; no server-side rendering.
- ZK public key input: `zk_pub` is strictly `base64url(JSON.stringify(JWK))` where JWK fields include `kty`, `crv`, `x`, `y` (P‑256). The server computes `zk_pub_kid = SHA-256(zk_pub)` over the exact base64url string received to avoid ambiguity. No alternative encodings are accepted.
- Install flow: a one-time Install UI runs on the admin port when uninitialized. It is protected by a single-use, time-bound token. The initial admin (role `write`) is created with a password during installation via OPAQUE registration.
