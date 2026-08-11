# Organizations and RBAC

## Product model

- An organization is the tenant boundary for user access.
- A user is global and may hold an active, invited, or suspended membership in multiple organizations.
- A role is an instance-defined template. A role assignment belongs to one organization membership.
- A permission is instance-defined and is granted through a role assigned to the active membership.
- Global groups are obsolete. Authorization and token issuance never use group membership.
- Organization checks use effective permissions, not reserved role names.

## Membership lifecycle

- Self-registration creates a personal organization, an active membership, and the configured default member and default creator roles in one registration transaction.
- A personal organization is named `<display name>'s Personal`, or `Personal Organization` when no display name is available. Its generated slug is readable and unique.
- An admin-created user is either assigned to existing organizations or receives a personal organization. A sign-in-capable user cannot be created without an active membership.
- Federation JIT and SCIM provisioning create or activate membership only in the enterprise connection's organization. They do not create personal organizations.
- `Default` has no reserved behavior. Existing organizations with that name or slug are ordinary organizations.
- Leaving, member removal, and organization deletion are rejected when they would leave a user without an active organization or remove the last member with organization-management authority.

## Roles and permissions

- Roles have `system`, `assignable`, `defaultMember`, and `defaultCreator` properties.
- At least one default member role and one default creator role must remain configured.
- System roles are protected from deletion. Instance admins control all role definitions and role-to-permission mappings.
- Organization managers may assign only roles marked `assignable`.
- Automatic membership creation may apply default roles even when those roles are not manually assignable.
- Organization managers cannot create or edit roles or permissions.
- Direct user permissions remain an instance-admin override. Organization-scoped authorization and claims otherwise resolve from the selected membership's roles.
- `darkauth.org:manage` grants organization management. It is evaluated as an effective permission and is not coupled to a role key.

## Organization context

- A session may record one active organization, but membership is revalidated when the context is used.
- With one active membership, DarkAuth selects it automatically.
- With multiple active memberships, DarkAuth uses a valid explicit or session organization. When a client requires selection and neither is available, the user selects an organization before authorization completes.
- Switching organization updates the session context and requires an active membership in the destination.
- Roles and permissions from different organizations are never merged.
- An organization-scoped authorization code, refresh token, access token, or ID token cannot be moved to another organization. Organization switching uses the dedicated token flow and revalidates membership.
- Organization-scoped ID tokens expose `org_id`, `org_slug`, `roles`, and deduplicated `permissions`.

## Organizationless clients

- Each client declares `requireOrganizationSelection`; the default is `true`.
- A client with `requireOrganizationSelection = false` may authorize a user without selecting an organization, including a user with multiple memberships.
- Organizationless tokens omit organization, roles, and organization-derived permissions. Instance-admin direct user permissions remain available; the token does not silently inherit the session organization.
- Organization-bound ZK key delivery requires an organization context. An organizationless client cannot receive an organization-scoped client app key.
- Clients that rely on tenant RBAC must require organization selection.

## User organization management

- The user portal lists active organizations and supports creation, switching, organization detail, member listing, invitations, assignable-role changes, leaving, and deletion.
- Any active member may view basic organization and membership data. Personal member details and management actions require `darkauth.org:manage`.
- Organization details expose the `forceOtp` policy. Instance admins configure it; when enabled, a session using that organization must complete OTP before normal access continues.
- Organization managers can configure the organization's OIDC federation and SCIM connections as described in `specs/features/enterprise-federation-and-scim.md`.
- Organization mutations are audited with the acting user and organization context.

## Instance administration

- Admins can list, create, edit, and delete organizations; manage any membership; and assign any role.
- Admin role and permission catalog changes are instance-wide and must account for existing memberships.
- Read admins may inspect ordinary administration data. Write admins are required for mutations; administration of the admin cohort itself is write-only.
- Organization list and member list endpoints use the shared paginated admin list contract.
