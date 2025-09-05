# @DarkAuth/client

A TypeScript client library for DarkAuth - providing zero-knowledge authentication and client-side encryption capabilities for web applications.

## Features

- **Zero-Knowledge Authentication**: Secure OAuth2/OIDC flow with PKCE and ephemeral key exchange
- **Client-Side Encryption**: Built-in cryptographic functions for data encryption/decryption
- **Token Management**: Automatic token storage, validation, and refresh
- **Data Encryption Keys (DEK)**: Support for deriving and managing data encryption keys
- **Session Persistence**: Secure session storage with key obfuscation
- **TypeScript Support**: Full TypeScript definitions included

## Installation

```bash
npm install @DarkAuth/client
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
  zk: true // Enable zero-knowledge mode
});

// Start login flow
await initiateLogin();

// Handle OAuth callback (on your callback page)
const session = await handleCallback();
if (session) {
  console.log('Logged in!', session.idToken);
}

// Get existing session
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
  zk: true                                 // Enable zero-knowledge mode (default: true)
});
```

The client also supports environment variables for configuration:
- `DARKAUTH_ISSUER` or `VITE_DARKAUTH_ISSUER`
- `DARKAUTH_CLIENT_ID` or `VITE_CLIENT_ID`
- `VITE_REDIRECT_URI`

### Authentication Functions

#### `initiateLogin(): Promise<void>`

Starts the OAuth2/OIDC login flow with PKCE. Redirects the user to the DarkAuth authorization server.

#### `handleCallback(): Promise<AuthSession | null>`

Processes the OAuth callback after successful authentication. Returns an `AuthSession` object containing:
- `idToken`: JWT ID token
- `drk`: Derived Root Key for encryption operations
- `refreshToken?`: Optional refresh token

#### `logout(): void`

Clears all authentication data from storage.

#### `getStoredSession(): AuthSession | null`

Retrieves the current session from storage if valid.

#### `refreshSession(): Promise<AuthSession | null>`

Refreshes the current session using the stored refresh token.

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
}
```

### `Config`
```typescript
type Config = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  zk?: boolean;
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
- **Key Obfuscation**: DRK is obfuscated in storage for additional protection
- **Secure Storage**: Uses sessionStorage for tokens and localStorage for persistent data
- **AEAD Encryption**: AES-GCM with additional authenticated data for all encryption operations

## Browser Compatibility

This library requires a modern browser with support for:
- Web Crypto API
- ES2015+ features
- SessionStorage and LocalStorage

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Type checking
npm run typecheck

# Linting and formatting
npm run lint
npm run format
```

## License

MIT

## Contributing

Contributions are welcome! Please ensure all code passes linting and type checking before submitting a pull request.
