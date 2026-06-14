# RP-Initiated Logout

DarkAuth supports OIDC RP-Initiated Logout via an `end_session_endpoint`. A relying party (RP)
redirects the browser to DarkAuth to end the user's single sign-on session and optionally return to
a registered post-logout URL.

This is redirect-based, not cross-domain-cookie based, so it works within DarkAuth's
no-third-party-cookies stance. The RP never relies on shared cookies; the browser visits DarkAuth
directly, the SSO session is cleared, and control returns to an allowlisted RP URL.

## Discovery

`GET /.well-known/openid-configuration` advertises `end_session_endpoint` as
`<publicOrigin>/api/logout`.

## Endpoint

`GET /api/logout`

| Parameter | Required | Description |
| --- | --- | --- |
| `id_token_hint` | Recommended | A previously-issued ID Token. Its signature and issuer are verified; expired tokens are accepted per the spec. Its `aud` claim identifies the client. |
| `post_logout_redirect_uri` | Optional | Must exactly match an entry in the resolved client's per-client allowlist. Requires a resolvable client (from `id_token_hint.aud` or `client_id`). |
| `client_id` | Optional | Resolves the client when no `id_token_hint` is sent. If both are present, it must equal `id_token_hint.aud` or the request is rejected. |
| `state` | Optional | Echoed back on the redirect to `post_logout_redirect_uri`. |

An invalid `post_logout_redirect_uri`, an unknown client, or a `client_id` that does not match
`id_token_hint.aud` returns a `400` error.

## RP Integration Flow

1. The RP captures the ID Token it received at login to use as `id_token_hint`.
2. The RP redirects the browser to the `end_session_endpoint` with the desired parameters.
3. DarkAuth verifies the `id_token_hint`, resolves the client, and validates
   `post_logout_redirect_uri` against that client's allowlist.
4. With a valid `id_token_hint`, DarkAuth ends the current SSO session (deletes the session, clears
   cookies) and 302-redirects to the allowlisted `post_logout_redirect_uri` (echoing `state`), or to
   a signed-out page if none was supplied.
5. The RP completes its own local logout when the browser returns.

Example:

```
<issuer>/api/logout?id_token_hint=...&post_logout_redirect_uri=https%3A%2F%2Frp.example.com%2Floggedout&state=abc123
```

## SDK Integration (`@darkauth/client`)

The JavaScript client exposes `endSession()`, which performs the redirect for you. It clears the
local session (same as `logout()`) and then sends the browser to the `end_session_endpoint` resolved
from discovery (falling back to `<issuer>/api/logout`, or the `endSessionEndpoint` config override).

```ts
import { endSession } from "@darkauth/client";

await endSession({
  postLogoutRedirectUri: `${window.location.origin}/login`,
  state: "abc123",
});
```

By default `endSession()` uses the current session's ID token as `id_token_hint` and the configured
`clientId`. The `postLogoutRedirectUri` must be registered in the client's allowlist (see below).
Use `logout()` instead when you only want to clear local tokens without ending the SSO session.

## No-Hint Confirmation Behavior

When no valid `id_token_hint` is provided:

- If there is an active session, DarkAuth shows a confirmation page and the user must click to sign
  out before being logged out and redirected.
- If there is no active session, DarkAuth redirects straight to the validated target.

## Registering Post-Logout Redirect URIs

Per-client Post-Logout Redirect URIs are configured in the admin UI under
Clients → edit client → "Post-Logout Redirect URIs". The list is an exact-match allowlist, one URI
per line.

## First-Party Logout

`POST /api/user/logout` remains the first-party logout used by the user portal and by the
confirmation page. It requires a session and CSRF, always clears the session, and returns JSON:
`{ logged_out: true, redirect_uri }` when a valid allowlisted `post_logout_redirect_uri` was
supplied, else `{ message, logged_out: true }`.

## Out of Scope

The following are not implemented:

- OIDC back-channel logout.
- OIDC front-channel logout.
- Global "sign out everywhere".
- Honoring `logout_hint` and `ui_locales`.
- Session-management iframe.

## Reference

[OpenID Connect RP-Initiated Logout 1.0](https://openid.net/specs/openid-connect-rpinitiated-1_0.html)
