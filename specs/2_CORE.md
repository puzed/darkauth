Below is a **complete, implementable spec** for **DarkAuth v1** that your codegen agent can build. It’s OIDC-compatible by default, adds an **opt‑in zero-knowledge (ZK) DRK delivery** for your own clients via **fragment JWE**, uses **OPAQUE (RFC 9380)** for password auth (server never learns the password), and **stores *all* settings in Postgres**. The only required env at install is **POSTGRES\_URI**. Everything else is seeded into the DB.

Config rules:

- Shared and generated configuration is stored in Postgres `settings`.
- UI runtime configuration is served from the API as a runtime script `/config.js` and read by the UIs at load.
- OPAQUE server state (OPRF seed, AKE keypair, server identity) is persisted in Postgres `settings` (encrypted when KEK available).
- `config.yaml` is instance‑specific only: network/ports, database URI, KEK passphrase, dev flags. It must not contain shared secrets except the KEK passphrase.
- KEK passphrase is required in `config.yaml`; KDF params are stored in `settings`. The passphrase itself is never stored in database.

---

# DarkAuth v1 — Technical Spec

**Status:** implement now
**Principles:**

* Password never leaves the client (OPAQUE).
* Same deterministic client secret every session for a user+password (`export_key`).
* Server stores only **opaque verifier** + **wrapped DRK ciphertext**.
* OIDC-compatible for every client; ZK DRK delivery is **per‑client opt‑in** (your apps get it; others don’t).
* No config file at runtime; **all settings in Postgres**. Install script seeds defaults.

---

## 1. Components

* **User UI (port 9080)**: HTML/JS pages implementing OPAQUE client, DRK unwrap, and optional fragment JWE creation. Public OIDC origin (e.g., `https://auth.puzed.com`).
* **Auth API (port 9080)**: OIDC `/authorize`, `/token`, discovery, JWKS, OPAQUE server endpoints, DRK ciphertext store.
* **Admin UI (port 9081)**: Admin console for settings, clients, keys, users, groups, and permissions. Restricted access; not exposed publicly.
* **Apps (RP clients)**: Redirect to `/authorize`, exchange code at `/token`.

  * **ZK-enabled clients** add `zk_pub` and receive **DRK via fragment JWE**; standard clients don't.

* **Install UI (first-run only, served on admin port)**: One-time initialization UI gated by a single-use token (query param). Collected data seeds defaults and config. Served on the admin port until installation completes.

---

## 2. Cryptography

* **OPAQUE (RFC 9380)**: PAKE for password auth. Produces a **client-only `export_key`** (stable per user+password). The server stores an **opaque record** (envelope/verifier), not a password.
* **Key schedule (client)**

  ```
  MK  = HKDF-SHA256(export_key, salt=H("DarkAuth|v1|tenant=" + TENANT + "|user=" + sub), info="mk")
  KW  = HKDF-SHA256(MK, salt="DarkAuth|v1", info="wrap-key")       // wraps DRK
  KDerive = HKDF-SHA256(MK, salt="DarkAuth|v1", info="data-derive")// per-record keys if needed
  ```
  For v1 (single‑tenant), use `TENANT = "default"`.
* **DRK (Data Root Key)**: 32 bytes random, generated once on first login.

  * Server stores **WRAPPED\_DRK = AEAD\_Encrypt(KW, DRK, aad=sub)**.
  * Client unwraps DRK using `KW` each session; server never sees DRK or KW.
* **JWE for DRK handoff (ZK delivery)**: **ECDH-ES + A256GCM** (compact JWE) using **P‑256**.

  * Receiver key: app’s ephemeral `zk_pub` JWK from `/authorize` query.
  * AAD includes `sub` and `client_id`.
  * **`drk_hash = base64url(SHA-256(drk_jwe))`** is stored with the auth code and returned by `/token` to bind fragment → code.
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
- clients: `client_id` (pk), `name`, `type` in `public|confidential`, `token_endpoint_auth_method` in `none|client_secret_basic`, `client_secret_enc` (bytea|null), `require_pkce` (bool), `zk_delivery` in `none|fragment-jwe`, `zk_required` (bool), `allowed_jwe_algs` (text[]), `allowed_jwe_encs` (text[]), `redirect_uris` (text[]), `post_logout_redirect_uris` (text[]), `grant_types` (text[] default `authorization_code`), `response_types` (text[] default `code`), `scopes` (text[]), `allowed_zk_origins` (text[]), `created_at`, `updated_at`.
- users: `sub` (pk), `email` (unique, nullable), `name` (nullable), `created_at`.
- opaque_records: `sub` (pk, fk users.sub), `envelope` (bytea), `server_pubkey` (bytea), `updated_at`.
- wrapped_root_keys: `sub` (pk, fk users.sub), `wrapped_drk` (bytea), `updated_at`.
- user_encryption_keys: `sub` (pk, fk users.sub), `enc_public_jwk` (jsonb), `enc_private_jwk_wrapped` (bytea|null), `updated_at`.
- auth_codes: `code` (pk), `client_id` (fk clients.client_id), `user_sub`, `redirect_uri`, `code_challenge`, `code_challenge_method`, `expires_at`, `consumed` (bool), `has_zk` (bool), `zk_pub_kid` (text), `drk_hash` (text|null), `drk_jwe` (text|null).
- sessions: `id` (pk), `cohort` in `user|admin`, `user_sub` (nullable), `admin_id` (nullable), `created_at`, `expires_at`, `data` (jsonb), `refresh_token` (text|null), `refresh_token_expires_at` (timestamp|null).
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
  * `zk_delivery`: `{"fragment_param":"drk_jwe","jwe_alg":"ECDH-ES","jwe_enc":"A256GCM","hash_alg":"SHA-256"}`
  * `opaque`: e.g., `{"kdf":"ristretto255","envelope_mode":"base"}`
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

* `GET /.well-known/openid-configuration` → standard fields (issuer, authorization\_endpoint, token\_endpoint, jwks\_uri, response\_types\_supported, grant\_types\_supported, code\_challenge\_methods\_supported, scopes\_supported).
* `GET /.well-known/jwks.json` → `{ keys: [public JWKs] }`.

### 5.2 Authorization (two modes)

**A) Standard client (no ZK):**
`GET /authorize?client_id=&redirect_uri=&response_type=code&scope=openid%20profile&state=&code_challenge=&code_challenge_method=S256`

* DarkAuth validates client/redirect/PKCE (S256 only), shows login (OPAQUE).
* On success, issues code and `302` to `redirect_uri?code=...&state=...`.

**B) ZK-enabled client (DRK via fragment JWE):**
Same as above **+** `&zk_pub=<base64url(JWK)>` (ephemeral ECDH public key).

* DarkAuth **only** honors `zk_pub` if the client has `zk_delivery='fragment-jwe'`.
* After OPAQUE completes and the UI has unwrapped **DRK** client-side:

  1. Browser JS creates `drk_jwe = JWE_ECDH_ES_A256GCM(DRK, zk_pub)` with AAD `{sub, client_id}`.
  2. Browser JS calls `/authorize/finalize` (POST) with:
     `{ request_id, drk_hash }` where `drk_hash = base64url(SHA256(drk_jwe))`
     Server creates `code` and stores `has_zk=true`, `zk_pub_kid=SHA256(zk_pub)`, and `drk_hash`.
  3. Browser redirects:
     `location.assign(`\${redirect\_uri}?code=...\&state=...#drk\_jwe=\${encodeURIComponent(drk\_jwe)}`)`

> Note: we **do not** attempt to include the fragment on a server 302 because the server does not know `drk_jwe` (only the Auth UI JS does).

**/authorize internals**

* `GET /authorize` creates a **pending auth** record bound to the IdP session and returns the login page with a `request_id`.
* `POST /authorize/finalize` (Auth UI JS only, requires IdP session): validates pending auth, creates the code, and returns `{ code, state }`.

### 5.3 Token

`POST /token` (form): `grant_type=authorization_code&code=&redirect_uri=&client_id=&code_verifier`

- Validates code (unexpired, not consumed), PKCE (S256), client, `redirect_uri`.
- Mints `id_token` (and `access_token` if enabled by settings).
- Returns a `refresh_token` bound to the session.
- Optionally includes user authorization data as custom claims when configured: `permissions` (array of strings) and `groups` (array of strings). These reflect the union of direct user permissions and permissions derived from groups.
- If the code had `has_zk=true`, include `zk_drk_hash` (never include `zk_drk_jwe` - it's only in the fragment).
- Consume the code.

### 5.4 App behavior (ZK vs Standard)

* **ZK client**:

  1. Generate ephemeral ECDH keypair; send `zk_pub` on `/authorize`.
  2. After landing back, read `#drk_jwe`; call `/token`; verify `base64url(sha256(drk_jwe)) === zk_drk_hash`; decrypt JWE using local ephemeral private key → **DRK** in memory.
* **Standard client**: ignore ZK. Normal OIDC.

---

## 6. Auth UI Flow (client-side on DarkAuth origin)

1. **OPAQUE login** (via `/opaque/login/start` + `/opaque/login/finish`):

   * On success, IdP session cookie is set (server knows `sub`); **client gets `export_key`** in JS.
2. **Get/store DRK**:

   * `GET /crypto/wrapped-drk` → if missing (first login), generate 32‑byte DRK, `WRAPPED_DRK = AEAD_Encrypt(KW, DRK, aad=sub)`, `PUT /crypto/wrapped-drk`.
   * Derive `KW` from `export_key`; unwrap `WRAPPED_DRK` → DRK in memory.
3. **If ZK**:

   * read `zk_pub` from `location.search`.
   * `drk_jwe = ECDH-ES+A256GCM(DRK, zk_pub, AAD={sub,client_id})`.
   * `drk_hash = base64url(sha256(drk_jwe))`.
   * `POST /authorize/finalize` (server stores `drk_hash` on the code).
   * `location.assign(redirect_uri + '?code=...&state=...' + '#drk_jwe=' + encodeURIComponent(drk_jwe))`.
4. **Else** (non-ZK): call `/authorize/finalize` (no `drk_hash`), then 302.

---

## 7. HTTP Endpoints (precise)

All endpoints in this section are served on port `9080` (user). Admin UI/API runs on port `9081`.

### 7.1 Discovery

* **GET `/.well-known/openid-configuration`**
  Returns JSON with: `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `scopes_supported`, `response_types_supported`, `grant_types_supported`, `code_challenge_methods_supported`.

* **GET `/.well-known/jwks.json`**
  `{ "keys": [ {kty, crv/kid/x/y/..., alg, use} ] }`

### 7.2 OIDC

* **GET `/authorize`** (Rate-limited: 10 req/15min per IP for OPAQUE flows)
  **Query**: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`, optional `zk_pub` (base64url JWK).
  **Behavior**: validate request, record a pending-auth row bound to IdP session, serve login page with `request_id`. If `zk_pub` present, compute/store `zk_pub_kid = SHA256(zk_pub)` for that pending request (only if client `zk_delivery='fragment-jwe'`).

* **POST `/authorize/finalize`** (Auth UI only; requires IdP session; Rate-limited: 10 req/15min per IP)
  **Body**: `{ request_id, drk_hash? }` (drk_hash only for ZK clients)
  **Server**: look up pending auth, create authorization code with: `has_zk` (based on whether `zk_pub_kid` recorded), `zk_pub_kid`, and `drk_hash` if provided.
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
    "zk_drk_hash": "...",      // only when code.has_zk = true
    "zk_drk_jwe": "..."        // optional legacy fallback when stored
  }
  ```

### 7.3 OPAQUE (Rate-Limited)

* **POST `/opaque/register/start`**, **/finish** (10 req/15min per IP)
* **POST `/opaque/login/start`**, \**/finish`** (10 req/15min per IP)  
  *Uses Cloudflare's opaque-ts library (RFC 9380 compliant). The server stores the `opaque_records` row on register; login sets IdP session and returns whatever the client needs to compute `export_key`. Rate limiting prevents brute force attacks.*

### 7.4 DRK storage

* **GET `/crypto/wrapped-drk`** (IdP session required) → `{ wrapped_drk: base64url }` or `404` if not set.
* **PUT `/crypto/wrapped-drk`** (IdP session required) → `{ ok: true }` (store/replace ciphertext).

### 7.4.1 User encryption keys

Endpoints for publishing a user’s public encryption key and storing their wrapped private key (wrapped under DRK-derived key):

- **PUT `/crypto/enc-pub`** (IdP session required)
  Body: `{ enc_public_jwk: {kty, crv, x, y, ...} }`
  Upserts caller’s public JWK into `user_encryption_keys`.

- **GET `/crypto/user-enc-pub?sub=...`** (IdP session required)
  Returns `{ enc_public_jwk: {...} }` for the given subject. Visibility is controlled by `settings.user_keys.enc_public_visible_to_authenticated_users` (when false, only the owner can read).

- **PUT `/crypto/wrapped-enc-priv`** (IdP session required)
  Body: `{ wrapped_enc_private_jwk: base64url }` where the payload is AES‑GCM(`serialize(private_jwk)`) using a key derived from DRK.

- **GET `/crypto/wrapped-enc-priv`** (IdP session required)
  Returns `{ wrapped_enc_private_jwk: base64url }` for the caller or `404` if not set.

### 7.5 Session + Logout (optional)

* **GET `/session`** → minimal info for Auth UI.
* **POST `/logout`** → clears IdP session cookie.
* **POST `/refresh-token`** → `{ refreshToken }` → issues a new session and refresh token and resets the session cookie. For SPA session longevity.

### 7.6 User Directory

Authenticated endpoints to discover users and their published public encryption keys:

- **GET `/users/search?q=...`** → `{ users: [{ sub, display_name, public_key_jwk }] }` matching by name or email.
- **GET `/users/:sub`** → `{ sub, display_name, public_key_jwk }` for a specific user.

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
  4. Creates initial admin user with `role='write'`.
  5. Performs OPAQUE registration for the admin with the provided password, storing the `admin_opaque_records` entry.
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

Client guidance: attempt DRK preservation by deriving keys from both the old and new `export_key`. If the old DRK can be unwrapped, re‑wrap it under the new keys and store via `/crypto/wrapped-drk`. If recovery fails, generate a new DRK and publish fresh encryption keys.

## 8. Client (RP) Integration — ZK-enabled

**Before `/authorize`:**

* Generate ephemeral ECDH keypair (**P‑256**).
* Encode public JWK → `zk_pub = base64url(JSON.stringify(jwk))`.
* Add `zk_pub` to `/authorize` URL along with PKCE parameters.

**After redirect:**

* Parse `#drk_jwe` from `location.hash`.
* Exchange code at `/token`, read `zk_drk_hash`.
* Verify `base64url(sha256(drk_jwe)) === zk_drk_hash`.
* Decrypt JWE with ephemeral private key → **DRK** in memory.

**App data crypto (four functions using DRK):**

```ts
export async function encrypt(data: unknown, drk: CryptoKey|ArrayBuffer): Promise<string> {
  const key = await asAesGcmKey(drk);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(data));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  return toB64Url(concat(iv, new Uint8Array(ct)));
}
export async function decrypt(b64: string, drk: CryptoKey|ArrayBuffer): Promise<any> {
  const buf = fromB64Url(b64); const iv = buf.slice(0,12); const ct = buf.slice(12);
  const key = await asAesGcmKey(drk);
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
│  │  ├─ drkStore.ts           # GET/PUT wrapped_drk
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
4. **Generate random DRK** (32 bytes).
5. `KW = HKDF(export_key, ...)`; `WRAPPED_DRK = AEAD_Encrypt(KW, DRK, aad=sub)`; `PUT /crypto/wrapped-drk`.
6. If ZK: create `drk_jwe`, `drk_hash`; `POST /authorize/finalize` → get `code` → redirect with `#drk_jwe`. Else: finalize & redirect.

### 11.2 Login (other devices)

1. Same `/authorize`.
2. **OPAQUE login** → client gets `export_key`.
3. Fetch `WRAPPED_DRK`, unwrap with `KW` → DRK in memory.
4. ZK client: do fragment JWE + finalize + redirect. Standard client: finalize & redirect.

### 11.3 Password change

1. User verifies current password:
   - OPAQUE login via `/password/change/verify/start` → `/password/change/verify/finish`.
   - Receives `reauth_token` (JWT, 10m, `{ sub, purpose: "password_change" }`).
2. User sets a new password:
   - OPAQUE re‑registration via `/password/change/start` → `/password/change/finish` with `{ record, export_key_hash, reauth_token }`.
   - Server enforces reuse prevention using `export_key_hash` history and updates the OPAQUE record.
3. DRK handling on client:
   - Try to unwrap existing DRK with keys derived from the old `export_key`; if successful, re‑wrap under keys derived from the new `export_key` and `PUT /crypto/wrapped-drk`.
   - If recovery fails, generate a new DRK and publish fresh encryption keys.

---

## 12. Security Rules (non-negotiable)

* **Never** log `zk_pub`, `drk_jwe`, or any opaque/cryptographic payloads.
* `/authorize` only accepts `zk_pub` if `client.zk_delivery='fragment-jwe'`.
* `/token` only returns `zk_drk_hash` if the code has `has_zk=true`.
* **Bind everything**: pending-auth ↔ IdP session, code ↔ client\_id, drk\_hash ↔ code, `zk_pub_kid` ↔ code.
* **Short TTLs**: code ≤ 60 s; session cookie TTL short (e.g., 15 min).
* **Reauth for sensitive ops**: password change requires OPAQUE verification and a short‑lived JWT (`purpose="password_change"`, 10m) bound to the same subject.
* **Password reuse prevention**: server tracks `export_key_hash` per user and rejects reuse during `/password/change/finish`.
* **CSP** on all UIs: no inline scripts; self only.
* **CSP details**: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'; object-src 'none'; require-trusted-types-for 'script'` (trusted-types disabled in dev for tooling compatibility). Admin and Install UIs use the same policy.
* **Security Headers**: X-Frame-Options: SAMEORIGIN, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, X-XSS-Protection: 1; mode=block
* **HSTS**: Strict-Transport-Security header set in production (max-age=31536000; includeSubDomains; preload)
* **Cookies**: `__Host-DarkAuth` (Secure, HttpOnly, SameSite=Lax).
* **Client-side key storage**: 
  - DRK is XOR-obfuscated and stored in localStorage for session persistence (required for OAuth flow)
  - Ephemeral keys are cleared immediately after OAuth callback
  - No plaintext secrets in storage
  - Consider WebCrypto non-extractable keys for future enhancement
* Admin authorization is coarse: `read` → deny all mutating operations; `write` → allow.
* User authorization is data-driven: effective permissions are the union of direct user permissions and those implied by groups.

---

## 13. Rate Limiting

The system implements comprehensive rate limiting to prevent brute force attacks and resource exhaustion:

### 13.1 Endpoint-Specific Limits

* **OPAQUE endpoints** (`/opaque/*`, `/authorize` with OPAQUE): 10 requests per 1 minutes per IP
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

**Auth UI JS (after OPAQUE + DRK unwrap)**

* `drk_jwe = ECDH-ES+A256GCM(DRK, zk_pub)`
* `drk_hash = base64url(sha256(drk_jwe))`
* `POST /authorize/finalize { request_id }` → `{ code, state }` (server stores `drk_hash`)
* `location.assign(redirect_uri + '?code=...&state=...' + '#drk_jwe=' + encodeURIComponent(drk_jwe))`

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
  "zk_drk_hash":"7mGfP3v9..."
}
```

**App verifies + decrypts**

* `if base64url(sha256(drk_jwe)) !== zk_drk_hash` → abort.
* Else `DRK = JWE_decrypt(drk_jwe, eph_private_key)` → use DRK for app crypto.

---

## 15. Testing

* **Unit**:

  * Code/PKCE verification.
  * JOSE JWE round-trips with ephemeral keys.
  * DRK wrap/unwrap determinism from a fixed `export_key`.
* **Integration**:

  * OPAQUE register/login (use the real lib; persist `opaque_records`).
  * `/authorize` pending logic → `/authorize/finalize` → code creation → `/token`.
  * ZK flow: `zk_pub` → fragment JWE → `zk_drk_hash` binding.
* **E2E**:

  * ZK client SPA redirects, gets fragment JWE, completes token exchange, verifies hash, decrypts DRK, encrypts/decrypts a sample record.
  * Standard OIDC client (support desk) completes without ZK.

---

## 16. Performance & Limits

* Fragment size: JWE for 32‑byte DRK with P‑256/A256GCM is typically < 1 KB; safe for URL fragment.
* Code lifetime: 60 s; DRK handoff happens immediately on redirect.
* Settings and JWKS are cached in memory and reloaded on change (admin API optional).

---

## 17. Guardrails & Footguns

* If you refuse a bootstrap secret (KEK) and your DB leaks, attackers can mint tokens (private JWKs are in plaintext). That’s on you.
* Client-side crypto doesn’t protect against **XSS in the app**. Keep CSP strict.
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
* Server never sees plaintext notes
* Server cannot decrypt shared notes
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
  * `/token` → exchange code; emit `zk_drk_hash` when applicable.

---

## 19. Done Criteria

* Standard OIDC clients can authenticate and get tokens without any ZK additions.
* ZK-enabled clients can receive DRK via fragment JWE, verify `zk_drk_hash`, and decrypt DRK locally.
* Password never hits server; server can’t derive DRK.
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
- Sessions and pending auth: store both in Postgres. The browser holds only an HttpOnly `__Host-DarkAuth` session cookie (Secure, SameSite=Lax). Session state, pending-auth records, and authorization codes are bound in DB for revocation and horizontal scaling.
- KEK passphrase (mandatory): Must be provided in `config.yaml`. System refuses to start without valid KEK.
- Defaults: seed `issuer` and `public_origin` to `http://localhost:9080` for development and require HTTPS origins in production. Seed `rp_id` accordingly.
- UI technology: build the Auth UI and Admin UI with React + TypeScript + CSS Modules. The Node HTTP server serves the built static assets; no server-side rendering.
- ZK public key input: `zk_pub` is strictly `base64url(JSON.stringify(JWK))` where JWK fields include `kty`, `crv`, `x`, `y` (P‑256). The server computes `zk_pub_kid = SHA-256(zk_pub)` over the exact base64url string received to avoid ambiguity. No alternative encodings are accepted.
- Install flow: a one-time Install UI runs on the admin port when uninitialized. It is protected by a single-use, time-bound token. The initial admin (role `write`) is created with a password during installation via OPAQUE registration.
