# User key management v2

Status: completed

## Delivered

- [x] Separate identity authentication from local key unlock state.
- [x] Add account root key envelopes and client-scoped key delivery metadata.
- [x] Keep OPAQUE export keys and plaintext account/client keys out of server responses and storage.
- [x] Add passkey management, PRF-backed unlock where supported, recovery keys, and trusted-browser approval.
- [x] Add user unlock/setup journeys and admin key-management controls.
- [x] Preserve explicit migration and recovery behavior for existing DRK users.
- [x] Cover envelope guardrails and complete key-management journeys in API and end-to-end tests.

## Evidence

- Security and key-management base: PR #139 (`779a1e1`).
- Passkeys and unlock UI: PR #141 (`025bb4d`).
- Trusted-browser unlock: PR #142 (`8aaf634`).
- Complete API, UI, SDK, admin, and test phase: PR #143 (`6da9c8a`).
