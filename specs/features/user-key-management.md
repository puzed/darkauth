# User key management

Status: implemented v2 model with follow-up work tracked separately

## Model

- ARK is the stable, random 32-byte account root generated in the browser.
- An account key record identifies ARK generation and derivation version without containing plaintext ARK.
- A key envelope wraps the same ARK for one unlock method. Supported model types are password, passkey PRF, trusted device, and recovery.
- Authentication proves the user's identity. Unlock obtains ARK locally. Federated SSO and passkeys without PRF can authenticate without unlocking encrypted data.
- The browser may hold ARK briefly to create or rotate envelopes, derive CAK, approve a device, or unwrap the user's encryption private key.

## Keybag API

- `GET /crypto/keybag` returns account-key metadata and usable envelopes for the authenticated user.
- `POST /crypto/keybag/account-key` records browser-created account-key metadata.
- Envelope create and revoke endpoints store ciphertext and metadata; they never accept plaintext ARK or wrapping material.
- Admin key-status endpoints expose metadata and can revoke an envelope. They do not decrypt it.
- Legacy `GET/PUT /crypto/wrapped-drk` remains a migration boundary, not the v2 storage model.

## Password envelopes

1. OPAQUE authentication completes in the browser and produces `export_key`.
2. Browser code derives the password envelope wrapping key with domain-separated HKDF context.
3. The wrapping key encrypts ARK with authenticated metadata binding the subject, account key, envelope, type, and algorithm.
4. The API stores only ciphertext, salt/algorithm metadata, and identifiers.

Password change must unwrap the existing ARK and create a new password envelope from the new `export_key`. Password reset without an unlock method cannot recover existing encrypted data; recovery, passkey PRF, or trusted-device approval is required to preserve ARK.

## Other unlock methods

- A passkey is an unlock method only when a real PRF output was obtained and an envelope was created for that credential.
- Trusted-device approval requires an authenticated target session. An unlocked device encrypts ARK to the target device's ephemeral public key; the API only relays the encrypted approval.
- Recovery secrets are high entropy, shown once, and never stored plaintext by the API.
- A user with no account key generates ARK and at least one envelope client-side before a ZK authorization can finish.

## CAK derivation

V2 clients receive a Client App Key rather than ARK:

```text
salt = SHA-256("DarkAuth|v2|client-key|sub=" + sub + "|key_id=" + key_id)
info = "client_id=" + client_id + "|org_id=" + org_id + "|aud=" + aud
CAK = HKDF-SHA256(ARK, salt, info, 32)
```

- Derivation inputs must come from the validated authorization context.
- The same complete context produces a stable CAK; changing client, account-key generation, or configured organization context changes it.
- CAK compromise is scoped to the receiving client context and does not reveal ARK or another client's CAK.

## Browser custody

- Plaintext ARK and CAK are memory-only by default.
- Persistent plaintext storage is unsupported and must not be presented as cryptographic protection.
- Reload without CAK begins a new authorization with a new ephemeral delivery key.
- A remembered device stores an encrypted envelope and, where supported, a non-extractable local key handle. This does not defend against active same-origin code.

## Legacy DRK compatibility

- Existing DRK can be treated as initial ARK material during migration so existing encrypted data remains readable.
- Only clients explicitly registered with `key_delivery_version = "v1-drk"` receive root material through the legacy flow.
- V2 clients use `key_delivery_version = "v2"`, derive CAK, and must never receive legacy DRK/ARK directly.

## Verification

- `packages/api/src/controllers/user/keybag.test.ts` verifies account-key and envelope API behavior.
- `packages/api/src/services/passwordReset.test.ts` verifies reset replaces authentication credentials without falsely rewrapping ARK envelopes.
- `packages/user-ui/src/components/Authorize.test.js` verifies v2 authorization derives CAK before delivery.
