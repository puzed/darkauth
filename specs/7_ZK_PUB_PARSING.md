# ZK Public Key (`zk_pub`) Encoding and Parsing Alignment

## Status

Adopted for DarkAuth v1 alignment. Implement now to match specs and clients.

## Goal

Align server and clients on the normative encoding of `zk_pub` for Zero‑Knowledge DRK delivery:
- `zk_pub` MUST be `base64url(JSON.stringify(JWK))` where the JWK is a P‑256 ECDH public key with fields: `kty="EC"`, `crv="P-256"`, `x`, `y` (no `d`).
- `zk_pub_kid` MUST be computed as `base64url(SHA‑256(zk_pub))` over the exact base64url string provided by the client.

This aligns with:
- specs/2_CORE.md (ZK Delivery)
- specs/0_OIDC_ZK_EXTENSION.md (Authorization Request Extension)

## Background

- The User UI already uses base64url(JSON.stringify(JWK)) for `zk_pub`.
- The API currently validates a JSON JWK in `authorize` by parsing `zk_pub` as raw JSON. A separate utility exists for base64url parsing.

## Requirements

1) Client Encoding
- Clients MUST send `zk_pub` as `base64url(JSON.stringify(JWK))` where the JWK contains:
  - `kty`: "EC"
  - `crv`: "P-256"
  - `x`, `y`: base64url strings that decode to 32 bytes each
  - MUST NOT contain `d`

2) Server Parsing and Validation
- `GET /api/authorize` MUST parse `zk_pub` via a base64url → JSON → JWK pipeline and validate:
  - JWK structural fields (kty, crv, x, y)
  - `x`, `y` decode to exactly 32 bytes
  - OPTIONAL: on‑curve validation SHOULD be added; if absent, reject malformed keys by length/format and disallow `d`.
- `zk_pub_kid` MUST be computed as `base64url(SHA‑256(zk_pub))` over the exact base64url string.
- Server MUST NOT log `zk_pub` or derived material.

3) Backward Compatibility (Short Window)
- During a deprecation window, the server MAY accept legacy raw‑JSON `zk_pub` values by detecting non‑base64url input and attempting JSON parse directly.
- When accepting legacy JSON, the server MUST re‑serialize the validated JWK with `JSON.stringify` and base64url‑encode to create a canonical `zk_pub` string for KID computation to ensure consistent `zk_pub_kid` across formats.
- After the deprecation window, remove legacy JSON acceptance.

4) Error Handling
- Malformed `zk_pub` → `invalid_request` with reason (e.g., missing fields, invalid base64url, wrong lengths).
- Unsupported client: if client `zk_delivery='none'`, reject requests that include `zk_pub`.
- Required ZK: if client `zk_required=true`, reject requests that omit `zk_pub`.

## Implementation Plan

- Controller: `packages/api/src/controllers/user/authorize.ts`
  - Replace `parseAndValidateZkPub` usage with base64url parser (`parseZkPub`) that decodes and validates the P‑256 JWK.
  - Compute KID via `createZkPubKid(zk_pub_base64url)` to bind exactly to the provided string.
  - Add a temporary legacy path: if base64url parse fails, attempt JSON parse + validate, then canonicalize to base64url before computing KID.

- Utilities: `packages/api/src/services/zkDelivery.ts`
  - Use existing `parseZkPub` and `createZkPubKid` helpers.
  - Add explicit check for `d` to ensure no private components are present.
  - (Optional) Add on‑curve validation (future; tracked separately) and reject keys not on curve.

- Logging
  - Ensure no logs include `zk_pub` or derived values.

## Test Plan

- Positive: valid base64url(JSON JWK) accepted; KID stable across calls.
- Legacy: valid raw JSON JWK accepted during deprecation and canonicalized; KID matches base64url of JSON.stringify(JWK).
- Negative: invalid base64url, invalid JSON, wrong `kty`/`crv`, non‑string `x`/`y`, wrong byte lengths (x/y ≠ 32), presence of `d`, rejected with `invalid_request`.
- Client with `zk_delivery='none'` + zk_pub → rejected.
- Client with `zk_required=true` and missing zk_pub → rejected.

## Security Notes

- Do not log `zk_pub` or derived materials.
- `zk_pub_kid` binds exactly to the provided base64url string; do not normalize beyond the canonical stringify used for legacy JSON fallback.
- Add on‑curve validation (recommended) in a follow‑up.

## Migration

- Announce deprecation of raw JSON format.
- After one release, remove legacy parsing and require base64url strictly.

