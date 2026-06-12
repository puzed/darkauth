# @DarkAuth/client

A TypeScript client library for DarkAuth - providing zero-knowledge authentication and client-side encryption capabilities for web applications.

The client supports both:
- ZK-enabled OAuth/OIDC flows
- Standard OAuth/OIDC flows without ZK delivery

## Features

- **Zero-Knowledge Authentication**: Secure OAuth2/OIDC flow with PKCE and ephemeral key exchange
- **Client-Side Encryption**: Built-in cryptographic functions for data encryption/decryption
- **Token Management**: First-party cookie refresh by default, with optional legacy token storage
- **Data Encryption Keys (DEK)**: Support for deriving and managing data encryption keys
- **DRK Custody**: Memory-only DRK handling by default for hosted web zero-knowledge apps
- **Organization Switching**: App-owned and hosted organization selection flows for tenant-scoped apps
- **TypeScript Support**: Full TypeScript definitions included

## Installation

```bash
pnpm install @DarkAuth/client
```

## Quick Start

### Basic Setup

```typescript
import { setConfig, initiateLogin, handleCallback, getStoredSession } from '@DarkAuth/client';

// Configure the client
setConfig({
  issuer: 'https://auth.example.com',
  clientId: 'your-client-id',
  redirectUri: 'https://app.example.com/callback',
  zk: false // Optional: disable ZK request parameters for standard OIDC flows
});

// Start login flow
await initiateLogin();

// Handle OAuth callback (on your callback page)
const session = await handleCallback();
if (session) {
  console.log('Logged in!', session.accessToken);
}

// Get existing in-memory session
const existingSession = getStoredSession();
if (existingSession && isTokenValid(existingSession.idToken)) {
  // User is authenticated
}
```

## API Reference

### Configuration

#### `setConfig(config: Partial<Config>)`

Configure the DarkAuth client with your authentication settings.

```typescript
setConfig({
  issuer: 'https://auth.example.com',     // DarkAuth server URL
  clientId: 'your-client-id',              // Your application's client ID
  redirectUri: 'https://app.example.com/callback', // OAuth callback URL
  scope: 'openid profile email',           // Optional OAuth scopes
  zk: true,                                // Optional. Default true. Set false for non-ZK flows.
  firstParty: true,                        // Optional. Default true. Uses cookie refresh and memory storage.
  tokenStorage: 'memory',                  // Optional. Default 'memory'. Use 'localStorage' only for legacy flows.
  drkStorage: 'memory',                    // Optional. Default 'memory'. Use 'localStorage' only for explicit convenience mode.
  refreshMode: 'cookie',                   // Optional. Default 'cookie'. Use 'token' only for legacy refresh-token clients.
  credentials: 'include'                   // Optional. Default 'include' for cookie refresh.
});
```

The client also supports environment variables for configuration:
- `DARKAUTH_ISSUER` or `VITE_DARKAUTH_ISSUER`
- `DARKAUTH_CLIENT_ID` or `VITE_CLIENT_ID`
- `VITE_REDIRECT_URI`

### Authentication Functions

#### `initiateLogin(options?: InitiateLoginOptions): Promise<void>`

Starts the OAuth2/OIDC login flow with PKCE. Redirects the user to the DarkAuth authorization server.

Pass `organizationId` when the app already knows which organization the user wants to enter. The SDK sends it as `organization_id` on `/authorize`, and DarkAuth validates active membership before issuing a code. Omit it when the app wants DarkAuth to select the only active organization or show the hosted organization selector for multi-organization users.

#### `handleCallback(): Promise<AuthSession | null>`

Processes the OAuth callback after successful authentication. Returns an `AuthSession` object containing:
- `idToken`: JWT ID token
- `accessToken?`: OAuth access token for API authorization
- `drk`: Derived Root Key for encryption operations. In non-ZK flows this is an empty `Uint8Array`.
- `refreshToken?`: Optional refresh token

Behavior:
- OAuth `state` is validated before exchanging the authorization code.
- If ZK artifacts are present in the callback/token response, ZK validation and DRK decryption are enforced.
- If no ZK artifacts are present, callback still succeeds as a standard OIDC flow.
- In default first-party mode, tokens and DRK are kept in memory and refresh uses `HttpOnly` cookies set by DarkAuth.
- Legacy `localStorage` token or DRK persistence is available only when explicitly configured.

#### `logout(): void`

Clears the in-memory session, callback state, PKCE verifier, ephemeral ZK key, and any explicitly configured legacy storage.

#### `getStoredSession(): AuthSession | null`

Retrieves the current in-memory session if valid. For non-ZK sessions, returns `drk` as an empty `Uint8Array`.

If `tokenStorage: 'localStorage'` or `drkStorage: 'localStorage'` is configured for a legacy app, this function can also restore those explicitly persisted values.

#### `refreshSession(options?: { force?: boolean }): Promise<AuthSession | null>`

Refreshes the current session. In default first-party mode, the browser sends the DarkAuth refresh cookie and no JavaScript-readable refresh token is required. For non-ZK sessions, returns `drk` as an empty `Uint8Array`.

Use `{ force: true }` after hosted first-party organization changes so the app receives tokens for the newly selected organization even if the current in-memory ID token has not expired.

### Organization Switching

DarkAuth treats organization switching as choosing a new authorization context. Tokens are scoped to one selected organization at a time. Apps must not merge roles or permissions across organizations.

#### `listOrganizations(): Promise<DarkAuthOrganization[]>`

Returns the current user's organizations for app-owned switcher UI. When the SDK has a current app access token, the request is authorized with `Authorization: Bearer <access_token>` and does not depend on DarkAuth session cookies. Use `status` to decide which memberships are selectable.

#### `getSessionInfo(): Promise<{ authenticated: boolean; sub?: string; email?: string | null; name?: string | null; organizationId?: string; organizationSlug?: string | null }>`

Returns current first-party session and organization context for app chrome before a fresh OAuth callback is needed.

#### `switchOrganization(organizationId: string, options?: SwitchOrganizationOptions): Promise<AuthSession | null>`

Switches the selected organization. The default `token` mode exchanges the current app access token for fresh tokens scoped to the selected organization. `authorize` mode starts a new authorization-code flow. `hosted` mode redirects to DarkAuth's `/switch-org` page.

#### App-owned switcher

Use this pattern when the app owns the workspace rail, menu, or account switcher UI.

```typescript
import {
  getCurrentUser,
  listOrganizations,
  switchOrganization,
} from '@DarkAuth/client';

const organizations = await listOrganizations();
const activeOrganizationId = getCurrentUser()?.org_id;

async function selectOrganization(organizationId: string) {
  const session = await switchOrganization(organizationId);
  const selectedOrganizationId = getCurrentUser()?.org_id;
}
```

After the exchange, verify that `selectedOrganizationId` matches the workspace being loaded. Treat the switch as a tenant or workspace state reset: clear tenant-local caches, selected resources, open realtime subscriptions, in-flight requests, and authorization decisions before loading data for the new `org_id`.

Use `mode: 'authorize'` when a deployment should re-enter the redirect-based OAuth flow for every organization switch.

#### Hosted switcher

Use this pattern when DarkAuth should own the organization picker UI.

```typescript
import { refreshSession, switchOrganization } from '@DarkAuth/client';

await switchOrganization('org_123', {
  mode: 'hosted',
  returnTo: window.location.href,
});

const session = await refreshSession({ force: true });
```

Hosted mode redirects to DarkAuth's `/switch-org` page. DarkAuth updates the first-party session organization and returns to the app. The app then forces a refresh so the ID and access tokens reflect the selected organization.

#### Token claims

When organization context is resolved, ID and access tokens can include:

- `org_id`: selected organization ID.
- `org_slug`: selected organization slug.
- `roles`: roles for the selected organization only.
- `permissions`: permissions for the selected organization only.

Use `sub` for the user identity and `org_id` for the active tenant or workspace. A user can have different roles in different organizations, so apps must authorize each request against the token's selected `org_id` and must reject resource access for a different organization.

### User Information

#### `getCurrentUser(): JwtClaims | null`

Returns the parsed JWT claims from the current ID token.

#### `parseJwt(token: string): JwtClaims | null`

Parses a JWT token and returns its claims.

#### `isTokenValid(token: string): boolean`

Checks if a JWT token is still valid (not expired).

### Cryptographic Functions

The library exports comprehensive cryptographic utilities from `./crypto`:

#### Encoding/Decoding
- `bytesToBase64Url(bytes: Uint8Array): string`
- `base64UrlToBytes(base64url: string): Uint8Array`
- `bytesToBase64(bytes: Uint8Array): string`
- `base64ToBytes(base64: string): Uint8Array`

#### Hashing
- `sha256(bytes: Uint8Array): Promise<Uint8Array>`

#### Key Derivation
- `hkdf(key: Uint8Array, salt: Uint8Array, info: Uint8Array, length?: number): Promise<Uint8Array>`
- `deriveDek(drk: Uint8Array, noteId: string): Promise<Uint8Array>`

#### Encryption/Decryption
- `aeadEncrypt(key: CryptoKey, plaintext: Uint8Array, additionalData: Uint8Array): Promise<{iv: Uint8Array, ciphertext: Uint8Array}>`
- `aeadDecrypt(key: CryptoKey, payload: Uint8Array, additionalData: Uint8Array): Promise<Uint8Array>`
- `encryptNote(drk: Uint8Array, noteId: string, content: string): Promise<string>`
- `decryptNote(drk: Uint8Array, noteId: string, ciphertextBase64: string, aadObject: Record<string, unknown>): Promise<string>`

#### Key Management
- `wrapPrivateKey(privateKeyJwk: JsonWebKey, drk: Uint8Array): Promise<string>`
- `unwrapPrivateKey(wrappedKey: string, drk: Uint8Array): Promise<JsonWebKey>`

### Data Encryption Keys (DEK)

#### `resolveDek(noteId: string, isOwner: boolean, drk: Uint8Array): Promise<Uint8Array>`

Resolves a data encryption key for a specific resource. If the user is the owner, derives the DEK directly. Otherwise, fetches and decrypts the shared DEK.

#### `clearKeyCache(): void`

Clears the cached encryption keys.

### Hooks System

#### `setHooks(hooks: ClientHooks)`

Configure hooks for custom data fetching:

```typescript
setHooks({
  fetchNoteDek: async (noteId: string) => {
    // Fetch encrypted DEK for a shared note
    const response = await fetch(`/api/notes/${noteId}/dek`);
    return response.text();
  },
  fetchWrappedEncPrivateJwk: async () => {
    // Fetch user's wrapped private key
    const response = await fetch('/api/user/private-key');
    return response.text();
  }
});
```

## Types

### `AuthSession`
```typescript
interface AuthSession {
  idToken: string;
  accessToken?: string;
  drk: Uint8Array;
  refreshToken?: string;
}
```

### `JwtClaims`
```typescript
interface JwtClaims {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  org_id?: string;
  org_slug?: string;
  roles?: string[];
  permissions?: string[];
}
```

### `Config`
```typescript
type Config = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  zk?: boolean;
  firstParty?: boolean;
  tokenStorage?: 'memory' | 'localStorage';
  drkStorage?: 'memory' | 'localStorage';
  refreshMode?: 'cookie' | 'token';
  credentials?: RequestCredentials;
}
```

### `DarkAuthOrganization`
```typescript
type DarkAuthOrganization = {
  organizationId: string;
  slug: string;
  name: string;
  status: string;
  roles?: Array<{ id: string; key: string; name: string }>;
}
```

### `InitiateLoginOptions`
```typescript
type InitiateLoginOptions = {
  organizationId?: string;
  returnTo?: string;
}
```

### `SwitchOrganizationOptions`
```typescript
type SwitchOrganizationOptions = {
  mode?: 'authorize' | 'hosted';
  returnTo?: string;
}
```

### `ClientHooks`
```typescript
type ClientHooks = {
  fetchNoteDek?: (noteId: string) => Promise<string>;
  fetchWrappedEncPrivateJwk?: () => Promise<string>;
}
```

## Security Features

- **PKCE (Proof Key for Code Exchange)**: Protects against authorization code interception
- **Zero-Knowledge Mode**: Ephemeral key exchange for enhanced privacy
- **State Validation**: Verifies OAuth state before token exchange
- **First-Party Cookie Refresh**: Supports `HttpOnly` refresh cookies instead of JavaScript-readable refresh tokens
- **Memory-Only DRK Default**: Keeps the DRK out of persistent browser storage unless explicitly configured otherwise
- **AEAD Encryption**: AES-GCM with additional authenticated data for all encryption operations

## Custody Model

Auth and session tokens are not the same as the DRK.

In the default first-party hosted-web profile, DarkAuth protects refresh credentials with `HttpOnly` cookies and the SDK keeps the active ID/access token view in memory. The DRK is returned to the app because the app's browser code needs it to decrypt user data. That DRK is also memory-only by default. A page reload loses it and the app should start a fresh authorization request with a new ephemeral `zk_pub`.

This model supports the hosted-web zero-knowledge claim for honest operation: the DarkAuth backend and app backend do not receive the user's password, OPAQUE export key, plaintext DRK, or plaintext app data. It still requires trusting the browser, the user's device, and the JavaScript served by the trusted origins.

## Browser Compatibility

This library requires a modern browser with support for:
- Web Crypto API
- ES2015+ features
- SessionStorage
- LocalStorage only when explicitly using legacy persistence options

## Development

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Type checking
pnpm typecheck

# Linting and formatting
pnpm lint
pnpm format
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure all code passes linting and type checking before submitting a pull request.
