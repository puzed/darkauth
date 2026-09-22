# Authentication and sessions

## Contract

- DarkAuth has separate `user` and `admin` cohorts. A session belongs to exactly one cohort and cannot authenticate the other cohort's API or UI.
- Password registration and sign-in use OPAQUE. Login completion derives the account identity from the server-held OPAQUE exchange; client-supplied identity fields are not trusted.
- A `user` can also authenticate with a passkey or an enabled upstream OIDC connection. These methods create the same user-session shape, subject to email, account-status, OTP, organization, and key-state policy.
- Admin authentication is a separate OPAQUE flow for `admin_users`. User federation and user passkeys do not authenticate an admin.
- Authentication and encrypted-key unlock are independent. A session can be authenticated with `keyState: "locked"`; ZK key delivery cannot finalize until an allowed unlock method changes that state.

## Browser Sessions

- Server-side session records carry cohort identity, expiry, refresh-token state, and cohort-specific session data.
- Browser cookies are cohort-specific:
  - User: `__Host-DarkAuth-User`, `__Host-DarkAuth-User-Csrf`, `__Host-DarkAuth-User-Refresh`.
  - Admin: `__Host-DarkAuth-Admin`, `__Host-DarkAuth-Admin-Csrf`, `__Host-DarkAuth-Admin-Refresh`.
- Authentication and refresh cookies are `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/`. CSRF cookies use the same transport attributes but are readable by the UI for double-submit protection.
- State-changing first-party requests require the cohort's CSRF cookie and matching request token. Public authentication starts/finishes instead enforce same-origin requests; OAuth token-style endpoints use their protocol authentication.
- The normal session lifetime is 15 minutes. Refresh credentials last seven days and are stored only as hashes server-side.
- Refresh tokens are single-use, cohort- and session-bound, and rotated on use. Successful refresh reissues the short-lived authentication and CSRF cookies.
- First-party UIs use cookies for API authentication. They do not persist bearer access tokens as their normal session transport.
- A user session may hold one session unlock key (see [`user-key-management.md`](user-key-management.md#session-unlock)). Refresh rotation copies it to the new session; logout, expiry, password reset, SCIM deactivation, and any other session deletion destroy it.

## Sign-ins

- A sign-in is one authentication and every session refresh rotation descends from it. Its `signInId` is random, stored in session data, and carried across rotation.
- Session data records the sign-in's creation time, user agent, and last activity, written at refresh rotation only.
- Relying-party refresh sessions created by `/token` inherit the `signInId` of the browser session that authorized them, including sessions created later from an access token's `sid`.
- `GET /api/user/sessions` lists the user's active browser sign-ins (id, created, last active, expiry, user agent, `current`), excluding relying-party sessions. It never returns session ids, refresh tokens, or session unlock keys.
- `POST /api/user/sessions/{signInId}/revoke` deletes every session of that sign-in, including relying-party refresh sessions it authorized, which destroys its session unlock key. `POST /api/user/sessions/revoke-others` does the same for every sign-in except the current one. Both require user session and CSRF.

## Session Policy

- User session use checks the current account state. Deactivated SCIM-managed accounts cannot continue using old sessions.
- OPAQUE and passkey login evaluate every active organization membership. If any active organization has `force_otp = true`, the new session is partial until OTP succeeds.
- A selected organization controls organization-scoped claims and permissions, but switching organization does not bypass OTP policy.
- Password reset and SCIM deactivation revoke affected sessions and related authorization state.

## Logout

- First-party logout is `POST /api/user/logout` with user session and CSRF protection. It deletes the current session, clears user authentication, CSRF, and refresh cookies, and returns JSON.
- The advertised OIDC end-session endpoint is `GET /api/user/logout`.
- A valid `id_token_hint` is signature- and issuer-checked; its audience resolves the client. If `client_id` is also supplied, it must match that audience.
- `post_logout_redirect_uri` is accepted only as an exact match in that client's `postLogoutRedirectUris`. `state` is appended to the accepted redirect.
- With a valid ID-token hint, GET logout immediately ends the current DarkAuth SSO session and redirects.
- Without a valid hint, an active DarkAuth session is sent to a confirmation page. If no session is active, DarkAuth redirects directly to the validated target or its signed-out page.
- RP-initiated logout ends the DarkAuth session only. It does not call an upstream identity provider's logout endpoint or guarantee logout from other RP-local sessions.
