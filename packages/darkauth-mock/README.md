# DarkAuth Mock

DarkAuth Mock is an app-agnostic local development OIDC provider. It implements authorization code
with PKCE, refresh tokens, JWKS, discovery, organization switching, and RP-initiated logout while
letting developers choose a configured identity without a password.

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
