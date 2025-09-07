# Complete Guide: How the Cloudflare opaque-ts Library Works

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Key Concepts](#key-concepts)
4. [Implementation Guide](#implementation-guide)
5. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
6. [Wrong Paths We Went Down](#wrong-paths-we-went-down)
7. [Error Handling Patterns](#error-handling-patterns)
8. [Complete Working Example](#complete-working-example)
9. [Security Considerations](#security-considerations)
10. [Lessons Learned](#lessons-learned)

## Overview

OPAQUE (Oblivious Pseudorandom Authenticated Key Exchange) is a revolutionary password authentication protocol where:
- **The server NEVER learns the password** - not even during registration
- **No password hashes are stored** - only encrypted envelopes
- **Deterministic export keys** - same password always produces the same key
- **Ephemeral session keys** - different key for each login session
- **Protection against offline attacks** - even if the database is compromised

### How It Works (High Level)
1. **Registration**: Client blinds password, server evaluates it obliviously, client creates encrypted envelope
2. **Authentication**: Client and server perform authenticated key exchange using the envelope

## Prerequisites

### Critical: Web Crypto API Setup

The opaque-ts library requires the Web Crypto API. In Node.js, this MUST be set up before importing the library:

```typescript
import { webcrypto } from 'node:crypto';

// This MUST happen before importing opaque-ts!
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}

// Now safe to import
import { OpaqueServer, OpaqueClient } from 'opaque-ts';
```

**What happens if you forget this?**
- Cryptic errors about undefined operations
- Functions returning undefined
- Random crashes during crypto operations

## Key Concepts

### 1. Cryptographic Suites (OpaqueID)

The library supports three suites:
```typescript
OpaqueID.OPAQUE_P256  // P-256 curve + SHA-256 (recommended)
OpaqueID.OPAQUE_P384  // P-384 curve + SHA-384
OpaqueID.OPAQUE_P521  // P-521 curve + SHA-512
```

### 2. Server Components

The server needs three critical components:

#### OPRF Seed (32 bytes)
- Used for deterministic password evaluation
- MUST be kept SECRET
- MUST be persistent (same across restarts)
- MUST be cryptographically random

```typescript
const oprfSeed = Array.from(randomBytes(32));
// In production: Store this securely and reuse it!
```

#### AKE Keypair (Elliptic Curve)
- Used for Authenticated Key Exchange
- MUST be proper EC keypair (not random bytes!)
- Private key must be kept SECRET
- Public key is shared during registration

```typescript
// RIGHT WAY - Use proper EC key generation:
import { generateKeyPair } from '@cloudflare/voprf-ts';
const serverKeyPair = await generateKeyPair('P256-SHA256');
const akeKeypair = {
  private_key: Array.from(serverKeyPair.privateKey),
  public_key: Array.from(serverKeyPair.publicKey)
};

// WRONG WAY - Don't use random bytes!
// const akeKeypair = {
//   private_key: Array.from(randomBytes(32)),  // ❌ Not a valid EC key!
//   public_key: Array.from(randomBytes(33))    // ❌ Not derived from private!
// };
```

#### Server Identity (String)
- Identifies the server in the protocol
- Used in key derivation
- Must be consistent across all operations

### 3. Data Types and Conversions

The library uses `number[]` arrays for byte data:
```typescript
// Convert Uint8Array to number[]
const numberArray = Array.from(uint8Array);

// Convert number[] to Uint8Array
const uint8Array = new Uint8Array(numberArray);
```

## Implementation Guide

### Server Initialization

```typescript
import { OpaqueServer, OpaqueConfig, OpaqueID } from 'opaque-ts';

const config = new OpaqueConfig(OpaqueID.OPAQUE_P256);
const server = new OpaqueServer(
  config,
  oprfSeed,        // number[] - 32 bytes
  akeKeypair,      // { private_key: number[], public_key: number[] }
  'server-identity' // string
);
```

### Registration Flow

```typescript
// === CLIENT SIDE ===
const client = new OpaqueClient(config);

// Step 1: Create registration request
const regRequest = await client.registerInit(password);
if (regRequest instanceof Error) throw regRequest;

// === SERVER SIDE ===
// Step 2: Server evaluates request
const regResponse = await server.registerInit(regRequest, username);
if (regResponse instanceof Error) throw regResponse;

// === CLIENT SIDE ===
// Step 3: Complete registration
const regResult = await client.registerFinish(
  regResponse,
  serverIdentity,  // Must match server's identity
  username         // Client identity
);
if (regResult instanceof Error) throw regResult;

// === SERVER SIDE ===
// Step 4: Store the record
const userRecord = regResult.record;  // Store this!
const serverPublicKey = regResponse.server_public_key;  // Store this too!
```

### Authentication Flow

```typescript
// === CLIENT SIDE ===
const loginClient = new OpaqueClient(config);

// Step 1: Create login request
const loginRequest = await loginClient.authInit(password);
if (loginRequest instanceof Error) throw loginRequest;

// === SERVER SIDE ===
// Step 2: Process login request
// CRITICAL: Pass client_identity as 4th parameter!
const loginResponse = await server.authInit(
  loginRequest,
  storedRecord,     // From registration
  username,         // Credential identifier
  username          // ⚠️ CLIENT IDENTITY - MUST BE PROVIDED!
);
if (loginResponse instanceof Error) throw loginResponse;

// === CLIENT SIDE ===
// Step 3: Complete authentication
const loginResult = await loginClient.authFinish(
  loginResponse,
  serverIdentity,   // Same as registration
  username          // Same as registration
);
if (loginResult instanceof Error) throw loginResult;

// === SERVER SIDE ===
// Step 4: Verify and get session key
const serverResult = server.authFinish(loginResult.ke3);
if (serverResult instanceof Error) throw serverResult;

// Both now have matching session keys!
```

## Common Pitfalls and Solutions

### 1. "Array of byte-sized integers expected"

**Problem**: Deserialize methods are called incorrectly

**Wrong**:
```typescript
RegistrationRequest.deserialize(bytes);  // ❌ Missing config
```

**Right**:
```typescript
RegistrationRequest.deserialize(config, bytes);  // ✅ Config first
```

### 2. "handshake error" during login

**Problem**: MAC verification fails during authFinish

**Common Causes**:
1. Not passing `client_identity` to `server.authInit()`
2. Using different identities than during registration
3. Using different server keys than during registration

**Solution**:
```typescript
// Always pass client_identity as 4th parameter!
const loginResponse = await server.authInit(
  loginRequest,
  storedRecord,
  credentialId,
  clientIdentity  // ⚠️ CRITICAL - often missed!
);
```

### 3. "undefined" errors

**Problem**: Result is undefined when it shouldn't be

**Common Causes**:
1. Web Crypto API not set up
2. Using `isErr()` on wrong types
3. Accessing wrong property names

**Solution**: Check error handling patterns (see below)

## Wrong Paths We Went Down

### 1. Assuming Result Types Everywhere

**What we thought**: All methods return `Result<T, E>` types that work with `isErr()`

**Reality**: Three different patterns:
- Async methods: return `Promise<T | Error>`
- Sync methods: return `T | Error`
- Deserialize methods: throw errors

**Lesson**: Always check the actual return type!

### 2. Creating Invalid EC Keypairs

**What we tried**:
```typescript
// Just use random bytes for keys
const keypair = {
  private_key: Array.from(randomBytes(32)),
  public_key: Array.from(randomBytes(33))
};
```

**Why it failed**: These aren't valid elliptic curve keys! The public key must be derived from the private key using EC math.

**Solution**: Use proper key generation:
```typescript
import { generateKeyPair } from '@cloudflare/voprf-ts';
const keyPair = await generateKeyPair('P256-SHA256');
```

### 3. Missing the Client Identity Parameter

**What we did**:
```typescript
// Only passed 3 parameters
server.authInit(loginRequest, record, username)
```

**Why it failed**: The 4th parameter (`client_identity`) is used in MAC calculation. Without it, the MAC verification fails with "handshake error".

**Solution**: Always pass all 4 parameters:
```typescript
server.authInit(loginRequest, record, credentialId, clientIdentity)
```

### 4. Not Storing Server Public Key

**What we thought**: Only need to store the user's record

**Reality**: Must store BOTH:
- The user's registration record
- The server's public key used during registration

### 5. Confusing Serialization Formats

**What we tried**: Treating serialized data as `Uint8Array` everywhere

**Reality**: 
- `.serialize()` returns `number[]`
- `.deserialize()` expects `number[]`
- Need to convert when storing/transmitting
- Database libraries (like PGlite) may return `Uint8Array` instead of `Buffer` - always check and convert

## Error Handling Patterns

The library uses THREE different error patterns:

### Pattern 1: Promise<T | Error> (Async Methods)

Used by: `registerInit`, `authInit`, `registerFinish`, `authFinish` (on client)

```typescript
const result = await client.registerInit(password);
if (result instanceof Error) {
  console.error('Failed:', result.message);
  throw result;
}
// result is now typed as T
```

### Pattern 2: T | Error (Sync Methods)

Used by: `server.authFinish`

```typescript
const result = server.authFinish(ke3);
if (result instanceof Error) {
  console.error('Failed:', result.message);
  throw result;
}
// result is now typed as T
```

### Pattern 3: Throws Errors (Deserialize Methods)

Used by: All static `.deserialize()` methods

```typescript
try {
  const obj = RegistrationRequest.deserialize(config, bytes);
  // obj is now the deserialized object
} catch (error) {
  console.error('Deserialization failed:', error);
  throw error;
}
```

### Wrong Pattern We Tried: Result Types

We initially thought the library used Result types with `isErr()`:
```typescript
// WRONG - This pattern is NOT used by opaque-ts
if (isErr(result)) {
  throw new Error(result.error.message);
}
```

This caused confusion because `isErr()` is imported but only used internally by the library.

## Complete Working Example

See [how-opaque-ts-works.ts](../how-opaque-ts-works.ts) for a fully commented, working demonstration that includes:
- Proper setup and initialization
- Complete registration flow
- Complete authentication flow
- Error handling
- Verification of keys
- All lessons learned

To run it:
```bash
npx tsx how-opaque-ts-works.ts
```

## Security Considerations

### 1. Secret Management

**Must Keep Secret**:
- OPRF seed (32 bytes)
- Server private key
- Never log or expose these!

**Can Be Public**:
- Server public key
- User records (they're encrypted)
- All serialized protocol messages

### 2. Persistence Requirements

**Must Persist**:
- OPRF seed (must be same across restarts)
- Server keypair
- User records
- Server public key per user

**Ephemeral**:
- Session keys (different each login)
- KE1, KE2, KE3 messages

### 3. Identity Consistency

Identities must be consistent:
- Server identity: Same during registration and login
- Client identity: Same during registration and login
- Credential identifier: Unique per user

### 4. Key Properties

**Export Key**:
- Deterministic (same password → same key)
- Use for: client-side encryption, deriving app keys
- Never changes unless password changes

**Session Key**:
- Ephemeral (different each login)
- Use for: session authentication, temporary encryption
- Should be rotated periodically

## Lessons Learned

### 1. Read the Source Code

The TypeScript definitions don't tell the whole story. We had to read the actual implementation to understand:
- Error handling patterns
- Parameter requirements
- Return types

### 2. Test in Isolation

Creating a standalone test file (`how-opaque-ts-works.ts`) was crucial for understanding the library without the complexity of the full application.

### 3. Don't Assume API Patterns

We assumed the library followed common patterns (Result types, consistent error handling) but it actually uses three different patterns based on the method type.

### 4. Cryptographic Keys Matter

Using proper elliptic curve keys instead of random bytes is critical. The math must be correct for the protocol to work.

### 5. Every Parameter Matters

The `client_identity` parameter in `authInit` seemed optional but is actually critical for the MAC calculation. Missing it causes subtle failures.

### 6. Debug Messages Help

Adding detailed logging at each step helped identify exactly where things were failing and what data was being passed.

### 7. State Management is Complex

The protocol requires careful state management:
- Registration state must be preserved perfectly
- Server public key must be stored with user record
- Identities must be consistent

## Summary

The opaque-ts library is powerful but has several non-obvious requirements:

1. **Setup Web Crypto before importing**
2. **Use proper EC keypairs, not random bytes**
3. **Pass client_identity to authInit (4th parameter)**
4. **Store both record AND server public key**
5. **Handle three different error patterns**
6. **Pass config to all deserialize methods**
7. **Keep identities consistent**

Following this guide and using the working example as a reference will help avoid the many pitfalls we encountered during implementation.

## Resources

- [Working Example](../how-opaque-ts-works.ts) - Fully commented demonstration
- [OPAQUE RFC](https://datatracker.ietf.org/doc/draft-irtf-cfrg-opaque/) - Protocol specification
- [opaque-ts GitHub](https://github.com/cloudflare/opaque-ts) - Library source code
- [@cloudflare/voprf-ts](https://github.com/cloudflare/voprf-ts) - OPRF implementation