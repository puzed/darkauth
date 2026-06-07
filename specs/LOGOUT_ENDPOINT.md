# OIDC RP-Initiated Logout (`end_session_endpoint`)

Tracking issue: [#160](https://github.com/puzed/darkauth/issues/160)
Reference spec: [OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)

## Goal

Add standards-compliant **RP-Initiated Logout** to DarkAuth so a relying party can end the
user's DarkAuth SSO (IdP) session, not just clear its own local tokens.

- Advertise an `end_session_endpoint` in `/.well-known/openid-configuration`.
- Honor `id_token_hint`, `post_logout_redirect_uri` (per-client allowlist), `client_id`, and `state`.
- End the DarkAuth session via a **browser redirect** (GET), then redirect back to an allowlisted
  `post_logout_redirect_uri`.
- Stay OAuth/OIDC compliant and safe (no open redirects, no forced-logout abuse).

## Why

A relying party (e.g. Atlas) wants its "logout" to terminate the IdP session. Today DarkAuth exposes
a first-party `POST /logout` and `POST /revoke`, but no standard `end_session_endpoint`. After an app
logout the DarkAuth SSO session persists, so the next "Sign in" silently re-authenticates the user.

This is **redirect-based**, not cross-domain-cookie based, so it is compatible with our
no-third-party-cookies stance:

1. RP redirects the browser to
   `end_session_endpoint?id_token_hint=<id_token>&post_logout_redirect_uri=<allowlisted-uri>&state=<state>`.
2. DarkAuth verifies the hint, ends the session, and redirects the browser back to the allowlisted
   `post_logout_redirect_uri` with the original `state`.

## Current State

The groundwork is largely in place; this feature is mostly additive wiring + an OIDC-correct GET flow.

- **`POST /logout`** already exists: `packages/api/src/controllers/user/logout.ts`.
  - Clears the current session (`deleteSession`) and cookies (`clearSessionCookies`,
    `clearRefreshTokenCookie`).
  - Accepts `post_logout_redirect_uri`, `client_id`, `state` as **form fields** and validates the
    redirect URI against `client.postLogoutRedirectUris`, then 302-redirects (with `state`).
  - Otherwise returns JSON `{ message, logged_out: true }` (this is the first-party XHR path used by
    user-ui).
  - Wrapped in `withAudit({ eventType: "USER_LOGOUT" })`.
- **Client allowlist column already exists**: `clients.post_logout_redirect_uris` (`text[]`) in
  `packages/api/src/db/schema.ts`, editable via admin UI (`packages/admin-ui/src/pages/ClientEdit.tsx`)
  and validated in `clientCreate.ts` / `clientUpdate.ts`. **No new migration needed.**
- **Discovery**: `packages/api/src/controllers/user/wellKnownOpenid.ts` builds the config object and
  a Zod `Resp` schema. It does **not** advertise `end_session_endpoint` yet.
- **Routing**: `packages/api/src/http/routers/userRouter.ts` registers routes with simple
  `method === ... && pathname === ...` checks. `POST /logout` is at line ~861; discovery at ~531.
  There is **no `GET /logout`** today.
- **JWT verify**: `verifyJWT(context, token, expectedAudience?)` in
  `packages/api/src/services/jwks.ts` verifies EdDSA signature + issuer, but **rejects expired
  tokens** (jose default). RP-Initiated Logout requires accepting an **expired** `id_token_hint`.
- **Sessions**: `sessions` table, cohort `user|admin`; cookies `__Host-DarkAuth-User*`.
  `getSessionId(request)`, `deleteSession(context, id)` in `packages/api/src/services/sessions.ts`.
  There is also `deleteUserSessions`-style logic by `sub` already used elsewhere.
- **Frontend**: user-ui `handleLogout` (`packages/user-ui/src/App.tsx`) calls `apiService.logout()`
  → `POST /logout` and clears local ZK material. No confirmation/landing route for end-session.

### What's missing for compliance

1. `end_session_endpoint` not advertised in discovery.
2. No **GET** end-session flow (RPs redirect the browser via GET).
3. `id_token_hint` is not parsed, verified, or used to identify the client/session.
4. No acceptance of **expired** `id_token_hint`.
5. No confirmation/landing page for the no-`id_token_hint` case (open-redirect / forced-logout safety).

## Design

### Endpoint

- Advertise `end_session_endpoint = ${publicOrigin}/api/logout`.
- Serve the RP-Initiated Logout flow on **`GET /logout`** and **`POST /logout`** (OIDC permits both;
  RPs almost always use GET browser redirects).
- Keep the existing **first-party JSON logout** behavior for the user-ui XHR (no OIDC params,
  `Accept: application/json` / no redirect target → JSON response, not a redirect).

### Request parameters (per RP-Initiated Logout 1.0)

| Param | Support | Notes |
|---|---|---|
| `id_token_hint` | RECOMMENDED | Previously-issued ID Token. Verify signature + issuer; **accept expired**. `aud` identifies the client. |
| `post_logout_redirect_uri` | OPTIONAL | Must exactly string-match an entry in the resolved client's `postLogoutRedirectUris`. |
| `client_id` | OPTIONAL | Used to resolve client when no `id_token_hint`. If both present, must equal `id_token_hint.aud`. |
| `state` | OPTIONAL | Echoed back on the redirect. |
| `logout_hint`, `ui_locales` | OPTIONAL | Accept and ignore for v1 (document as not-yet-honored). |

### Behavior

1. Parse params from query (GET) or form body (POST).
2. If `id_token_hint` present: verify signature + issuer (allowing expiry). Extract `sub` and `aud`.
   - If `client_id` also present and `client_id !== aud` → `invalid_request`.
   - Resolve client from `aud`.
3. If `post_logout_redirect_uri` present:
   - Require a resolved client (from `id_token_hint.aud` or `client_id`).
   - The URI MUST be in `client.postLogoutRedirectUris` (exact match) → else `invalid_request`.
4. **Confirmation / safety gate** (open-redirect & forced-logout mitigation):
   - With a **valid `id_token_hint`**, we trust the request → end session silently and redirect.
   - **Without** a valid `id_token_hint`, do **not** silently force logout + redirect. Redirect the
     browser to a user-ui logout-confirmation route that requires an explicit user click before
     clearing the session and continuing to the (still allowlist-validated) `post_logout_redirect_uri`.
5. End the session: `deleteSession` for the current cookie session + `clearSessionCookies` +
   `clearRefreshTokenCookie`. (Decision below on single vs. global.)
6. Redirect:
   - If a valid `post_logout_redirect_uri`: 302 to it, appending `state` if provided.
   - Else: render/redirect to a DarkAuth "you are signed out" landing page.
7. Audit log via existing `withAudit` (`USER_LOGOUT`), recording `client_id` and whether a hint was used.

### Decisions

- **Single vs. global session termination.** Default: terminate only the **current browser session**
  (the cookie session). This matches "end this SSO session". A global "sign out everywhere" by `sub`
  is out of scope for v1 (the infra exists if we want it later).
- **Expired `id_token_hint`.** Accept. RP-Initiated Logout explicitly allows the hint to be expired.
  Add a signature-only verification helper (verify EdDSA sig + issuer, **skip `exp`**). Do not accept
  unsigned/forged tokens.
- **Client resolution precedence.** Prefer `id_token_hint.aud`; `client_id` is a fallback and must
  match the hint when both are present.
- **No `id_token_hint`.** Require explicit user confirmation (user-ui route) before logout + redirect,
  to prevent malicious sites from force-logging-out users and bouncing them through an allowlisted URI.
- **Endpoint path.** Reuse `/api/logout` (advertise it as `end_session_endpoint`) rather than adding a
  parallel `/end_session` path, to keep one logout surface. The JSON first-party path is preserved by
  branching on presence of OIDC params / `Accept`.

### Security considerations

- Only ever redirect to an **allowlisted** `post_logout_redirect_uri` (exact match). Never reflect an
  arbitrary URI → no open redirect.
- Validate `id_token_hint` signature against JWKS; treat an invalid signature as no hint (fall to the
  confirmation path), never as authorization.
- Keep the forced-logout confirmation gate for the no-hint case.
- Rate-limit the endpoint consistent with other auth endpoints.
- `state` is echoed verbatim only onto an already-validated redirect target.

## Scope

### In scope

- Advertise `end_session_endpoint` in discovery (+ Zod `Resp`).
- `GET`/`POST` `/logout` RP-Initiated Logout flow honoring `id_token_hint`, `post_logout_redirect_uri`,
  `client_id`, `state`.
- Expired-`id_token_hint`-tolerant verification helper.
- Logout confirmation + signed-out landing routes in user-ui for the no-hint case.
- Preserve first-party JSON logout used by user-ui.
- Spec + docs updates.
- API + e2e tests.

### Out of scope

- OIDC **Back-Channel** and **Front-Channel** logout (separate specs; not required by #160).
- Global "sign out of all sessions / all devices" by `sub`.
- `logout_hint` / `ui_locales` honoring (accepted but ignored in v1).
- Session-management `check_session_iframe` (cookie/iframe based; conflicts with no-3p-cookie stance).

## Tasks

### Specs
- [x] Add this file (`specs/LOGOUT_ENDPOINT.md`).
- [x] Update `specs/2_CORE.md` §7.1 Discovery to list `end_session_endpoint`.
- [x] Update `specs/2_CORE.md` §7.5 Session + Logout to document the RP-Initiated Logout flow
      (`GET`/`POST /logout`, `id_token_hint`, `post_logout_redirect_uri`, `state`, confirmation behavior).

### Docs
- [x] Add `docs/rp-initiated-logout.md` describing the RP integration flow, params, allowlist setup,
      and the no-3p-cookie rationale.
- [x] Link the new page from `docs/README.md` (API Behavior section).
- [x] Document configuring per-client **Post-Logout Redirect URIs** in the admin client docs.

### Backend — discovery
- [x] Add `end_session_endpoint: \`${publicOrigin}/api/logout\`` to the config in
      `controllers/user/wellKnownOpenid.ts`.
- [x] Add `end_session_endpoint` to the discovery `Resp` Zod schema.

### Backend — endpoint
- [x] Register `GET /logout` in `http/routers/userRouter.ts` (keep `POST /logout`).
- [x] CORS / public-path: not needed — `/api/logout` is same-origin; GET is a top-level browser
      navigation (no CORS) and the confirm POST is same-origin first-party.
- [x] Add an expired-tolerant `id_token_hint` verifier (signature + issuer, skip `exp`) in
      `services/jwks.ts` (`verifyIdTokenHint`, uses `compactVerify` + `decodeJwt`).
- [x] Extend `controllers/user/logout.ts` to parse params from **query (GET)** and **form (POST)**:
      `id_token_hint`, `post_logout_redirect_uri`, `client_id`, `state`.
- [x] Resolve client from `id_token_hint.aud`; if `client_id` present, enforce it equals `aud`.
- [x] Validate `post_logout_redirect_uri` against `client.postLogoutRedirectUris` (reuse existing logic).
- [x] End current session + clear cookies (reuse existing helpers).
- [x] Redirect to validated `post_logout_redirect_uri` with `state`, else to the signed-out landing.
- [x] Implement the no-`id_token_hint` confirmation gate (redirect to user-ui confirm route;
      short-circuits to the validated target when there is no active session).
- [x] Preserve first-party JSON logout for user-ui XHR (no OIDC params).
- [x] Keep `withAudit` `USER_LOGOUT` logging on both GET and POST.

### Frontend (user-ui)
- [x] Add a logout-confirmation route for the no-`id_token_hint` case (explicit user click).
      (`/logout` route → `components/LogoutView.tsx`.)
- [x] Add a post-logout "signed out" landing page (used when no `post_logout_redirect_uri`).
      (`/logout?signed_out=1` state in `LogoutView`.)
- [x] Confirm existing `handleLogout` / `apiService.logout()` first-party flow is unaffected.

### Admin UI
- [x] Confirm Post-Logout Redirect URIs editing on `ClientEdit.tsx` works end-to-end; add help text
      explaining exact-match allowlisting for RP-Initiated Logout.

### Tests
- [x] API: discovery response includes `end_session_endpoint`.
- [x] API: `GET /logout` with valid `id_token_hint` + allowlisted `post_logout_redirect_uri` clears the
      session and 302-redirects with `state`.
- [x] API: rejects a `post_logout_redirect_uri` not in the client allowlist.
- [x] API: rejects `client_id` that mismatches `id_token_hint.aud`.
- [x] API: accepts an **expired** `id_token_hint`.
- [x] API: no valid `id_token_hint` + active session → confirmation redirect, session not cleared
      (covers tampered/invalid-signature hint, which is treated as no hint).
- [x] API: no params → first-party JSON logout still works.
- [ ] e2e: RP logout ends the DarkAuth SSO session; the next "Sign in" requires re-authentication.
      (Playwright e2e deferred — API tests cover the behavior; see follow-up.)

### Wrap-up
- [x] Validate against OpenID Connect RP-Initiated Logout 1.0 (params, error codes, redirect rules).
      `end_session_endpoint` advertised; `id_token_hint` (sig+issuer, expired accepted), `client_id`
      (must equal `aud` when both present), `post_logout_redirect_uri` (exact-match allowlist, no
      open redirect), and `state` (echoed) all honored; confirmation shown when the request is not
      authenticated by a valid hint; hint verification pinned to EdDSA (no alg confusion).
- [x] `npm run tidy` and `npm run build`.
