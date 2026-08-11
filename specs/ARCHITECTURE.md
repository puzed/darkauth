# Architecture

## Workspace map

- `packages/api`: Node.js HTTP runtime, installer, domain models, protocol services, and database schema.
- `packages/user-ui`: React user, authorization, account, and key-unlock UI.
- `packages/admin-ui`: React installation and administration UI.
- `packages/opaque-ts`: shared OPAQUE client/server implementation.
- `packages/darkauth-client`: browser integration for OIDC and optional ZK key delivery.
- `packages/darkauth-mock`: configurable OIDC provider for local application development.
- `packages/branding`: shared branding types and rendering support.
- `packages/test-suite`: Playwright end-to-end coverage.
- `packages/demo-app`: relying-party integration fixture.
- `packages/brochureware` and `packages/docs`: public site and user documentation.

The repository uses pnpm workspaces. Root scripts orchestrate package scripts; `pnpm tidy` and `pnpm build` are the repository-wide validation commands.

## API layering

`packages/api/src/context/createContext.ts` constructs the dependency graph:

- typed configuration;
- PostgreSQL or PGLite database access;
- structured, redacted logging;
- OPAQUE and KEK services;
- cleanup functions for pools, embedded storage, and timers.

The implementation follows these boundaries:

- Routers map method and path to controllers.
- Controllers parse and validate HTTP input, authenticate and authorize, call domain code, and shape responses.
- Models own database queries and domain invariants.
- Services own cryptography, external protocols, email, keys, sessions, and multi-step orchestration.
- UI packages call HTTP contracts and own browser-only key operations.

Controllers must not query `context.db` directly. Models and services must not depend on HTTP request or response objects.

## Server lifecycle

`packages/api/src/createServer.ts` creates one managed application with user and admin HTTP servers.

- `start()` binds both configured ports.
- `stop()` closes listeners, destroys tracked sockets, and destroys the context.
- `restart()` reloads root configuration, reconstructs the context and both servers, then starts them again.
- Runtime resources belong to the context and register cleanup through `context.cleanupFunctions`.

Production and tests use the same server/context construction rather than global singleton state.

## Request surfaces

- User router: public metadata, OIDC/OAuth, OPAQUE, account recovery, OTP, WebAuthn, organizations, profile, and keybag APIs.
- Admin router: admin sessions plus settings, users, clients, organizations, roles, permissions, federation, signing keys, email, OTP, and audit APIs.
- Install router: first-run status, OPAQUE admin registration, and installation completion.
- SCIM router: bearer-token-protected provisioning resources.

Static React builds are served by the API in production. Development may proxy UI requests to Vite when `proxyUi` is enabled.

## Configuration and bootstrap

`packages/api/src/config/loadConfig.ts` searches for `config.yaml` and applies defaults. Absence of the file places the process in install mode. The installer chooses storage, creates the initial admin through OPAQUE registration, writes instance configuration, seeds database state, and restarts the managed server.

Database-backed settings override shared runtime behavior after initialization. Configuration that is required before opening the database remains in `config.yaml`.

## Cryptographic boundaries

- OPAQUE state is split between browser/client operations, server services, persisted records, and expiring login sessions.
- KEK services encrypt server-held secrets at rest.
- Signing services publish public JWKS while retaining encrypted private JWK material.
- Account keys remain wrapped in database storage and are unlocked in browser memory.
- ZK delivery ciphertext is created by browser code and transferred in a URL fragment, outside the server-visible query string.

## Change rules

- Add domain persistence in a model before exposing it through a controller.
- Keep route registration declarative and place endpoint behavior in a controller.
- Reuse the context rather than introducing global dependencies.
- Update `DATA_MODEL.md` for schema-domain or ownership changes.
- Update `CORE.md` for changes to public protocol behavior or security invariants.
- Add end-to-end coverage for cross-package flows and focused tests beside API/UI code for local behavior.
