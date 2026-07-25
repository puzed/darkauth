# DarkAuth Mock

DarkAuth Mock is an app-agnostic local development OIDC provider. It implements authorization code
with PKCE, refresh tokens, JWKS, discovery, organization switching, and RP-initiated logout while
letting developers choose a configured identity without a password.

It is not a security product and must not be deployed as a production identity provider.

```bash
docker run --rm \
  -p 3020:3020 \
  -e DARKAUTH_MOCK_CONFIG=/config/darkauth-mock.yaml \
  -v "$PWD/darkauth-mock.yaml:/config/darkauth-mock.yaml:ro" \
  -v darkauth-mock-data:/data \
  ghcr.io/puzed/darkauth-mock:latest
```

See `darkauth-mock.example.yaml` for the configuration shape. Without
`DARKAUTH_MOCK_CONFIG`, the server starts with a generic built-in demo identity.
