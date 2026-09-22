# SDK Session-Bound CAK

Status: design open

## Objective

Let a relying party such as Keyman keep its CAK across reloads without redirecting to DarkAuth, using the same pattern as [session unlock](../features/user-key-management.md#session-unlock) on the relying party's own origin.

## Proposed shape

- The client SDK encrypts CAK with AES-GCM and stores the ciphertext in the relying party's `localStorage`.
- The relying party's backend holds the wrapping key on its own session and returns it to its own first-party requests. No cross-site request or third-party cookie is involved.
- The relying party's sign-out and session expiry delete the wrapping key.
- Apps without a backend keep memory-only CAK and use a silent authorization round-trip with remembered consent.

## Open questions

- SDK surface: browser helper plus a small server helper, or browser helper with an app-supplied `getWrappingKey()` callback only.
- Default: opt-in per app.

## Checklist

- [ ] Agree the SDK surface.
- [ ] Update `features/sdk-mock-and-demo.md` and `features/zero-knowledge-key-delivery.md` custody rules.
- [ ] Implement in `packages/darkauth-client` with tests.
- [ ] Demonstrate in the demo app.
