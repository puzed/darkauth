# DarkAuth mock

Status: completed

## Delivered

- [x] Add a local OIDC provider for application development and automated testing.
- [x] Support configurable mock identities and token issuance without requiring a DarkAuth deployment.
- [x] Publish a multi-architecture container image and tag it during releases.
- [x] Persist the mock signing key in YAML configuration for stable local issuer behavior.
- [x] Add developer setup documentation and link the tool from brochureware.

## Evidence

- Provider and container publishing: PR #180 (`c64e5fa`), including commits `2b2f895` and `072ea52`.
- Developer guide and brochureware: PR #183 (`73c0577`).
- YAML signing-key persistence and simplified setup: PR #187 (`fdad9d2`).
