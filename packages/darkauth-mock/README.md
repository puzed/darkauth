# DarkAuth Mock

DarkAuth Mock is an app-agnostic local development OIDC provider. It implements authorization code
with PKCE, rotating refresh tokens, JWKS, discovery, UserInfo, organization switching, RP-initiated
logout, and DarkAuth zero-knowledge key delivery v2, while letting developers choose a configured
identity without a password.

It is not a security product and must not be deployed as a production identity provider.

```bash
docker run --rm \
  -p 3020:3020 \
  -v "$PWD/darkauth-mock.yaml:/config/darkauth-mock.yaml" \
  ghcr.io/puzed/darkauth-mock:latest
```

See `darkauth-mock.example.yaml` for the configuration shape. On first launch, the mock adds its
generated `signingKey` to the YAML file and reuses it on later launches. The container reads
`/config/darkauth-mock.yaml` by default. Outside the container, set `DARKAUTH_MOCK_CONFIG` to use a
configuration file; without it, the server starts with a generic built-in demo identity.

## Tokens

Like DarkAuth, the token endpoint returns separate tokens. The ID token carries profile, organization,
role, and permission claims. The access token adds `token_use: "access"`, `azp`, `scope`,
`grant_type`, and `sid`. When a client lists `scopes`, requested scopes must be in that list and
access-token `permissions` only include permissions that were also granted as scopes. `/userinfo`
accepts access tokens and returns `name` for `profile` and `email`/`email_verified` for `email`.

Refresh tokens are single use: each refresh returns a new one. Browser apps on an
`allowedOrigins` origin can call `/token` cross-origin in the SDK's `refreshMode: "token"`. Ending
the session at `/api/logout` with an `id_token_hint` revokes that sign-in's refresh tokens. State
lives in memory, so restarting the mock signs everyone out.

## Zero-knowledge clients

A client with `keyDelivery: v2` behaves like a DarkAuth `fragment-jwe` client on key delivery v2.
When the SDK sends `zk_pub`, the mock derives a Client App Key (CAK) from the user's account root
key (ARK) exactly as DarkAuth does, encrypts it to `zk_pub` as an `ECDH-ES`/`A256GCM` compact JWE
with the full v2 payload bindings, returns it as `darkauth_key_jwe` in the redirect fragment, and
returns `zk_key_hash`, `zk_key_kind`, and `zk_key_version` from `/token`. The SDK's
`handleCallback()` verifies it and exposes `clientAppKey`.

Each user's ARK is `ark` from the config (base64url, 32 bytes) or is derived from `keySeed` and the
user's `sub`, so CAKs stay stable across restarts. `keyId` defaults to `mock-account-key`.

```yaml
keySeed: my-dev-seed
clients:
  - id: mail
    keyDelivery: v2
    requireOrganizationSelection: false
    scopes: [openid, profile, email, mail:admin]
users:
  - sub: alice
    email: alice@example.test
    name: Alice Admin
    permissions: [mail:admin]
```

`requireOrganizationSelection: false` lets users sign in without an organization; those tokens
carry no `org_id`, and the CAK is not bound to an organization. With the default `true`, the CAK is
bound to the selected organization unless `clientKeyScope: account` is set.
