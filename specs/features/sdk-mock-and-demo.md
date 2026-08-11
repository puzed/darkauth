# SDK, mock provider, and demo

## Browser SDK

`packages/darkauth-client` implements OIDC Authorization Code with PKCE for browser applications.

- Resolves authorization, token, JWKS, and logout endpoints from discovery.
- Starts login with optional organization context and optional ZK key delivery.
- Exchanges callbacks, validates state, and keeps the active session and ZK private material in memory by default.
- Refreshes token sets and switches organization context through supported endpoints.
- `logout()` clears local SDK state only.
- `endSession()` clears local state and navigates to RP-initiated logout; redirect URIs must exactly match the client's configured post-logout allowlist.

See `packages/darkauth-client/README.md` for the public API and integration examples.

## Local mock provider

`packages/darkauth-mock` is a development-only OIDC provider. It supports:

- discovery and EdDSA JWKS;
- authorization code with S256 PKCE;
- configurable users, organizations, roles, and permissions;
- bearer-backed session and organization switching endpoints;
- rotating refresh tokens;
- RP-initiated logout navigation.

Configuration is YAML; see `packages/darkauth-mock/darkauth-mock.example.yaml`. With `DARKAUTH_MOCK_CONFIG`, the provider generates an Ed25519 private JWK on first launch, writes it to that file with restrictive permissions, and reuses it. The mock does not implement DarkAuth's OPAQUE or production security controls and must not be deployed as an identity provider.

```bash
pnpm --filter @DarkAuth/mock start
pnpm --filter @DarkAuth/mock test
```

## DarkNotes demo

`packages/demo-app` is the end-to-end SDK example. Its React frontend receives DarkAuth key delivery, encrypts note data in the browser, and talks to the demo API, which stores encrypted application data in PostgreSQL. The Playwright scenario is `packages/test-suite/tests/demo/demo-app-note-flow.spec.ts`.

```bash
pnpm demodb:push
pnpm demo:dev
```

The demo is example integration code, not part of the DarkAuth server's persistence or authorization boundary.
