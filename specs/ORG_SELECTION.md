# Organization Selection Specification

## Summary

Add first-party organization selection to DarkAuth so relying-party clients do not need to solve multi-organization ambiguity themselves.

When an authorization request does not include an organization and the signed-in user has more than one active organization membership, DarkAuth should pause the authorize journey and ask which organization to use. The selected organization is then bound to the authorization code, session, ID token, access token, roles, and permissions.

DarkAuth should also expose a standalone switch-organization journey that apps can redirect users to when they want a new organization context without forcing a full logout.

## Current State

DarkAuth already supports organization-scoped token claims:
- `org_id`
- `org_slug`
- `roles`
- `permissions`

Current organization resolution behavior:
- explicit `organization_id` works when supplied during authorization.
- if the user has one active organization, DarkAuth can infer it.
- if the user has multiple active organizations and no org is selected, token exchange fails with `ORG_CONTEXT_REQUIRED`.

That failure is technically correct but poor product behavior. The authorization UI already has the user, client, and pending auth request context, so it is the right place to resolve the ambiguity.

## Goals

- Let DarkAuth choose org context inside the first-party authorize journey.
- Preserve explicit client-selected org behavior.
- Make multi-org sign-in understandable and recoverable.
- Let apps redirect users to a DarkAuth switch-org screen.
- Bind the selected org to the auth code before token exchange.
- Keep token claims deterministic and org-scoped.
- Avoid silently choosing an organization when multiple valid choices exist.

## Non-Goals

- Organization creation during authorization.
- Cross-organization token claims.
- Client-side permission probing to choose an org automatically.
- Replacing app-level tenant switching UX where the app has its own tenant model.
- Allowing a client to request an organization where the user has no active membership.

## Core Rules

## Authorization Request With Explicit Org

If `/authorize` receives `organization_id`:
1. Validate the user has active membership in that organization before final approval.
2. Bind that organization to `pending_auth` and `auth_codes`.
3. Mint tokens with roles and permissions for that org only.
4. Return a clear authorization error if the user is not a member.

If the user is not signed in yet, membership validation can happen after login, but before code issuance.

## Authorization Request Without Explicit Org

When `/authorize` does not receive `organization_id`:
1. If the signed-in user has zero active organizations, deny login with a clear message.
2. If the user has one active organization, select it automatically.
3. If the user has multiple active organizations, show an organization selection step before approval.
4. Store the selected organization on the pending authorization request or include it in the finalize request.
5. Create the authorization code with that organization.

The token endpoint should not need to ask the user anything. By token exchange time, org context must already be present unless the user truly has one active organization.

## Selected Org Lifetime

The selected organization should be stored in the DarkAuth user session as the current organization:
- `organizationId`
- `organizationSlug`

Future authorization requests without explicit `organization_id` may use the session organization if it is still an active membership.

If the session organization is missing, invalid, or no longer active:
- fall back to the organization selection rules above.

## User Experience

## Authorize Journey

The authorize screen should have up to three steps:
1. Signed-in user and client details.
2. Organization selection when required.
3. Final consent.

For a multi-org user with no selected org:
- show the app/client name.
- show the signed-in user.
- show active organizations the user can choose from.
- prefer a compact list or select control.
- show role names or a brief access summary when available.
- require an explicit choice before enabling final authorization.

For a single-org user:
- do not show the selection step.
- show the chosen organization in the signed-in account panel if useful.

For an explicit org request:
- show that org as the selected context.
- do not allow switching to another org unless the client did not require one.

## Switch Organization Journey

Add a first-party route equivalent to change-password:
- `/switch-org`

Apps can redirect the browser to this route when they want the user to choose a different DarkAuth org.

Supported query parameters:
- `return_to`: optional absolute URL or registered redirect URI to return to after selection.
- `client_id`: optional client context for validating `return_to`.
- `organization_id`: optional preselected organization.

Behavior:
1. Require an authenticated user session.
2. List active organizations for the user.
3. Let the user choose one.
4. Persist the chosen org on the DarkAuth user session.
5. Redirect to `return_to` if valid, otherwise to the DarkAuth dashboard.

Security rule:
- `return_to` must be relative or must match a registered redirect/post-logout redirect origin for the supplied client.
- If no `client_id` is supplied, only relative DarkAuth-local return paths are allowed.

## API Surface

## Existing APIs

Reuse:
- `GET /api/user/organizations`
- `GET /api/user/session`
- `POST /api/user/authorize/finalize`

## New or Extended APIs

### GET /api/user/session

Extend response with optional org context:

```json
{
  "authenticated": true,
  "sub": "user-sub",
  "email": "user@example.com",
  "name": "User",
  "organizationId": "org-uuid",
  "organizationSlug": "family"
}
```

### POST /api/user/session/organization

Set current session organization.

Request:

```json
{
  "organization_id": "org-uuid"
}
```

Response:

```json
{
  "organizationId": "org-uuid",
  "organizationSlug": "family"
}
```

Errors:
- `401`: user session required.
- `403`: no active membership in the requested organization.
- `404`: organization not found.

### POST /api/user/authorize/finalize

Keep existing optional `organization_id` input.

Validation:
- if supplied, user must have active membership.
- if not supplied and pending auth has no org, apply selection rules.
- if multiple active orgs remain ambiguous, return `ORG_CONTEXT_REQUIRED` with user-facing detail.

## Data Model

No schema changes are required for the first implementation.

Existing fields are sufficient:
- `sessions.data.organizationId`
- `sessions.data.organizationSlug`
- `pending_auth.organization_id`
- `auth_codes.organization_id`
- `organization_members`
- `organization_member_roles`
- `role_permissions`

Future enhancement:
- add `users.last_selected_organization_id` if organization choice should survive all sessions.

## Token Behavior

ID tokens:
- include selected `org_id`
- include selected `org_slug`
- include role keys for selected org
- include effective permissions for selected org plus direct user permissions

Access tokens:
- include selected `org_id`
- include selected `org_slug`
- include role keys for selected org
- include delegated permissions filtered by granted scopes

Tokens must not include roles or permissions from non-selected organizations.

## Error Messages

`ORG_CONTEXT_REQUIRED` should never surface to end users as a raw code.

User-facing text:

> Choose which organization to use for this sign-in.

Developer-facing API description:

```json
{
  "error": "Organization context required",
  "code": "ORG_CONTEXT_REQUIRED",
  "details": {
    "reason": "multiple_active_organizations"
  }
}
```

When no active organization exists:

> Your account is not a member of any active organization.

When explicit org is invalid:

> Your account cannot sign in with the selected organization.

## Security Requirements

- Always validate active membership server-side before binding an org to a session, pending auth, auth code, or token.
- Do not trust an org id from query params, local storage, or client state.
- Do not leak organization existence to users who are not active members.
- Use CSRF protection on session org updates.
- Audit org switch events with actor subject, selected organization, previous organization, client id when available, and request id when part of authorization.
- Never mint an org-scoped token without a resolved organization.
- Never merge permissions across organizations.

## Implementation Plan

## Phase 1: Backend Session Org API

1. Extend user session response with current organization.
2. Add session organization update endpoint.
3. Validate membership before session updates.
4. Audit organization switch events.

## Phase 2: Authorize Org Selection

1. Include active organizations in authorize UI state.
2. If multiple orgs and no pending org, render org selection before consent.
3. Submit selected `organization_id` to authorize finalize.
4. Persist selected org to the session after successful finalize.
5. Keep explicit `organization_id` requests locked to the requested org.

## Phase 3: Switch Org Screen

1. Add `/switch-org` route.
2. Reuse organization list and session update endpoint.
3. Validate `return_to`.
4. Redirect after selection.

## Phase 4: Client Guidance

1. Document optional `organization_id` on `/authorize`.
2. Document `/switch-org?client_id=...&return_to=...`.
3. Recommend apps redirect to `/switch-org` for user-driven tenant switching.

## Testing

- authorize with explicit valid org.
- authorize with explicit invalid org.
- authorize with one active org and no explicit org.
- authorize with multiple active orgs and no explicit org shows selector.
- selected org is bound to auth code.
- token claims contain only selected org roles and permissions.
- session org updates after selection.
- switch-org rejects invalid `return_to`.
- switch-org rejects organization without active membership.
- raw `ORG_CONTEXT_REQUIRED` is not shown in the UI.

## Acceptance Criteria

- A multi-org user can sign in to an OIDC client without the client supplying `organization_id`.
- DarkAuth asks the user to pick an org before issuing the authorization code.
- Atlas-style clients receive tokens with the expected selected-org permissions.
- Apps can redirect to `/switch-org` and get the user back with a new session org.
- If something is misconfigured, the user sees an actionable message instead of `server_error` or `ORG_CONTEXT_REQUIRED`.
