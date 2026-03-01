# Organizations + RBAC Specification

## Summary

Move DarkAuth from global user groups to organization-scoped RBAC.

Target model:
- Group 1 domain:
`organizations` and `users` with many-to-many membership.
- Group 2 domain:
`roles` and `permissions` with many-to-many mapping.
- Assignment domain:
a `user + organization` membership can have one or more roles.

This model supports:
- users in multiple organizations
- different roles for the same user in different organizations
- role reuse across organizations
- standard least-privilege permission checks
- organization-level OTP enforcement (`organizations.force_otp`)

## Why This Change

Current behavior is global:
- `groups` and `permissions` are not organization-scoped.
- a user’s effective access is global and cannot vary by org context.

For multi-tenant SaaS, the standard pattern is org-scoped RBAC:
- membership defines tenant boundary
- role assignment happens at membership scope
- permissions are resolved in org context

## Goals

- Introduce organizations as first-class entities.
- Make authorization decisions org-scoped.
- Do not preserve runtime backward compatibility with the legacy global groups model.
- Avoid forced downtime and risky big-bang rewrites.
- Use migrations for all database changes without modifying historical migration files.

## Non-Goals

- Fine-grained ABAC/policy engine in this phase.
- Hierarchical organizations in this phase.
- Replacing admin-portal admin-user roles (`read`/`write`) in this phase.
- Maintaining legacy authorization semantics after cutover.

## Domain Model

## Core Entities

- `users`
- `organizations`
- `organization_members`
- `roles`
- `permissions`
- `role_permissions`
- `organization_member_roles`

## Organization Security Policy

OTP enforcement is organization-level, not role-level.

- Every organization has `force_otp` (boolean).
- `force_otp` default is `false` for all organizations.
- If `force_otp = true`, every active member of that organization must complete OTP.
- The `default` organization may enable `force_otp`, but it is not enabled automatically unless explicitly set.
- The `otp_required` role is not part of this model.

## Relationships

- User ↔ Organization:
many-to-many via `organization_members`.
- Role ↔ Permission:
many-to-many via `role_permissions`.
- OrganizationMember ↔ Role:
many-to-many via `organization_member_roles`.

## Recommended Table Shapes

`organizations`
- `id` `uuid` pk
- `slug` `text` unique
- `name` `text` not null
- `force_otp` `boolean` not null default `false`
- `created_by_user_sub` `text` nullable fk `users.sub`
- `created_at`, `updated_at`

`organization_members`
- `id` `uuid` pk
- `organization_id` fk `organizations.id` on delete cascade
- `user_sub` fk `users.sub` on delete cascade
- `status` enum: `active`, `invited`, `suspended`
- `created_at`, `updated_at`
- unique: (`organization_id`, `user_sub`)

`roles`
- `id` `uuid` pk
- `key` `text` unique
- `name` `text` not null
- `description` `text` nullable
- `system` `boolean` default false
- `created_at`, `updated_at`

`permissions`
- keep existing table

`role_permissions`
- `role_id` fk `roles.id` on delete cascade
- `permission_key` fk `permissions.key` on delete cascade
- pk: (`role_id`, `permission_key`)

`organization_member_roles`
- `organization_member_id` fk `organization_members.id` on delete cascade
- `role_id` fk `roles.id` on delete cascade
- pk: (`organization_member_id`, `role_id`)

Optional for onboarding:
`organization_invites`
- `id` `uuid` pk
- `organization_id` fk
- `email` `text` not null
- `role_ids` `uuid[]` or normalized invite-role table
- `token_hash` `text` unique
- `expires_at`, `accepted_at`, `created_by_user_sub`, `created_at`

## Authorization Resolution

Given `(user_sub, organization_id)`:
1. Resolve membership in `organization_members` with `status = active`.
2. Resolve roles through `organization_member_roles`.
3. Resolve permissions through `role_permissions`.
4. Effective permission set is union of role permissions.
5. Resolve OTP requirement from `organizations.force_otp`.
6. Deny if no active membership.

OTP requirement is determined only by organization policy in the selected org context.

## OAuth/OIDC Behavior

## Access Token Claims

Keep existing claims stable by default and add org-scoped claims when org context is present:
- `org_id`
- `org_slug` (optional)
- `roles` (org-scoped role keys)
- `permissions` (org-scoped effective permissions)

## Org Context Selection

Two supported modes:
- explicit org context:
client passes selected organization (`organization_id`) during authorization/login continuation.
- default org context:
if no org provided and user has one membership, use it.

If multiple memberships and no org selected:
- return a deterministic error (`ORG_CONTEXT_REQUIRED`) or redirect to org picker in user portal flow.

## Compatibility Policy

DarkAuth is pre-launch, so this change is a clean cutover:
- no runtime fallback to legacy group-based authorization
- no dual-read between old and new permission resolvers
- all first-party clients should move to org-scoped authorization behavior in the same release window

## API Surface

## User APIs

- `GET /api/user/organizations`
- `POST /api/user/organizations`
- `GET /api/user/organizations/{organizationId}`
- `GET /api/user/organizations/{organizationId}/members`
- `POST /api/user/organizations/{organizationId}/invites`
- `POST /api/user/organizations/{organizationId}/members/{memberId}/roles`
- `DELETE /api/user/organizations/{organizationId}/members/{memberId}/roles/{roleId}`

Authorization rule:
- membership required for read endpoints
- org role/permission required for management endpoints

## Admin APIs

Admin portal remains control-plane and gets organization-aware endpoints:
- org CRUD and search
- org security policy update (including `force_otp`)
- role CRUD
- role-permission mapping
- member-role assignment

## Data Migration Strategy

## Phase 0: Additive Schema

- create new org and role tables.
- keep existing tables present only until cutover migration is complete.
- do not edit existing migration files; add new forward-only migrations only.

## Phase 1: Backfill

- create default organization record (`default`) or one configurable bootstrap org.
- create `organization_members` for all existing users in bootstrap org.
- convert existing `groups` to `roles` one-time map.
- convert existing `user_groups` assignments to membership-role assignments in bootstrap org.
- convert existing `group_permissions` to `role_permissions`.
- set `organizations.force_otp = false` by default for all orgs.

## Phase 2: Cutover

- switch resolvers, APIs, and token claims to org-scoped model.
- enforce org context rules.
- remove `otp_required` role checks from auth gating.
- require OTP when selected org has `force_otp = true`.

## Phase 3: Legacy Removal

- remove legacy groups-based auth paths and tables.
- keep optional data archive/export before destructive drops.
- remove `otp_required` seed role and related assignment logic.
## Security Requirements

- enforce server-side org membership on every org-scoped endpoint.
- prevent cross-org reads and writes by strict `organization_id` filters.
- audit log every membership and role change with actor, org, target, and diff.
- enforce invite token expiry and single-use semantics.
- do not leak org existence in error detail for unauthorized callers.

## Performance Requirements

- add indexes:
`organization_members (user_sub)`,
`organization_members (organization_id)`,
`organization_member_roles (organization_member_id)`,
`role_permissions (role_id)`.
- cache role-permission expansion per `(organization_member_id, role_version)` if needed.
- keep token mint path bounded by indexed joins.

## Rollout and Safety

- use feature flags only for controlled enablement of new behavior:
`rbac.organizations.enabled`,
`rbac.orgScopedTokens.enabled`.
- ship additive migrations first.
- run backfill idempotently.
- add metrics:
auth denies by reason, org-context-missing count, org resolver latency.
- run canary rollout on internal/staging tenants before global enablement.

## Acceptance Criteria

- user can belong to multiple organizations.
- same user can hold different roles in different organizations.
- permission checks are org-scoped when flag enabled.
- OTP requirement is org-scoped via `organizations.force_otp`, defaulting to disabled.
- token claims include org context and org-scoped permissions.
- no legacy auth fallback remains after cutover.
- no cross-org data leakage in API tests.

## Open Questions

- one role or multiple roles per membership:
this spec supports multiple roles per membership.
- should roles be global templates or org-local:
this spec uses global role definitions assigned per org membership.
- org selection UX for OAuth flows with multi-org users:
requires product decision on redirect to org picker vs API error.

## Implementation Tasks (Grouped + Parallel)

### Track A: Schema, Migrations, and Backfill (critical path)

- [ ] Add schema tables: `organizations`, `organization_members`, `roles`, `role_permissions`, `organization_member_roles`, optional `organization_invites`.
- [ ] Add Drizzle relations and indexes for all new tables.
- [ ] Create idempotent migration scripts for schema creation.
- [ ] Create idempotent backfill script: users -> bootstrap org memberships.
- [ ] Create idempotent backfill script: groups -> roles and assignments.
- [ ] Add migration verification queries and failure rollback notes.
- [ ] Add install/bootstrap seeding for default organization and base roles.

Parallelization:
- This track should start first.
- Can run in parallel with Track F documentation scaffolding and Track G test harness setup.

### Track B: Authorization Resolver and Token Pipeline

- [ ] Implement org-scoped access resolver model (`user_sub + organization_id -> roles + permissions`).
- [ ] Add resolver feature flag switching for controlled rollout of org-scoped mode.
- [ ] Add token claim enrichment for org context and org-scoped permissions.
- [ ] Add org-context required handling (`ORG_CONTEXT_REQUIRED`).
- [ ] Replace role-based OTP enforcement with `organizations.force_otp` policy check.
- [ ] Add telemetry for resolver latency and authorization denials.

Parallelization:
- Depends on Track A schema definitions.
- Can run in parallel with Track C and Track D once table contracts are stable.

### Track C: User API (Organizations and Membership)

- [ ] Add user controllers/models for organization list/create/get.
- [ ] Add member list and invite endpoints.
- [ ] Add role assignment/removal endpoints at membership scope.
- [ ] Add organization settings read endpoint exposing `force_otp` for members.
- [ ] Add request/response schemas and OpenAPI registration.
- [ ] Add audit logging for all org and membership mutations.

Parallelization:
- Depends on Track A.
- Can run in parallel with Track B and Track D.

### Track D: Admin Portal API and UI

- [ ] Add admin API endpoints for org management and role templates.
- [ ] Add admin API endpoints for role-permission mapping.
- [ ] Add admin API endpoint to update `organizations.force_otp`.
- [ ] Add admin UI pages for organizations, members, roles, and permissions.
- [ ] Add admin UI actions for assigning roles to org members.
- [ ] Add admin UI toggle for Force OTP in organization settings.
- [ ] Add safeguards for destructive role/org operations.

Parallelization:
- Depends on Track A.
- Can run in parallel with Track B and Track C.

### Track E: User Portal UX

- [ ] Add user portal org switcher and active-org state.
- [ ] Add user portal pages for org membership and basic org management.
- [ ] Wire authorization flow to selected organization context.
- [ ] Add graceful handling when multi-org user has no org selected.

Parallelization:
- Depends on Track C endpoint availability.
- Can run in parallel with Track D UI work.

### Track F: Tests and Verification

- [ ] Add model tests for org membership, role mapping, and permission resolution.
- [ ] Add controller tests for org APIs and authorization boundaries.
- [ ] Add token tests validating org-scoped claims.
- [ ] Add migration/backfill tests with idempotency checks.
- [ ] Replace `otp_required` role tests with org `force_otp` policy tests.
- [ ] Add cross-org isolation tests (deny reads/writes across orgs).

Parallelization:
- Can begin scaffolding early.
- Full coverage depends on Tracks A through E completion.

### Track G: Operations, Docs, and Rollout

- [ ] Add runbook for feature flags and rollback.
- [ ] Add migration execution order and downtime expectations.
- [ ] Add monitoring dashboards and alert thresholds.
- [ ] Update API docs and changelog.
- [ ] Document deprecation plan for legacy groups path.
- [ ] Define production rollout stages and exit criteria per stage.
- [ ] Document migration policy: create new migration files only; never modify or delete existing applied migrations.

Parallelization:
- Can run in parallel with all tracks.
- Final rollout approval depends on Track F results.
