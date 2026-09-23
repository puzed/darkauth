# DarkAuth specifications

This directory is the product source of truth. Feature specifications describe the final behavior DarkAuth promises, whether it is already shipped or deliberately retained as a requirement. When code and a feature differ, keep the intended behavior in the feature and record the implementation gap as an active task.

## Core index

- [`CORE.md`](CORE.md): product boundaries, supported flows, and security invariants.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): package boundaries, runtime topology, and implementation rules.
- [`DATA_MODEL.md`](DATA_MODEL.md): persisted domains, ownership, and data invariants.
- [`SECURITY.md`](SECURITY.md): cryptographic boundaries, browser trust, secret handling, and legacy key compatibility.
- [`TESTING.md`](TESTING.md): test layers, required evidence, and repository quality gates.
- [`AGENTS.md`](AGENTS.md): rules for creating and maintaining specifications.

## Feature index

Feature specifications describe durable capabilities.

- [`features/authentication-and-sessions.md`](features/authentication-and-sessions.md): OPAQUE authentication, sessions, password lifecycle, and recovery.
- [`features/oidc-and-clients.md`](features/oidc-and-clients.md): provider endpoints, client registration, tokens, logout, and ZK delivery.
- [`features/organizations-and-rbac.md`](features/organizations-and-rbac.md): organizations, memberships, roles, and permissions.
- [`features/enterprise-federation-and-scim.md`](features/enterprise-federation-and-scim.md): enterprise OIDC connections and SCIM provisioning.
- [`features/otp-and-passkeys.md`](features/otp-and-passkeys.md): OTP, backup codes, WebAuthn, and trusted devices.
- [`features/account-and-email.md`](features/account-and-email.md): profile changes, verification, email delivery, and account recovery.
- [`features/user-portal.md`](features/user-portal.md): user dashboard, profile, organizations, connected identities, and account security.
- [`features/administration.md`](features/administration.md): installer and administration surfaces.
- [`features/user-key-management.md`](features/user-key-management.md): account keys, envelopes, recovery, and trusted-device unlock.
- [`features/zero-knowledge-key-delivery.md`](features/zero-knowledge-key-delivery.md): v2 CAK delivery and explicit v1 DRK compatibility.
- [`features/branding-and-email.md`](features/branding-and-email.md): semantic branding, assets, outbound email, and templates.
- [`features/audit-and-logging.md`](features/audit-and-logging.md): audit records, export, structured logging, and redaction.
- [`features/installation-and-operations.md`](features/installation-and-operations.md): bootstrap, storage modes, runtime, and deployment constraints.
- [`features/sdk-mock-and-demo.md`](features/sdk-mock-and-demo.md): client SDK, local mock provider, and integration example.

## Task index

Task specifications are temporary implementation plans. Active tasks belong in `tasks/`; delivered summaries belong in `tasks_completed/`.

- [`tasks/token-authentication-claims.md`](tasks/token-authentication-claims.md): correct `email_verified`, `amr`, and `acr` claim derivation.
- [`tasks/session-bound-unlock.md`](tasks/session-bound-unlock.md): restore ARK across tabs from a session-bound envelope instead of prompting per tab.
- [`tasks/sdk-session-bound-cak.md`](tasks/sdk-session-bound-cak.md): let relying parties keep CAK across reloads with an app-held wrapping key.
- [`tasks/test-coverage-gaps.md`](tasks/test-coverage-gaps.md): add verified RP logout and semantic-branding browser coverage.
- [`tasks_completed/01-core-oidc-opaque-foundation.md`](tasks_completed/01-core-oidc-opaque-foundation.md)
- [`tasks_completed/02-embedded-pglite.md`](tasks_completed/02-embedded-pglite.md)
- [`tasks_completed/03-otp-email-and-account-recovery.md`](tasks_completed/03-otp-email-and-account-recovery.md)
- [`tasks_completed/04-organization-rbac-federation-scim.md`](tasks_completed/04-organization-rbac-federation-scim.md)
- [`tasks_completed/05-user-key-management-v2.md`](tasks_completed/05-user-key-management-v2.md)
- [`tasks_completed/06-user-admin-ux-and-branding.md`](tasks_completed/06-user-admin-ux-and-branding.md)
- [`tasks_completed/07-rp-initiated-logout.md`](tasks_completed/07-rp-initiated-logout.md)
- [`tasks_completed/08-darkauth-mock.md`](tasks_completed/08-darkauth-mock.md)

## Lifecycle

### Features

1. Create or update a feature spec before changing a cross-package contract.
2. Describe the complete final state, not a delivery diary or checklist.
3. Put any known implementation drift in a linked active task without weakening the feature contract.
4. On delivery, reconcile the spec with code and retain the feature spec as the durable contract.
5. Remove superseded feature files after moving any still-valid decisions into the current spec.

### Tasks

1. Create a task spec only when work needs sequencing, migration notes, or unresolved decisions.
2. State the outcome, scope, non-goals, acceptance checks, and affected feature specs.
3. Keep an explicit checklist while work is active.
4. When complete, update durable feature/core documentation first, then replace the task with a concise delivered summary in `tasks_completed/`.
5. When abandoned, delete the task file after preserving any lasting decision in the appropriate feature spec.

Completed task records are historical evidence and never override a root or feature specification. Avoid speculative version numbers, dates, and claims that are not supported by the product contract or implementation evidence.
