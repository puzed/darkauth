# Installation and operations

## Bootstrap

- On startup without a discoverable `config.yaml`, DarkAuth enters installation mode with embedded PGlite and creates a random one-time install token.
- The server prints an admin-port URL in the form `http://localhost:<adminPort>/install?token=<token>`.
- The install flow selects storage, optionally configures SMTP and self-registration, and creates the first admin through OPAQUE registration. Origins and relying-party settings come from runtime configuration; a missing KEK passphrase is generated during web installation.
- Install tokens are validated for the bootstrap operations and expire. Completion rejects replay after initialization.
- Completion persists `config.yaml`; subsequent startup uses the configured database and refuses secure-key operation when the KEK passphrase is absent or cannot decrypt the signing key.

`pnpm install:script` provides the package's scripted installer. `pnpm clean` removes local install state and embedded data; it is destructive.

## Runtime

- Default user port: `9080`.
- Default admin port: `9081`.
- Both are served by one API process through separate HTTP servers.
- `publicOrigin`, `issuer`, and `rpId` must describe the externally visible user origin and WebAuthn relying party.
- `proxyUi` proxies the development UI servers; otherwise the API serves built static assets.
- `GET /api/health` is available on both ports.
- `SIGINT` and `SIGTERM` stop both servers, destroy open sockets, and release context resources.

Supported database modes are remote PostgreSQL and embedded PGlite. Run schema commands from the repository root:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:push
```

## Operational constraints

- Put TLS and external routing in front of both ports as appropriate for the deployment. Do not expose the admin port as a public user endpoint.
- Configure `DARKAUTH_LOG_LEVEL` or `LOG_LEVEL` for structured server logging.
- Authentication and abuse rate limits are configurable in database settings, but counters, blocked identifiers, and their cache are process-local in-memory state. They reset on restart and are neither coordinated nor shared across replicas. Multi-process deployments require an external distributed limiter before relying on aggregate limits.
