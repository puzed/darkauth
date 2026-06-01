# Organization Switching And SDK Support

## Summary

DarkAuth already supports organization-scoped login. The hosted authorize UI can ask a multi-org user which organization to use, `/authorize` accepts an `organization_id` hint, `/switch-org` lets a signed-in user change their DarkAuth session organization, and `/token` mints ID/access tokens with the selected `org_id`, `org_slug`, roles, and permissions.

The remaining gap is product and SDK shape. A relying-party app such as Atlas wants a Slack-like organization rail inside its own UI: list my organizations, click one, receive a fresh token for that organization, clear app tenant state, and continue without forcing a logout/login loop. DarkAuth should make that flow feel like a normal identity-provider feature, comparable to organization switching in Auth0, Clerk, Frontegg, WorkOS, or similar providers.

This spec defines the DarkAuth API, SDK, and documentation work needed to support that pattern in an industry-standard way.

## Current State

DarkAuth has the important backend primitives:

- `GET /authorize` accepts optional `organization_id`.
- `POST /authorize/finalize` binds the selected org to the authorization code and session.
- `POST /token` issues org-scoped ID/access tokens for authorization-code and refresh-token grants.
- `GET /api/user/organizations` lists active organizations for the current user session.
- `GET /api/user/session` returns current session organization context.
- `POST /api/user/session/organization` validates membership and updates `sessions.data.organizationId`.
- `/switch-org` is a hosted first-party UI that calls the session organization endpoint and validates `return_to`.

The current `@darkauth/client` exposes login/session primitives:

- `setConfig`
- `initiateLogin`
- `handleCallback`
- `getStoredSession`
- `refreshSession`
- `logout`

The client does not currently expose typed organization helpers, and `initiateLogin` does not accept an `organizationId` option. Apps can redirect to hosted DarkAuth routes manually, but they cannot yet implement polished app-owned org switchers from the SDK alone.

## Goals

- Let apps render their own organization switcher while DarkAuth remains the source of truth.
- Let apps request a fresh token for a selected organization without full logout.
- Keep the active organization represented by normal OAuth/OIDC token claims.
- Preserve hosted DarkAuth org selection for apps that do not build their own switch UI.
- Make SDK APIs simple enough for Atlas-style tenant switching.
- Avoid cross-organization permission merging.
- Avoid any endpoint that mints a token for an org without server-side membership validation.

## Non-Goals

- Multi-org tokens containing claims for every organization.
- Letting apps mutate DarkAuth organization membership through the auth SDK.
- Replacing the hosted `/switch-org` page.
- Supporting arbitrary third-party cross-origin session mutation without a browser redirect or proper OAuth flow.
- Bypassing consent, PKCE, client redirect validation, or membership validation.

## Standard Provider Model

DarkAuth should treat organization switching as selecting a new authorization context. The selected organization is not just UI state. It must be reflected in freshly issued tokens.

Recommended app-owned flow:

1. App asks DarkAuth for active organizations.
2. User selects an organization inside the app.
3. App starts a new authorization request with `organization_id=<selected org>`.
4. DarkAuth validates the user's active membership.
5. DarkAuth returns an authorization code to the registered app callback.
6. App handles the callback and receives a new org-scoped session/token.
7. App clears tenant-local state and loads data for the selected org.

This is the safest default for third-party relying parties because it stays inside OAuth redirect, PKCE, state, redirect URI, and token issuance rules.

Hosted fallback flow:

1. App redirects to `/switch-org?client_id=<client>&return_to=<app url>`.
2. DarkAuth shows its first-party org switch screen.
3. DarkAuth updates the first-party session organization.
4. DarkAuth redirects back to the app.
5. App calls `refreshSession()` and receives a token for the new session org.

This is useful when the app does not want to build its own organization picker.

## API Contract

### Authorization Request

`GET /authorize` should continue to accept:

```text
organization_id=<uuid>
```

Rules:

- If present, DarkAuth must validate active membership before code issuance.
- If absent and exactly one active org exists, DarkAuth may select it.
- If absent and multiple active orgs exist, DarkAuth should use the existing authorize UI selector.
- Tokens issued from the code must contain only the selected organization's roles and permissions.

### User Organizations

Apps need a user-facing organization list for switcher UIs.

Keep:

```text
GET /api/user/organizations
```

Response should be stable and SDK-friendly:

```json
{
  "organizations": [
    {
      "organizationId": "uuid",
      "slug": "acme",
      "name": "Acme",
      "status": "active",
      "roles": [
        { "id": "uuid", "key": "org_admin", "name": "Admin" }
      ]
    }
  ]
}
```

Rules:

- Return only organizations where the current user has membership.
- SDK helpers should filter to active organizations by default.
- Do not leak organizations where the user is not a member.

### Session Organization

Keep:

```text
POST /api/user/session/organization
```

This endpoint is appropriate for same-origin hosted DarkAuth UI. It is not enough as the only app-owned third-party integration because it is CSRF protected and relies on DarkAuth first-party cookies.

Rules:

- Validate active membership.
- Update `sessions.data.organizationId` and `sessions.data.organizationSlug`.
- Audit previous and next organization.
- Return current org metadata and an optional validated redirect target.

### Token Endpoint

`POST /token` should keep issuing tokens for the current session organization during refresh-token grant.

Rules:

- If the current session organization changes and the app performs a refresh-token grant, the new ID/access tokens should reflect the new org.
- If the session org is missing and the user has multiple active orgs, return `ORG_CONTEXT_REQUIRED`.
- Do not accept arbitrary `organization_id` on refresh-token grant unless DarkAuth intentionally implements an extension with clear security rules.

### Optional Future Extension

If DarkAuth later wants a non-redirect token switch, use a formal extension instead of an ad hoc parameter:

- OAuth 2.0 Token Exchange style endpoint or grant.
- Request includes subject token/session context and requested organization.
- Server validates active membership and client authorization.
- Response returns fresh org-scoped tokens.
- Public browser clients still need PKCE/session protections and should prefer redirect-based authorization unless the extension is carefully designed.

This is a future optimization, not required for Atlas.

## SDK Contract

Add typed organization support to `@darkauth/client`.

### Types

```ts
export type DarkAuthOrganization = {
  organizationId: string;
  slug: string;
  name: string;
  status: string;
  roles?: Array<{ id: string; key: string; name: string }>;
};

export type InitiateLoginOptions = {
  organizationId?: string;
  returnTo?: string;
};

export type SwitchOrganizationOptions = {
  mode?: "authorize" | "hosted";
  returnTo?: string;
};
```

### `initiateLogin(options?)`

Update `initiateLogin` to accept an optional `organizationId`.

Behavior:

- Include `organization_id` in the authorization URL when supplied.
- Preserve existing PKCE, state, scope, ZK, and redirect behavior.
- Store safe `returnTo` state only if the SDK already owns post-callback navigation state.

### `listOrganizations()`

Add:

```ts
export async function listOrganizations(): Promise<DarkAuthOrganization[]>
```

Behavior:

- Fetch from `GET /api/user/organizations`.
- Use `credentials: include`.
- Return active and inactive memberships as the API returns them, or add `listActiveOrganizations()` if the SDK should filter.
- Throw a typed auth/session error on 401.

### `getSessionInfo()`

Add:

```ts
export async function getSessionInfo(): Promise<{
  authenticated: boolean;
  sub?: string;
  email?: string | null;
  name?: string | null;
  organizationId?: string;
  organizationSlug?: string | null;
}>
```

This is useful for app chrome before a fresh OAuth callback is required.

### `switchOrganization(organizationId, options?)`

Add:

```ts
export async function switchOrganization(
  organizationId: string,
  options?: SwitchOrganizationOptions
): Promise<void>
```

Default behavior should be `mode: "authorize"` for third-party apps:

- Call `initiateLogin({ organizationId, returnTo })`.
- This produces a normal authorization-code flow and fresh org-scoped token.
- The app handles the callback with existing `handleCallback()`.

Hosted behavior:

- Redirect to `/switch-org?organization_id=...&client_id=...&return_to=...`.
- On return, the app calls `refreshSession({ force: true })`.
- Use only for apps that want DarkAuth's hosted switch screen.

### `refreshSession(options?)`

Extend refresh:

```ts
export async function refreshSession(options?: { force?: boolean }): Promise<AuthSession | null>
```

Behavior:

- `force: true` should refresh even if the current in-memory ID token is still valid.
- When DarkAuth session org changed, return a token reflecting that org.
- Preserve existing token/cookie refresh modes.

### Claims Type

Extend `JwtClaims`:

```ts
export interface JwtClaims {
  sub?: string;
  email?: string;
  name?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  org_id?: string;
  org_slug?: string;
  roles?: string[];
  permissions?: string[];
}
```

## Client UX Guidance

For app-owned Slack-style switching:

- App shows organization rail using `listOrganizations()`.
- Active item is derived from current token `org_id`.
- Clicking another org calls `switchOrganization(orgId)`.
- App handles callback, validates new `org_id`, clears tenant-local state, and reloads.

For hosted switching:

- App links to `switchOrganization(orgId, { mode: "hosted" })` or directly to `/switch-org`.
- DarkAuth owns organization selection UI.
- App refreshes session after return.

For login:

- If the app has a preferred org, call `initiateLogin({ organizationId })`.
- If the app has no preferred org, call `initiateLogin()` and let DarkAuth choose or prompt.

## Security Requirements

- Never trust an org selected in app UI without server-side validation.
- Never mint tokens for an org where the user lacks active membership.
- Keep authorization-code flow protected by PKCE and state.
- Validate redirect URI and `return_to` exactly as today.
- Do not expose session organization mutation as an unprotected cross-origin API.
- Do not include roles or permissions from non-selected orgs.
- Audit org switching through hosted session changes and authorize-time changes.
- Keep `ORG_CONTEXT_REQUIRED` machine-readable for developers but map it to user-facing org selection.

## Acceptance Criteria

- An app can list the signed-in user's organizations through `@darkauth/client`.
- An app can start login for a specific organization through `@darkauth/client`.
- An app can switch organizations through `@darkauth/client` and receive a fresh token with the selected `org_id`.
- The existing hosted `/switch-org` flow remains available and documented.
- Refreshing after a hosted switch returns tokens for the new session organization.
- Tokens contain roles and permissions only for the selected organization.
- Atlas can build a Slack-like org rail without using private DarkAuth APIs.

## Implementation Checklist

### API And OAuth

- [x] Confirm `GET /authorize?organization_id=...` works for public clients with PKCE and current tests cover the Atlas client shape.
- [x] Confirm `/token` refresh grant returns the current session organization after `/api/user/session/organization`.
- [x] Keep `POST /api/user/session/organization` same-origin and CSRF protected.
- [x] Ensure `GET /api/user/organizations` includes role summaries needed by app switcher UIs.
- [x] Add or confirm `ORG_CONTEXT_REQUIRED` docs for refresh-token and authorize edge cases.
- [x] Add OpenAPI docs for organization list, session info, and session organization endpoints.

### SDK

- [x] Export `DarkAuthOrganization`, `InitiateLoginOptions`, and `SwitchOrganizationOptions`.
- [x] Extend `JwtClaims` with `org_id`, `org_slug`, `roles`, and `permissions`.
- [x] Update `initiateLogin(options?)` to include `organization_id`.
- [x] Add `listOrganizations()`.
- [x] Add `getSessionInfo()`.
- [x] Add `switchOrganization(organizationId, options?)`.
- [x] Add `refreshSession({ force })`.
- [x] Add typed errors for unauthenticated session, invalid org, and org context required.
- [x] Update SDK README examples for app-owned and hosted org switching.

### Hosted User UI

- [x] Keep `/switch-org` as the hosted switch screen.
- [x] Confirm `/switch-org` supports `client_id`, `return_to`, and preselected `organization_id`.
- [x] Add copy that frames switching as choosing the active organization for connected apps.
- [x] Ensure profile links to `/switch-org` only when more than one active org exists.
- [x] Add visual indication of the current org in the user portal.

### Tests

- [x] SDK test for `initiateLogin({ organizationId })` authorization URL.
- [x] SDK test for `listOrganizations()`.
- [x] SDK test for `switchOrganization()` authorize mode.
- [x] SDK test for hosted switch URL generation.
- [x] SDK test for `refreshSession({ force: true })`.
- [x] API test that hosted session switch plus refresh mints token for new org.
- [x] Browser test for multi-org authorize selector.
- [x] Browser test for `/switch-org` returning to a registered app URL.

### Documentation

- [x] Document app-owned organization switcher pattern.
- [x] Document hosted switcher pattern.
- [x] Document when to use `organization_id` on `/authorize`.
- [x] Document token claim semantics for selected org.
- [x] Document that apps must treat org switching as a tenant/workspace state reset.
