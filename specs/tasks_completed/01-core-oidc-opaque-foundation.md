# Core OIDC and OPAQUE foundation

Status: completed

## Delivered

- [x] Implement OIDC discovery, authorization-code issuance, token exchange, refresh, JWKS, and user-info surfaces.
- [x] Use OPAQUE for user and admin password registration, login, and client-side export-key derivation.
- [x] Bind login completion to server-held OPAQUE state and normalize failures to resist account enumeration.
- [x] Support optional ZK clients while retaining standard OIDC behavior for non-ZK clients.
- [x] Cover nonce, authorization binding, refresh, install, and OPAQUE security boundaries in automated tests.

## Evidence

- Initial implementation: commit `0880465`.
- Client-side OPAQUE export key: commit `a352b15`.
- OPAQUE identity binding and tests: commits `a6adc99`, `edf8144`.
- OIDC nonce binding: commits `1c0b899`, `4551c0b`; merged in PR #82 (`4420c5b`).
- ZK authorization binding hardening: PR #94 (`fa81222`).
