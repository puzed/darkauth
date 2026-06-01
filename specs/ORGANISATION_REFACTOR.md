# Organisation Refactor

## Summary

DarkAuth should move away from treating `Default` as a special catch-all organization for new users. Organizations are the first user-managed boundary in the product, so every regular user should always have at least one active organization, and every user-created organization should have an owner/admin role assignment chosen by instance configuration rather than hardcoded role keys.

The new model:

- Regular users must belong to at least one active organization.
- Self-registration creates a first personal organization automatically.
- Admin-created users can either be assigned to an existing organization or get a new personal organization.
- SCIM provisioning is organization-owned, not instance-global.
- `Default` can remain as an ordinary organization, but it has no special runtime behavior.
- Users can create, manage, leave, and delete organizations in the user UI when they have the right organization permissions.
- Users cannot create permissions or roles.
- Organization admins can assign only roles that instance admins have marked assignable.
- Role defaults are configuration, not hardcoded names like `member` or `org_admin`.

## Why

The current model leaks a migration convenience into product behavior. A shared `Default` organization is useful for bootstrapping old data, but it is a poor default tenant for a B2B/multi-tenant auth system. New users who register are not naturally members of one shared organization controlled by the instance owner. They are usually starting their own account, workspace, family, team, company, or project.

This aligns better with common B2B auth products:

- Clerk recommends membership-required organizations for most B2B/multi-tenant apps and supports automatic first organization creation, default member roles, and a creator role.
- Auth0 treats organization behavior as a core planning decision and asks whether users log in with an organization context and whether users can be shared across organizations.
- Kinde supports users in multiple organizations with different roles and permissions and allows default-org auto-assignment to be turned off.
- WorkOS/AuthKit models directory provisioning per organization, with SCIM-created users producing organization memberships.
- Frontegg presents SSO and SCIM as tenant/customer self-service configuration.

DarkAuth should therefore treat the organization as the tenant boundary, the session organization as the active account context, and role assignment as org-scoped.

References:

- Clerk organization configuration: https://clerk.com/docs/guides/organizations/configure
- Clerk create/manage organizations: https://clerk.com/docs/guides/organizations/create-and-manage
- Clerk Directory Sync: https://clerk.com/docs/guides/configure/auth-strategies/enterprise-connections/directory-sync
- Auth0 organization planning: https://dev.auth0.com/docs/manage-users/organizations/organizations-overview
- Auth0 inbound SCIM: https://auth0.com/docs/authenticate/protocols/scim/configure-inbound-scim
- WorkOS/AuthKit directory provisioning: https://workos.com/docs/authkit/directory-provisioning
- Frontegg SSO and SCIM: https://frontegg.com/product/sso-scim
- Kinde organizations: https://docs.kinde.com/build/organizations/orgs-for-developers/

## Current Problems

## Shared Default Organization

New self-registered users and admin-created users are currently placed into the organization with slug `default` when it exists. This makes unrelated users members of the same tenant and gives `Default` product semantics it should not have.

## Hardcoded Role Keys

The registration and organization creation paths look up role keys such as `member` and `org_admin`. This makes the product brittle because instance admins can rename, delete, or replace these roles.

## User UI Is Incomplete

The user UI can create organizations and switch between them, but it does not yet provide full organization management. Users need a first-party way to manage organization members, assign allowed roles, leave organizations, and delete organizations when permitted.

## SCIM Is Instance-Global

SCIM bearer tokens are currently managed as instance-level credentials. In a tenant model, SCIM is almost always configured for a customer organization or an enterprise connection tied to a customer organization. An instance-global SCIM credential makes it too easy for one external IdP integration to affect unrelated organizations.

## Federation Is Instance-Global

Federation connections are currently managed as instance-level OIDC providers with global domain routing. This is also the wrong ownership boundary for B2B. An enterprise SSO connection normally belongs to one customer organization. The organization owns its IdP configuration, domains, membership-on-authentication policy, and SCIM pre-provisioning policy.

## Product Rules

## Organizations

- Every regular user must have at least one active organization membership.
- `Default` is not special. It can exist, be renamed, deleted, or used like any other organization subject to ordinary safety rules.
- New installs should not create `Default` automatically as a special bootstrap tenant.
- Existing installs may keep their existing `Default` organization and memberships unchanged.
- Existing non-default organization memberships must be preserved unchanged.
- If an existing user is only in `Default`, leave that user in `Default`; migration should not create per-user organizations for them automatically.
- Organization slugs are unique and generated from a readable random word pattern when the user does not provide a slug.
- Organization names created during signup should be human-readable.

## Personal Organization Creation

When a user self-registers:

- Create a new organization in the same transaction as the user and OPAQUE record.
- Name it `{Name}'s Personal` when a usable display name exists.
- Fall back to `Personal Organization` when there is no usable display name.
- Generate a unique slug like `green-star-bubble-yhgw84`.
- Create an active membership for the new user.
- Assign the configured default member role or roles.
- Assign the configured organization creator role or roles.
- Store the new organization as the current session organization.

When an admin creates a user:

- The admin must choose one of two modes.
- Mode 1: assign the user to one or more existing organizations.
- Mode 2: create a new personal organization using the same naming and slug rules as self-registration.
- The UI should prefer explicit organization assignment because admin-created users are often invited into an existing tenant.
- The API must reject creating a regular user with zero active organization memberships unless the user is created in a suspended or pre-invite state that cannot sign in.

When a SCIM integration creates a user:

- Do not create a personal organization automatically.
- The SCIM connection is already bound to an organization, so provisioning creates or updates membership in that organization.
- If the SCIM connection cannot resolve an organization, reject the operation with a configuration error.

## Default Organization Context

DarkAuth already has session organization selection behavior. Keep and strengthen it:

- If the user has one active organization, select it automatically.
- If the user has multiple active organizations, use the session organization when still active.
- If the session organization is missing and multiple active organizations remain, show the organization picker.
- Never mint org-scoped tokens without a resolved active organization.
- Never merge roles or permissions across organizations.
- Users can set their active/default organization in the user UI.

## Roles

Roles remain instance-level templates assigned to organization memberships.

Add role-level configuration:

- `system`: role is instance-managed and protected from ordinary deletion.
- `assignable`: organization admins may assign this role to members through the user UI and user API.
- `default_member`: role is automatically assigned to users who join an organization as normal members.
- `default_creator`: role is automatically assigned to users who create an organization or receive a new personal organization.

Rules:

- There must always be at least one `default_member` role.
- There must always be at least one `default_creator` role.
- A role marked `default_member` or `default_creator` cannot be deleted until another role carries the same default flag.
- A role marked `default_member` or `default_creator` can be system or custom.
- A system role is managed by instance admins. Organization admins cannot edit role definitions.
- An organization admin can assign only roles with `assignable = true`.
- Automatic assignment may use default roles even if they are not manually assignable.
- Instance admins can assign any role from the admin portal.
- User-created organizations receive both default member roles and default creator roles for the creator.

This mirrors a common split in auth products: platform-managed roles can exist for safe defaults, while customer-facing role assignment is limited to roles explicitly exposed to organization admins. The exact field names are DarkAuth-specific, but the distinction is standard: instance admins define the role catalog, and tenant/org admins assign the subset they are allowed to use.

This replaces hardcoded role key assumptions. The default seed should still create useful roles such as `member` and `org_admin`, but behavior must depend on flags, not names.

## Permissions

Permissions remain instance-level and admin-controlled.

Rules:

- Regular users cannot create, edit, or delete permissions.
- Organization admins cannot create, edit, or delete permissions.
- Permissions are granted to users only through role assignments in the selected organization context.
- Token claims include only the roles and permissions for the selected organization.

## User Organization Management

The user UI should gain organization management for users with appropriate organization permissions.

Capabilities:

- Create an organization.
- View organizations the user belongs to.
- Switch active/default organization.
- View members of an organization when permitted.
- Invite or add members when permitted.
- Assign and remove assignable roles when permitted.
- Leave an organization.
- Delete an organization when permitted.

Safety rules:

- A user cannot leave an organization if it is their only active organization.
- A user cannot remove themselves if doing so would leave the organization without a member who has organization-management authority.
- A user cannot remove the last active member with a creator/admin-manage role from an organization.
- A user cannot delete an organization unless they have organization-management authority and deletion is explicitly allowed by the API.
- Organization deletion must require confirmation and should be audited.
- If deleting an organization would leave any member with no active organizations, the API must reject deletion unless those users are also being moved or suspended by an instance admin workflow.

Organization-management authority means effective permissions in that organization include the DarkAuth organization management permission, currently `darkauth.org:manage`. Checks must use effective permissions, not a hardcoded role key.

## Organization-Owned Enterprise Connections

SCIM and Federation should be treated as organization-owned enterprise connections.

Provider convention:

- Auth0 creates enterprise connections at tenant level but enables them per organization. Organization connection configuration includes membership-on-authentication behavior.
- WorkOS describes an organization as the entity whose users sign in with SSO or sync with Directory Sync. Its Admin Portal lets customer IT contacts configure Domain Verification, SSO, and Directory Sync for that organization.
- Clerk enterprise connections and Directory Sync are tied to organization membership and role mapping.
- Frontegg exposes SSO and SCIM through tenant/customer self-service.

DarkAuth should use the same mental model:

- Instance admins define platform-wide safety defaults and can see every integration.
- Organization admins manage enterprise connections for organizations they control.
- Enterprise SSO connections belong to one organization.
- SCIM provisioning connections belong to one organization.
- Domain routing is scoped to organization-owned, verified domains.
- A user can create an organization, then attach that organization to their existing IdP without asking the instance admin, when they have the required organization permission.

This is intentionally "organization-owned" rather than "account-level". In DarkAuth the organization is the tenant/account boundary. A UI may use the word account if that is clearer for end users, but the data model and authorization checks should use organization ownership.

SSO and SCIM should be grouped in the product as Enterprise Connections:

- An Enterprise Connections area for organization admins.
- Federation as the SSO connection type.
- SCIM as the directory provisioning connection type.
- Shared organization domain verification.
- Shared audit, setup, status, and health surfaces.
- Separate connection detail screens where the protocol-specific fields live.
- Separate backend models and lifecycles for SSO and SCIM. They should feel grouped in the product, but the implementation must not merge OIDC login state with directory provisioning state.

This implies two UI layers:

- Admin portal:
  - global Federation overview
  - global SCIM overview
  - organization detail tabs for Members, Roles, Enterprise Connections, Security, Audit
  - full override and recovery tools for instance admins
- User UI:
  - organization detail pages for organization admins
  - Members tab
  - Roles tab limited to assignable roles
  - Enterprise Connections tab or area
  - SSO setup under Enterprise Connections
  - SCIM setup under Enterprise Connections
  - Security tab for org policies such as Force OTP

## Federation Refactor

Federation should move from global email-domain routing to organization-owned enterprise SSO.

Current implementation:

- `federation_connections` has no `organization_id`.
- Domains are stored directly on the connection.
- `/federation/route?email=...` searches all enabled connections and returns the first matching domain.
- `/federation/start` accepts `connection_id` or email.
- OIDC callback resolves or creates a local user, then creates a generic user session.
- If a federated login creates a new user, it currently goes through generic user creation, which may also apply default organization behavior.

Target model:

- A federation connection belongs to exactly one organization.
- A federation connection may have one or more domains.
- Domains must be verified before they can be used for automatic email-domain routing.
- Domain routing by email should return a connection only when exactly one enabled, verified organization connection matches.
- If legacy data or an operational fault leaves multiple enabled verified connections for the same domain, DarkAuth should refuse automatic routing and require instance-admin repair.
- Explicit `organization_id` during login should restrict federation routing to that organization.
- Explicit `connection_id` should be accepted only when the connection is enabled and the selected organization is valid.
- Federation-created users are global users, but their membership is created or validated in the connection's organization.
- Federation JIT provisioning must not create a personal organization.
- If JIT provisioning is enabled, successful login may create the user and active membership in the connection organization.
- If SCIM pre-provisioning is required, successful login must require an existing active membership created by SCIM or admin action.
- If membership-on-authentication is enabled, successful login may add membership to the connection organization.
- If membership-on-authentication is disabled, successful login requires existing active membership.
- Account linking should remain per connection plus external subject. Because the connection is organization-scoped, this naturally scopes linked identity to the organization integration.
- A user may have federation identities for multiple organization connections.
- Token issuance remains selected-organization scoped.

Federation policy should move out of opaque metadata into explicit fields where possible:

- `jit_provisioning`
- `membership_on_authentication`
- `require_scim_pre_provisioning`
- `account_linking_policy`
- `require_password_for_zk`
- `allow_passkey_prf`
- `allow_trusted_device_approval`
- `allow_non_zk_key_setup_bypass`

Domain verification:

- Organization admins may add domains to an organization integration.
- Each domain starts unverified.
- Verification should use DNS TXT in the first implementation.
- The UI must show the exact TXT record name and value required for verification.
- The UI must explain that routing will not activate until verification succeeds.
- Pending domain claims do not reserve the domain.
- Another organization may claim and verify the same domain while an earlier claim remains pending.
- Verification must fail if another enabled organization connection already has that domain verified.
- The database should enforce at most one enabled verified owner for a domain, while allowing multiple pending claims.
- Domain verification should be re-checkable and auditable.
- Email domain routing uses only verified domains.
- Domains are a routing control, not the only security control. The callback must still validate issuer, nonce, signature, audience, email verification policy, and organization policy.

Federation UX:

- Admin portal global Federation page lists all connections with organization name, slug, domains, status, and last login.
- Admin organization detail Enterprise Connections area manages SSO connections for that organization.
- User organization Enterprise Connections area lets organization admins configure an OIDC connection, discovery URL, client credentials, domains, claim mapping, and policy.
- User setup flow should show IdP callback URLs, domain verification instructions, current verification status, and a retry verification action.
- SAML can remain out of scope unless separately implemented; the refactor should leave a protocol field so SAML can fit later.

## SCIM Refactor

SCIM should move from instance-global token management to organization-scoped provisioning connections.

Provider convention:

- Clerk configures Directory Sync per enterprise connection, and role mapping requires that the enterprise connection is linked to an organization.
- Clerk deactivates a directory-synced user and revokes active sessions when the IdP removes or deactivates the user.
- WorkOS/AuthKit requires a directory provisioning integration for every organization that wants to source users and memberships through directory provisioning.
- WorkOS/AuthKit treats users with verified organization domains as directory-managed, but deprovisioning deactivates the organization membership and revokes sessions rather than automatically deleting the global user.
- Auth0 inbound SCIM is connection-specific; its organization APIs include provisioning configuration and SCIM token surfaces, and SCIM-provisioned users join organizations through connection auto-membership.
- Auth0 supports both deactivation through the SCIM `active` attribute and user deletion when the SCIM token has a delete scope.
- Frontegg presents SSO and SCIM as tenant self-service configuration.

DarkAuth target model:

- Add `scim_connections` and treat bearer tokens as credentials for a SCIM connection.
- A SCIM connection belongs to exactly one organization.
- A SCIM bearer token belongs to exactly one SCIM connection and therefore one organization.
- SCIM endpoints resolve organization context from the bearer token, not from request payload.
- SCIM-created users are global users with organization memberships in the connection's organization.
- SCIM deactivation suspends or removes membership in that organization and revokes sessions for that organization context by default.
- SCIM must not remove a user from unrelated organizations.
- SCIM group-to-role mappings are configured per organization connection.
- Group mappings can assign only existing roles selected by instance admins or organization admins with a future permission.
- If role mapping is disabled, SCIM-created members receive the configured default member role or roles for that organization.
- SCIM tokens should be created from the organization detail screen in the admin UI and from the user UI for organization admins with a dedicated permission.
- The existing global SCIM Tokens page can remain as an instance-admin overview of all SCIM connections, but creation should require choosing an organization.

Current implementation changes needed:

- `scim_bearer_tokens` has no `organization_id` or `connection_id`.
- `scim_users` stores SCIM provisioning state globally by `user_sub`.
- `scim_groups` stores groups globally.
- `scim_group_members` stores group membership globally.
- SCIM group mapping is currently driven by global settings.
- SCIM deactivation currently revokes global sessions and can delete the whole user.

Target SCIM resource model:

- Local `users` remain global identities.
- SCIM provisioning state is scoped by connection.
- SCIM `Users` are identified by connection-specific external IDs and user names.
- SCIM `Groups` are identified by connection-specific external IDs and display names.
- SCIM group memberships are scoped to the connection.
- A local user can be managed by multiple SCIM connections through separate provisioning records.
- Deprovisioning from one SCIM connection must not delete the global user or affect unrelated organizations.
- Deprovisioning should suspend or remove the organization membership created by that connection by default.
- Sessions, pending auth, and auth codes should be revoked when they are bound to the affected organization. If session state is not granular enough yet, conservative full user session revocation is acceptable during the transition, but the target behavior is organization-specific revocation.

SCIM deprovisioning policy:

- Default action: `suspend_membership`.
- Supported actions should include `suspend_membership`, `remove_membership`, and `delete_user`.
- `delete_user` is a destructive organization/domain policy and must be opt-in.
- `delete_user` is allowed only when the user's primary email domain is verified by the organization and the user was provisioned through that organization's SCIM connection.
- `delete_user` must not delete a global user who has active memberships in unrelated organizations unless a future explicit instance-admin override handles the migration or suspension of those memberships.
- If `delete_user` is configured but safety checks fail, the operation should fall back to `suspend_membership` or fail closed according to a connection-level setting.
- The UI must explain the difference between deactivating the member in this organization and deleting the root DarkAuth user account.
- Root user deletion should require a clear confirmation in admin-owned surfaces and should be auditable.
- Deleting the root user must revoke sessions, credentials, refresh tokens, pending auth, and linked identities according to the existing user deletion semantics.
- Directory deletion is not the same as user deprovisioning. Removing a SCIM connection should not automatically deactivate every member, because customers may be switching directory providers.

Security rules:

- A SCIM token must never be able to provision into multiple organizations.
- SCIM token list responses show only token prefixes, status, organization, created time, last used time, and expiry.
- SCIM bearer token values are shown exactly once.
- SCIM provisioning, deprovisioning, group mapping changes, and token lifecycle events must be audited with organization context.
- SCIM group sync may mutate only memberships and role assignments owned by that SCIM connection or mapping.
- SCIM group sync must not suspend arbitrary organization members or remove roles assigned manually by admins or by another SCIM connection.

## Data Model

Add or update fields:

- `roles.assignable boolean not null default false`
- `roles.default_member boolean not null default false`
- `roles.default_creator boolean not null default false`
- `federation_connections.organization_id uuid not null references organizations(id)`
- `federation_connections.protocol text not null default 'oidc'`
- `federation_connections.jit_provisioning boolean not null default true`
- `federation_connections.membership_on_authentication boolean not null default true`
- `federation_connections.require_scim_pre_provisioning boolean not null default false`
- `federation_connection_domains.id uuid primary key`
- `federation_connection_domains.connection_id uuid not null references federation_connections(id)`
- `federation_connection_domains.organization_id uuid not null references organizations(id)`
- `federation_connection_domains.domain text not null`
- `federation_connection_domains.verification_status text not null default 'pending'`
- `federation_connection_domains.verification_token_hash text`
- `federation_connection_domains.verified_at timestamp`
- `federation_connection_domains.last_checked_at timestamp`
- `federation_connection_domains.enabled boolean not null default true`
- `scim_connections.id uuid primary key`
- `scim_connections.organization_id uuid not null references organizations(id)`
- `scim_connections.name text not null`
- `scim_connections.enabled boolean not null default true`
- `scim_connections.deprovision_action text not null default 'suspend_membership'`
- `scim_connections.delete_user_safety text not null default 'fail_closed'`
- `scim_bearer_tokens.connection_id uuid not null references scim_connections(id)`
- `scim_bearer_tokens.organization_id uuid not null references organizations(id)`
- `scim_bearer_tokens.scopes text[]`
- `scim_connection_users.id uuid primary key`
- `scim_connection_users.connection_id uuid not null references scim_connections(id)`
- `scim_connection_users.organization_id uuid not null references organizations(id)`
- `scim_connection_users.user_sub text not null references users(sub)`
- `scim_connection_users.external_id text`
- `scim_connection_users.user_name text not null`
- `scim_connection_users.primary_email text`
- `scim_connection_users.domain_managed boolean not null default false`
- `scim_connection_users.active boolean not null default true`
- `scim_connection_groups.id uuid primary key`
- `scim_connection_groups.connection_id uuid not null references scim_connections(id)`
- `scim_connection_groups.organization_id uuid not null references organizations(id)`
- `scim_connection_groups.external_id text`
- `scim_connection_groups.display_name text not null`
- `scim_connection_group_members.group_id uuid not null references scim_connection_groups(id)`
- `scim_connection_group_members.connection_user_id uuid not null references scim_connection_users(id)`
- `scim_group_role_mappings` normalized table:
  - `id uuid primary key`
  - `connection_id uuid not null`
  - `organization_id uuid not null`
  - `scim_group_id text`
  - `scim_external_id text`
  - `scim_display_name text`
  - `role_id uuid not null`
  - `precedence integer not null default 0`
- `audit_logs.organization_id uuid references organizations(id)`
- `audit_logs.enterprise_connection_id uuid`
- `audit_logs.enterprise_connection_type text`
- Optional `users.last_selected_organization_id uuid references organizations(id)` if selected organization should survive all sessions.

Keep:

- `organizations.created_by_user_sub`
- `organization_members`
- `organization_member_roles`
- `role_permissions`
- `sessions.data.organizationId`
- `sessions.data.organizationSlug`

Remove or stop using:

- Runtime assumptions that `organizations.slug = 'default'` exists.
- Runtime assumptions that role key `member` exists.
- Runtime assumptions that role key `org_admin` exists.
- Instance-global SCIM token behavior.
- Instance-global federation connection behavior.
- Global unverified email-domain routing.

Indexes and constraints:

- Federation domains should allow duplicate pending claims.
- Federation domains should prevent more than one enabled verified owner for the same normalized domain.
- SCIM connection users should be unique by `(connection_id, external_id)` when `external_id` is present.
- SCIM connection users should be unique by `(connection_id, user_name)`.
- SCIM connection groups should be unique by `(connection_id, external_id)` when `external_id` is present.
- SCIM connection groups should be unique by `(connection_id, display_name)`.

## Migration Strategy

This project is still pre-launch enough to favor a clean behavioral cutover, but existing data should not be scrambled.

Migration rules:

- Do not delete existing organizations.
- Do not delete the existing `Default` organization.
- Do not move users out of `Default`.
- Do not create personal organizations for existing users automatically.
- Add role flags.
- Mark the existing `member` role as `default_member` if present.
- Mark the existing `org_admin` role as `default_creator` if present.
- If either role is missing, create an equivalent system role with the correct default flag.
- Ensure at least one role has `default_member = true`.
- Ensure at least one role has `default_creator = true`.
- Mark reasonable default roles as `assignable = true`.
- Backfill existing SCIM tokens only if a safe organization can be chosen. Otherwise mark them disabled and require admin reconfiguration.
- Backfill existing federation connections only if a safe organization can be chosen. Otherwise disable them and require admin reconfiguration.
- Existing federation domains should start unverified unless verification evidence exists.

Fresh install rules:

- Seed base permissions.
- Seed `member` as `default_member = true`.
- Seed `org_admin` as `default_creator = true`.
- Seed both roles as `assignable = true` unless there is a strong reason to hide them from organization admins.
- Do not seed a special `Default` organization.
- The bootstrap admin remains an admin user, not a regular user organization owner.

## API Changes

Admin API:

- Role create/update supports `assignable`, `default_member`, and `default_creator`.
- Role delete rejects deletion if it would remove the last default member or creator role.
- User create accepts either existing organization memberships or `createPersonalOrganization`.
- Organization member role assignment can assign any role for instance admins.
- Organization detail includes federation connection CRUD for that organization.
- Organization detail includes SCIM connection and token CRUD for that organization.
- Global federation list includes organization name and slug.
- Global SCIM token list includes organization name and slug.
- SCIM token create requires `organizationId` or a parent organization route.
- Federation connection create requires `organizationId` or a parent organization route.

User API:

- Organization create assigns default member and default creator roles.
- Organization member role assignment allows only `assignable = true` roles.
- Add organization member invite/add endpoints if missing or incomplete.
- Add organization leave endpoint.
- Add organization delete endpoint for permitted organization admins.
- Add endpoint to list assignable roles for an organization.
- Add organization federation connection endpoints for permitted organization admins.
- Add organization SCIM connection and token endpoints for permitted organization admins.
- Session organization update remains and continues validating active membership.

Federation API:

- Email route lookup considers only enabled, verified, organization-scoped connections.
- Start endpoint supports explicit `organization_id`.
- Callback creates or validates membership in the connection organization according to policy.
- JIT-created federated users do not receive a personal organization.

SCIM API:

- Bearer token authentication resolves a single SCIM connection and organization.
- User create/update/deactivate applies only within token connection and organization context.
- Group create/update/delete applies only within token connection and organization context.
- Group-to-role mapping is per organization.

## UI Changes

Admin UI:

- Role create/edit includes toggles for:
  - System role
  - Assignable by organization admins
  - Default member role
  - Default organization creator role
- Role delete displays a clear error when a role is protected by default flags.
- User create includes organization assignment:
  - Assign to existing organization.
  - Create personal organization.
- Organization detail gains tabs:
  - Details
  - Members
  - Roles
  - Enterprise Connections
  - Security
  - Audit
- Organization detail Enterprise Connections area groups SSO and SCIM for that organization.
- SSO connection detail manages federation settings for that organization.
- SCIM connection detail manages provisioning settings and bearer tokens for that organization.
- Federation page becomes a global SSO overview and requires organization selection when creating connections.
- SCIM Tokens page becomes a global provisioning overview and requires organization selection when creating tokens.

User UI:

- Profile or Organizations area lists all active organizations.
- Organization detail page shows members and roles.
- Organization admins can add/invite users.
- Organization admins can assign roles marked `assignable`.
- Organization admins can open Enterprise Connections for their organization.
- Organization admins can configure SSO for their organization.
- Organization admins can configure SCIM for their organization.
- Organization admins can copy setup values, callback URLs, ACS URLs when SAML exists, SCIM base URL, and one-time SCIM bearer tokens.
- Organization admins can see DNS TXT verification instructions and retry domain verification.
- Users can leave an organization when safety rules allow.
- Organization admins can delete an organization when safety rules allow.
- Organization creation uses `{Name}'s Personal` style naming for signup and explicit user-entered names for manual creation.

## Slug Generation

Generated personal organization slugs should be readable and unique.

Pattern:

`{adjective}-{noun}-{object}-{suffix}`

Examples:

- `green-star-bubble-yhgw84`
- `quiet-river-maple-kx72qd`
- `silver-cloud-lantern-pm4z9a`

Rules:

- Use lowercase ASCII.
- Use hyphen separators.
- Use a short random suffix.
- Retry on collision.
- Keep generated slugs separate from display names.
- Users may rename organizations and slugs later if the UI supports it.

## Security Requirements

- Never mint an org-scoped token without an active organization.
- Never grant permissions from non-selected organizations.
- Never let user APIs assign non-assignable roles.
- Never let users create or modify roles or permissions.
- Never let a user leave their last active organization.
- Never let an organization lose its last organization-management-capable member through user-side actions.
- Never let SCIM tokens affect more than one organization.
- Never let federation connections authenticate a user into the wrong organization.
- Never route by unverified domains.
- Never treat domain matching as sufficient authorization; membership and connection policy are still required.
- Never let SCIM group sync alter memberships or role grants that were not created by that SCIM connection.
- Never let federation or SCIM JIT create a root user without also creating or validating the intended organization membership in the same flow.
- Never rely on `roles.system` to decide whether an organization admin can assign a role.
- Never accept a federation callback whose state is not bound to the intended connection, organization, and client context.
- Audit all organization creation, deletion, membership changes, role changes, SCIM token lifecycle events, and SCIM provisioning changes.
- Audit all federation connection changes, domain verification changes, federation login starts, callbacks, account links, and membership-on-authentication events with organization context.
- Avoid organization existence leaks for unauthorized callers.

## Mandatory Fixes From Codebase Verification

These are not optional follow-up notes. They are required fixes in the organization refactor because they are current correctness, isolation, or security risks.

## Fix Root User Creation Coupling

Current generic user creation also performs organization placement. Admin creation, SCIM provisioning, and federation JIT all depend on this behavior today.

Required outcome:

- Root user creation is separated from organization provisioning.
- Self-registration creates a personal organization and selected session organization.
- Admin user creation must choose existing organization memberships or personal organization creation.
- Federation JIT must create or validate membership in the federation connection's organization.
- SCIM provisioning must create or update membership in the SCIM connection's organization.
- No path can create an interactive regular user with zero active organizations unless that user is explicitly suspended or pre-invite and cannot sign in.

## Fix SCIM Ownership Boundaries

Current SCIM group sync can remove roles or suspend members across an entire mapped organization, including manually managed members.

Required outcome:

- SCIM connections track which memberships they created or manage.
- SCIM group mappings track which role grants they created or manage.
- SCIM group sync can remove or suspend only SCIM-owned memberships and SCIM-owned role grants.
- Manual admin assignments and assignments from other SCIM connections are preserved.
- SCIM deprovisioning defaults to membership suspension/removal in the connection organization.
- Root user deletion is allowed only through explicit verified-domain policy and safety checks.

## Fix Federation Routing And State Binding

Current federation domain routing is global, unverified, first-match routing. OIDC state does not bind organization or client context.

Required outcome:

- Federation connections belong to exactly one organization.
- Email-domain routing uses only enabled, verified domains.
- Pending domain claims do not reserve a domain.
- Verified domain uniqueness is enforced for enabled connections.
- Federation start state binds connection, organization, client, nonce, PKCE verifier, and return URL.
- Federation callback rejects mismatched connection, organization, or client context.
- Domain matching remains routing only; callback still requires valid membership and connection policy.

## Fix Role Assignability

Current user-side assignability is overloaded onto `roles.system`.

Required outcome:

- `system` means instance-managed/protected.
- `assignable` means organization admins may assign the role.
- User-side role catalogs and assignment endpoints use `assignable`.
- Instance admins can still assign any role.
- Default role protection uses `default_member` and `default_creator`, not `system`.

## Fix Org Safety Guards

Current admin and user organization mutation paths do not fully enforce last-organization and last-manager safety.

Required outcome:

- User-side flows cannot leave a user with zero active organizations.
- User-side flows cannot leave an organization without a management-capable active member.
- Admin flows either enforce the same safety checks or require an explicit recovery/override path with audit logging.
- Organization deletion rejects when it would orphan regular users unless an admin workflow moves or suspends them.

## Fix Enforced Federation Policy

Current federation policy-like UI settings are stored in metadata and are not enforced by runtime.

Required outcome:

- Enforced federation policy moves to explicit model fields or a clearly validated policy object read by runtime.
- `account_linking_policy`, `jit_provisioning`, `membership_on_authentication`, and `require_scim_pre_provisioning` are separate runtime decisions.
- Existing metadata-only policy controls are removed, migrated, or clearly treated as display-only until runtime support exists.

## Acceptance Criteria

- Fresh install does not create a special `Default` organization.
- Existing `Default` organizations remain ordinary organizations after migration.
- Self-registration creates a personal organization and selects it for the session.
- Admin user creation requires organization assignment or personal organization creation.
- SCIM tokens are tied to one organization.
- Federation connections are tied to one organization.
- Federation domain routing uses only verified organization domains.
- Pending domain claims do not block another organization from verifying the domain.
- A verified domain cannot be active for two enabled organization connections at the same time.
- Federated JIT users are added to the connection organization, not a new personal organization.
- Federation callback state is bound to the selected organization and connection.
- User-created organizations grant both default member and default creator roles to the creator.
- Organization admins can assign only assignable roles.
- Instance admins can assign any role.
- Users cannot leave their only active organization.
- Organizations cannot lose their last management-capable member through user UI actions.
- SCIM deprovisioning defaults to organization membership suspension/removal, not global user deletion.
- SCIM root user deletion is possible only through explicit verified-domain policy and safety checks.
- SCIM group sync cannot modify manually assigned memberships or roles.
- Federation start and callback are bound to connection, organization, and client context.
- Federation and SCIM JIT cannot create sign-in-capable users without active organization membership.
- `roles.system` is no longer used as the organization-admin assignability gate.
- Enforced federation policies are read by backend runtime, not only stored in UI metadata.
- Token claims remain scoped to the selected organization.
- Existing non-default memberships remain unchanged.
- `npm run tidy` and `npm run build` pass after implementation.

## Codebase Verification Notes

These notes come from a read-only codebase pass over API models/controllers, admin UI, user UI, SCIM, and federation. They are here so implementation agents do not have to rediscover the same coupling.

## Existing Default And Role Coupling

- Self-registration currently creates the root user, then joins `organizations.slug = 'default'`, assigns `roles.key = 'member'`, and creates a session without organization context in `packages/api/src/models/registration.ts`.
- Admin-created users use `createUser` in `packages/api/src/models/users.ts`, which has the same implicit `default` and `member` behavior.
- Federation JIT and SCIM provisioning both call generic user creation paths, so they inherit the same default-org behavior.
- User-created organizations currently assign only the hardcoded `org_admin` role in `packages/api/src/models/organizations.ts`.
- Install/bootstrap and earlier RBAC migrations create `Default`, backfill all users into it, and assign `member`.
- Implementation should split root user creation from organization provisioning. Registration, admin creation, federation JIT, and SCIM provisioning need separate provisioning modes rather than one shared `createUser` side effect.
- Removing special `Default` before federation and SCIM provisioning are org-scoped can create root users with no active memberships. Do this as an ordered refactor, not a one-file removal.

## Current Role Semantics

- The `roles` table currently has `system` only.
- User-side assignability currently means `roles.system = true`.
- The refactor must make `system` and `assignable` independent. `system` means instance-managed/protected. `assignable` means organization admins may grant it.
- Role deletion currently protects system roles only. Default role flags need their own delete/update protection.
- Admin member role assignment can continue to see all roles, but user-side role catalogs must list only assignable roles.

## Existing Organization APIs

- User API already has organization list, create, detail, member list, invite, and role add/remove endpoints.
- User API does not yet have leave organization, remove member, delete organization, assignable role catalog, or Enterprise Connections endpoints.
- Existing user-side role assignment has no last-manager guard and no assignable flag.
- Admin member add creates an organization membership with no roles unless roles are assigned after creation. Decide during implementation whether admin add-member should auto-assign default member roles or stay explicit.
- Admin organization and member deletion currently have no last-active-organization or last-management-capable-member guard.

## Session And Token Context

- Organization selection logic already handles explicit org, one-org fallback, multiple-org ambiguity, stale session org, and zero active org.
- Refresh-token exchange can still fail with `ORG_CONTEXT_REQUIRED` when a multi-org user has no usable session organization. The new registration and login paths should set the selected organization as early as possible.
- Sessions store organization context in `sessions.data.organizationId` and `sessions.data.organizationSlug`.
- `auth_codes.organization_id` and `pending_auth.organization_id` already exist, so org-scoped SCIM deprovisioning can target those records before falling back to full user revocation.
- Immediate post-login user UI state should include selected organization from login responses or a `/session` refresh, otherwise the first navigation can show stale or missing organization context.

## Federation Implementation Notes

- `federation_connections` is global today: no `organization_id`, and domains are stored directly in a text array.
- Domain routing scans all enabled connections and returns the first domain match. There is no verification, uniqueness, ambiguity handling, or org context.
- OIDC state is bound to connection, nonce, PKCE verifier, and return URL, but not organization or client context.
- Login UI sends `client_id` for federation start, but current federation start handling does not bind it into state.
- Callback auto-selects organization only when the user has exactly one active membership. Multiple memberships leave session org unset; zero memberships reject login.
- Federation JIT currently uses generic `createUser`; without `Default`, it can create a linked but unusable user.
- `account_linking_policy = email_verified` currently means both link existing users and create new users. Split account linking from `jit_provisioning` and `membership_on_authentication`.
- Existing policy-like federation fields live in admin UI metadata and are not enforced by backend runtime. Move enforced policy into columns or clearly treat metadata as display-only during transition.
- The existing enum value `email` for account linking is present in schema but rejected by model/controller validation. Migration should either remove it or deliberately define compatibility behavior.

## SCIM Implementation Notes

- SCIM bearer tokens are global today and identify only the token, not an organization or connection.
- `scim_users`, `scim_groups`, and `scim_group_members` are global and have global uniqueness constraints.
- SCIM user creation currently calls generic local user creation, so users can be added to `Default` before any SCIM group mapping runs.
- SCIM deprovisioning currently marks a global `scim_users` row inactive, deletes all sessions, auth codes, and pending auth for the user, and can delete the root user through global setting `users.scim.deprovision_action`.
- SCIM sign-in/key policy is global per user. It cannot distinguish active in one organization from deprovisioned in another.
- SCIM role mapping is stored in global settings and uses role keys. It must move to organization/connection-owned rows using role IDs.
- Current SCIM group sync can remove mapped roles and suspend members across an entire mapped organization, including admin-created or otherwise unrelated members. The refactor must track membership and role-grant provenance so SCIM only changes what the connection owns.
- Existing `users.scim.*` settings need connection-scoped replacements or explicit migration behavior: sign-in policy, key unlock policy, deprovision action, unknown group policy, and mappings.
- Existing global SCIM users should be attached to one backfilled connection only when safe. Ambiguous rows should be disabled from SCIM management until admin reconfiguration.

## UI Implementation Notes

- Admin organization detail is already a single page with Details, Security, Members, and role editing. Tabs can be added inside the existing `/organizations/:organizationId` route.
- Keep global admin Federation and SCIM pages as instance-admin overviews. Add org-scoped admin routes under organization detail for Enterprise Connections.
- Admin user creation currently sends only email, name, and sub. Replace that implicit default behavior with a required union: existing organization memberships or personal organization creation.
- User UI already supports organization list/create/switch in Profile, has a standalone `/switch-org` flow, and has authorize-time organization selection. Preserve those flows while adding a dedicated organization detail surface.
- User UI API client currently wraps only org list/create/session-switch. It needs wrappers for existing org detail/member/invite/role endpoints, then new wrappers for leave, remove member, delete, assignable roles, SSO, and SCIM.
- Keep account-level Security as connected identities and sign-in status. Put SSO and SCIM configuration under organization Enterprise Connections for users with `darkauth.org:manage` or a future narrower permission.

## Test Notes

- Registration tests currently do not assert personal organization creation, default role assignment, or session organization.
- Existing org-selection tests are useful and should be preserved.
- Some tests use a `Default` organization or `default` slug as fixtures. Those should become ordinary fixtures, not special behavior.
- Add tests for the ordered migration hazards: federation JIT without `Default`, SCIM provisioning without `Default`, and multi-org refresh-token behavior with missing/stale session org.

## Implementation Handoff Status

The first implementation pass landed a large part of the refactor across API, admin UI, and user UI. A second top-level integration pass (2026-06-01) resolved the remaining backend blockers and completed full-repo tidy and build. The backend behavioral cutover is now complete and verified; the main remaining work is the org-scoped enterprise-connection self-service UI and real DNS TXT domain verification.

Resolved in the 2026-06-01 integration pass:

- Removed special `Default` creation/backfill. `ensureDefaultOrganizationAndSchema` was renamed `ensureOrganizationSchema` in `packages/api/src/models/install.ts`; it keeps the idempotent schema bootstrap but no longer inserts a `default` organization, backfills users into it, or backfills the `member` role onto its members. Existing `Default` rows from migrations/old installs are left untouched.
- Fixed the API typecheck failure in `packages/api/src/models/registration.ts` by returning the created organization from the registration transaction instead of mutating a closure-captured variable. `npm run typecheck` passes across all workspaces.
- Added enterprise connection audit context: `audit_logs.enterprise_connection_id` and `audit_logs.enterprise_connection_type` columns (migration `0037_audit_enterprise_connection`), wired through `AuditEvent`/`AuditFilters`/`logAuditEvent`, populated in SCIM resource/token events (type `scim`) and federation connection CRUD events (type `federation`, via a new `extractAuditContext` hook in `withAudit`).
- Updated `specs/RBAC.md`, confirmed `specs/ORG_SELECTION.md` needed no changes, added a superseded banner to `specs/8_DEFAULT_USER_GROUP.md`, and neutralized the `2_CORE.md` example slug.
- Ran focused API/model tests (registration, users, organizations, RBAC, SCIM, federation — all passing), then full-repo `npm run tidy` and `npm run build` (both green).

Completed in the 2026-06-01 parallel pass (three package-scoped agents: api / admin-ui / user-ui):

- Real DNS TXT domain verification: `createFederationConnectionDomain` now generates a token, stores only its hash, and returns the exact record to publish (name `_darkauth-verification.<domain>`, value `darkauth-domain-verification=<token>`); `runFederationDomainDnsVerification` does a real `dns.resolveTxt` check (resolver injectable for tests), respects the one-enabled-verified-owner constraint, and sets `lastCheckedAt`. Admin domain endpoints added under `/admin/federation/connections/:id/domains[...]`.
- New user-API org-scoped Enterprise Connection endpoints (`/organizations/:orgId/federation/connections[...]` and `/organizations/:orgId/scim/connections[...]`), all gated by `requireOrganizationManagePermission` and org-scoped to prevent cross-org access; all mutations audited with org + enterprise-connection context.
- User UI: Enterprise Connections area on org detail with SSO (OIDC) setup, SCIM connection + one-time bearer-token reveal, and DNS TXT instructions + retry verification.
- Admin UI: protected-role deletion messaging (API now returns codes `LAST_DEFAULT_MEMBER_ROLE` / `LAST_DEFAULT_CREATOR_ROLE` / `SYSTEM_ROLE_PROTECTED`), required org selection for SCIM token and federation-connection creation, org-scoped Enterprise Connections route under org detail, and an admin SSO setup/domain-verification page.
- Legacy `email` account-linking enum: migration `0038_federation_email_linking_migration` normalizes existing `email` rows to `email_verified`.
- Tests: token-claim-after-personal-org and multi-org refresh-token (missing/stale session org → `ORG_CONTEXT_REQUIRED`) added; DNS verification test added. Focused API tests, full `npm run typecheck`, and `npm run tidy` all green.

Remaining work for the next agent:

- Run the relevant Playwright end-to-end tests against a running stack (the only unchecked checklist item). The new UI was verified by typecheck/tidy/build only, not exercised live, so the API↔UI contract should be smoke-tested (esp. response envelope/field shapes — the UI wrappers were written tolerant of either bare objects or `{ connection } / { domain } / { token }` envelopes).

## Parallel Implementation Checklist

### Track A: Specs, Data Model, And Migration

- [x] Update `specs/RBAC.md`, `specs/ORG_SELECTION.md`, and docs to remove special `Default` guidance.
- [x] Add role flags to schema and migrations.
- [x] Add organization-scoped federation connection fields and domain verification tables.
- [x] Add organization-scoped SCIM token fields or create SCIM connection tables.
- [x] Add audit organization and enterprise connection context.
- [x] Add migration for role default flags and assignable flags.
- [x] Add migration safety checks for at least one default member role and one default creator role.
- [x] Split root user creation from organization provisioning before removing default-org behavior.
- [x] Remove fresh-install creation of special `Default`.
- [x] Preserve existing `Default` as normal data.
- [x] Disable or quarantine existing global federation and SCIM integrations when no safe organization can be inferred.
- [x] Migrate or quarantine existing global SCIM users, groups, mappings, and policy settings.

### Track B: Role And Permission Semantics

- [x] Replace hardcoded `member` role lookup with default member role resolver.
- [x] Replace hardcoded `org_admin` role lookup with default creator role resolver.
- [x] Enforce role deletion protection for default roles.
- [x] Enforce `assignable` for user-side role assignment.
- [x] Stop using `system` as the user-side assignability gate.
- [x] Keep instance-admin role assignment unrestricted.
- [x] Add tests for missing, multiple, and protected default roles.

### Track C: Registration And User Creation

- [x] Create personal organization during self-registration.
- [x] Assign default member and default creator roles during self-registration.
- [x] Store new personal organization in the session.
- [x] Update admin user creation to require organization assignment mode.
- [x] Add admin create-user support for existing organization assignment.
- [x] Add admin create-user support for personal organization creation.
- [x] Keep federation JIT and SCIM provisioning from creating personal organizations.
- [x] Remove automatic assignment of new users to `Default`.

### Track D: User Organization Management API

- [x] Add endpoint to list assignable roles.
- [x] Add or complete endpoint to add/invite members.
- [x] Add endpoint to remove members from an organization.
- [x] Add endpoint to leave organization.
- [x] Add endpoint to delete organization.
- [x] Add safeguards for last active organization.
- [x] Add safeguards for last management-capable member.
- [x] Add audit logs for user-side organization actions.

### Track E: User UI Organization Management

- [x] Add organizations list/detail navigation.
- [x] Preserve existing Profile org list/create/switch and `/switch-org` flows.
- [x] Add user API client wrappers for existing organization detail, member, invite, and role endpoints.
- [x] Add member management UI.
- [x] Add assignable role picker.
- [x] Add invite/add member UI.
- [x] Add leave organization action.
- [x] Add delete organization action.
- [x] Add clear disabled states for safety-rule failures.
- [x] Verify multi-org session switching remains clear.

### Track F: SCIM Refactor

- [x] Add SCIM connection model owned by organization.
- [x] Make SCIM tokens connection-scoped and organization-scoped.
- [x] Update SCIM auth middleware to resolve connection and organization from token.
- [x] Scope SCIM users, groups, and group memberships by connection.
- [x] Ensure SCIM create/update/deactivate touches only one organization.
- [x] Move SCIM role mappings to organization scope.
- [x] Track SCIM membership and role-grant provenance.
- [x] Prevent SCIM group sync from mutating manually managed members or roles.
- [x] Move global `users.scim.*` policy settings to connection/org scope.
- [x] Add org-scoped revocation helpers for sessions, auth codes, and pending auth.
- [x] Add SCIM deprovisioning policy with safe default membership suspension.
- [x] Add guarded optional root user deletion for verified-domain managed users.
- [x] Update admin UI to create SCIM tokens from organization context.
- [x] Add user UI SCIM setup under Enterprise Connections for organization admins.
- [x] Keep global SCIM page as overview only.
- [x] Add tests proving SCIM cannot cross organization boundaries.
- [x] Add tests for SCIM deprovisioning policy, including delete-user safety failures.

### Track G: Federation Refactor

- [x] Make federation connections organization-scoped.
- [x] Add domain verification model and DNS TXT verification.
- [x] Allow duplicate pending domain claims but only one enabled verified owner.
- [x] Add UI instructions for DNS TXT verification and retry status checks.
- [x] Update domain route lookup to use verified organization domains only.
- [x] Ensure domain routing is treated only as routing, not authorization.
- [x] Update federation start to support explicit organization context.
- [x] Bind federation start state to client and organization context.
- [x] Update federation callback to create or validate membership in the connection organization.
- [x] Bind callback state to connection and organization context.
- [x] Ensure federated JIT user creation does not create a personal organization.
- [x] Split account linking from JIT provisioning and membership-on-authentication behavior.
- [x] Move federation policy out of metadata where practical.
- [x] Decide migration behavior for legacy `email` account-linking enum value.
- [x] Add admin UI SSO setup under organization Enterprise Connections.
- [x] Add user UI SSO setup under Enterprise Connections for organization admins.
- [x] Add tests proving federation cannot authenticate into the wrong organization.

### Track H: Admin UI And Admin API

- [x] Add role flag fields to role create/edit UI.
- [x] Add role flag fields to role APIs.
- [x] Add protected-role deletion messaging.
- [x] Add organization choice to admin user creation UI.
- [x] Add personal organization creation to admin user creation UI.
- [x] Add org-scoped admin Enterprise Connections routes under organization detail.
- [x] Add SCIM token organization selection in admin UI.
- [x] Add federation connection organization selection in admin UI.
- [x] Add Enterprise Connections grouping on organization detail.
- [x] Update admin organization detail to expose provisioning status.

### Track I: Tests And Verification

- [x] Replace default organization membership tests.
- [x] Add self-registration personal organization tests.
- [x] Add admin-created user organization assignment tests.
- [x] Add user leave/delete organization safety tests.
- [x] Add assignable role enforcement tests.
- [x] Add token claim tests after personal organization creation.
- [x] Add multi-org refresh-token tests for missing and stale session organization.
- [x] Add federation JIT without `Default` tests.
- [x] Add SCIM provisioning without `Default` tests.
- [x] Add SCIM org-boundary tests.
- [x] Add federation org-boundary tests.
- [x] Run focused API/model tests.
- [ ] Run relevant Playwright tests.
- [x] Run `npm run tidy`.
- [x] Run `npm run build`.

## Open Decisions For Implementation

- Whether personal organization display names should use `{firstName}'s Personal`, `{fullName}'s Personal`, or `{email local part}'s Personal` when name is absent.
- Whether user-side organization deletion should hard-delete immediately or soft-delete/suspend first.
- Whether role defaults should allow multiple roles per default flag or exactly one role per flag.
- Whether admin add-member should auto-assign default member roles or require explicit role selection.
- Whether organization admins should be allowed to configure SCIM in the user UI in the first implementation, or whether that waits until after admin UI support lands.
- Whether organization admins should be allowed to configure Federation in the user UI in the first implementation, or whether that waits until after admin UI support lands.
- Whether federation membership-on-authentication should be enabled by default for new connections.
- Whether SCIM `delete_user` should be enabled for any org-owner self-service path in the first implementation, or limited to instance admins until the recovery story is proven.
