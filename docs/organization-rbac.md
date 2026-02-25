# Organization RBAC

Implementation reference:
- `packages/api/src/models/rbac.ts`
- `packages/api/src/models/rbacAdmin.ts`
- `packages/api/src/models/organizations.ts`
- `packages/api/src/controllers/user/organizations.ts`
- `packages/api/src/controllers/admin/organizations.ts`
- `packages/api/src/controllers/admin/organizationMemberRolesUpdate.ts`
- `packages/api/src/controllers/admin/roles.ts`
- `packages/api/src/controllers/admin/rolePermissionsUpdate.ts`
- `packages/api/src/controllers/user/token.ts`
- `packages/api/src/controllers/user/authorize.ts`
- `packages/api/src/controllers/user/authorizeFinalize.ts`
- `packages/api/src/controllers/user/opaqueLoginFinish.ts`

## Org-scoped RBAC model

- `organization` (`organizations`): tenant boundary.
- `membership` (`organization_members`): user-to-organization relationship with status.
- `role` (`organization_member_roles` -> `roles`): assigned to memberships.
- `permission` (`role_permissions`): resolved from assigned roles.
- Runtime authorization requires active membership (`status = "active"`).

## Organization context resolution

- Runtime authorization and token resolution operate on one org context.
- If `organization_id` is provided, it must map to an active membership.
- If `organization_id` is not provided:
  - `0` active memberships: `403` (`No active organization membership`).
  - `1` active membership: that organization is selected.
  - `>1` active memberships: `400` with code `ORG_CONTEXT_REQUIRED`.
- User flow behavior:
  - `GET /authorize`: optional `organization_id` may be stored in pending auth.
  - `POST /authorize/finalize`: optional `organization_id` may be stored on auth code.
  - `POST /opaque/login/finish`: org context is pre-populated only when user has exactly one active membership.
  - `POST /token` (`authorization_code`, `refresh_token`): resolves org context and updates session org fields when needed.

## User API endpoints (`/api/user`)

- `GET /organizations`
  - Lists active organizations for the current user.
- `POST /organizations`
  - Creates an organization.
  - Creates creator membership as active.
  - Assigns `org_admin` role if present.
- `GET /organizations/{organizationId}`
  - Returns organization only when caller has active membership.
- `GET /organizations/{organizationId}/members`
  - Requires active membership.
  - Includes member `email` and `name` only when caller has `darkauth.org:manage`.
- `POST /organizations/{organizationId}/invites`
  - Requires `darkauth.org:manage`.
- `POST /organizations/{organizationId}/members/{memberId}/roles`
  - Requires `darkauth.org:manage`.
  - Accepts `roleIds` or `roleId`.
  - Assignable roles are system roles only.
- `DELETE /organizations/{organizationId}/members/{memberId}/roles/{roleId}`
  - Requires `darkauth.org:manage`.

## Admin API endpoints (`/api/admin`)

Admin session requirements:
- Read/list/get endpoints require any `adminRole`.
- Mutating endpoints require `adminRole = "write"`.

Organizations:
- `GET /admin/organizations`
  - Query: `page`, `limit`, `search`.
- `POST /admin/organizations`
- `GET /admin/organizations/{organizationId}`
- `PUT /admin/organizations/{organizationId}`
- `DELETE /admin/organizations/{organizationId}`
- `GET /admin/organizations/{organizationId}/members`
- `PUT /admin/organizations/{organizationId}/members/{memberId}/roles`
  - Replaces the member role set with `roleIds`.
- `POST /admin/organizations/{organizationId}/members/{memberId}/roles`
  - Compatibility endpoint; adds roles for the member.
  - Accepts `roleIds` or `roleId`.
- `DELETE /admin/organizations/{organizationId}/members/{memberId}/roles/{roleId}`
  - Compatibility endpoint; removes one role from the member.

Roles and role-permission mapping:
- `GET /admin/roles`
- `POST /admin/roles`
- `GET /admin/roles/{roleId}`
- `PUT /admin/roles/{roleId}`
- `DELETE /admin/roles/{roleId}`
- `PUT /admin/roles/{roleId}/permissions`
  - Replaces role permission set with `permissionKeys`.

## Token claim behavior

When org context is resolved, user ID token claims include:
- `org_id`
- `org_slug`
- `roles`
- `permissions` (deduplicated from role mappings)

## Global groups status

- Global group-based authorization guidance is obsolete for org RBAC runtime authorization and token resolution.
- Org-scoped membership, roles, and permissions are the active model.
- Legacy user group edit in the admin UI has been removed.
