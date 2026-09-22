# Session-Bound Unlock

Status: implemented; browser verification pending

## Objective

Unlock ARK once per sign-in instead of once per tab, and stop re-asking for approval an app already has. Implements:

- [session unlock](../features/user-key-management.md#session-unlock)
- [sign-ins](../features/authentication-and-sessions.md#sign-ins) with portal list and revoke
- [remembered consent](../features/oidc-and-clients.md#remembered-consent)

## Verified current behavior

- `packages/user-ui/src/services/sessionKey.ts` keeps the OPAQUE `export_key` in a module-level `Map`. A new tab or reload loses it.
- `packages/user-ui/src/services/unlockedArk.ts` keeps unlocked ARK in a module-level `Map` with the same lifetime.
- `packages/user-ui/src/components/Authorize.tsx` unwraps the password envelope from the in-memory `export_key`. In a new tab it fails with "Missing export key" and shows the unlock picker, even though the session reports `keyState: "unlocked"`.
- `packages/api/src/services/sessions.ts` refresh rotation creates a new session row from the old session's `data` and deletes the old row, so values in `data` survive rotation.
- `packages/user-ui/src/services/drkStorageUsage.test.js` asserts memory-only custody and must change with this work.
- `packages/api/src/controllers/user/authorize.ts` auto-finalizes only non-ZK requests from the session that the same client created. There is no persisted consent and no sign-in list.
- `Authorize.tsx` "Choose another method" does not stop trusted-device approval polling, so a late approval can race a password unlock.
- `unlockWithCurrentPassword` maps any error containing `auth` or `OPAQUE` to "Current password is incorrect", including finalization failures such as an expired authorization request (5-minute `pending_auth`). A correct password can therefore report as wrong.

## Decisions

- The envelope holds ARK, not `export_key`, so password, passkey PRF, trusted-device, recovery, and new-key unlocks all benefit.
- The API generates the session unlock key and stores it in user session `data`; no new table.
- The unlock lasts as long as the sign-in, including refresh rotation (at most seven days idle). No separate idle limit.
- No per-sign-in "keep me unlocked" choice. SCIM policy `users.scim.allow_session_unlock` is the off switch.
- Sign-in lifetime unchanged: 15-minute session, 7-day idle refresh, no absolute cap.
- Relying-party CAK persistence across reloads is a separate follow-up once its design is agreed.

## Non-goals

- Changing relying-party custody; CAK delivery is unchanged.
- Admin UI session unlock.

## Checklist

### API

- [x] Add `sessionUnlockKey` to user `SessionData` in `packages/api/src/types.ts`.
- [x] Add `POST /crypto/session-unlock-key`: require a full user session and CSRF, create 32 random bytes if absent, return base64url.
- [x] Add `DELETE /crypto/session-unlock-key`.
- [x] Reject creation when the unlock policy disables session unlock; deletion always succeeds.
- [x] Register routes in `packages/api/src/http/routers/userRouter.ts` and schemas in OpenAPI.
- [x] Confirm `GET /session`, admin session views, audit capture, and logs never include `sessionUnlockKey`; add it to logger and audit redaction.
- [x] Add `allow_session_unlock` to `packages/api/src/controllers/user/unlockPolicy.ts`, backed by `users.scim.allow_session_unlock` (default `true`) in `packages/api/src/models/scimPolicy.ts` and settings seed.

### User UI

- [x] Add `packages/user-ui/src/services/sessionUnlock.ts`: `storeSessionArk`, `restoreSessionArk`, `clearSessionArk`, `clearAllSessionArks`. Import the key as a non-extractable AES-GCM `CryptoKey`; AAD binds `sub`, `key_id`, and version.
- [x] Call `storeSessionArk` after every unlock or key setup: password login, registration, passkey PRF, trusted-device approval, recovery, new keys, password change, and password recovery.
- [x] Restore on demand: when ARK is needed and not in memory, try `restoreSessionArk` before showing unlock UI.
- [x] Authorize: use restored ARK directly; stop depending on in-memory `export_key` for ZK finalization.
- [x] Clear on logout, session expiry, account switch, policy disabled, account-key rotation, and any restore failure.
- [x] Remove `export_key` custody that no longer has a caller once ARK restore covers every path.
- [x] Add `allow_session_unlock` to `packages/user-ui/src/services/unlockPolicy.ts`.

### Sign-ins

- [x] Add `signInId`, `signInCreatedAt`, `lastActiveAt`, and `userAgent` to user session data at every user sign-in path; refresh rotation carries them.
- [x] Add `GET /api/user/sessions`, `POST /api/user/sessions/{signInId}/revoke`, `POST /api/user/sessions/revoke-others`.
- [x] Portal Security: "Where you're signed in" list with sign out and sign out all others.

### Remembered consent

- [x] Add `user_client_consents` table and migration.
- [x] Record consent on approve in authorization finalization.
- [x] `authorize.ts`: auto-finalize when consent covers the request, ZK included.
- [x] User UI: auto-finalize ZK by restoring ARK; fall back to the normal screen when restore fails.
- [x] Add `GET /api/user/consents` and `DELETE /api/user/consents/{clientId}` (revokes that client's refresh sessions for the user).
- [x] Portal Security: "App approvals" list with revoke.

### Authorize fixes

- [x] Stop device-approval polling and clear its state when switching method.
- [x] Report password verification failures separately from finalization failures.
- [ ] An expired authorization request restarts authorization automatically. Today it shows "This sign-in request expired. Return to {app} and try again."
- [x] Stack the action buttons full-width, primary first.
- [x] Guard every browser storage access in the user UI; blocked or full storage shows an actionable message.
- [ ] Trace the reported local-storage error after switching from trusted-device approval to password. The unguarded `clearLegacyTokens` in `api.ts` is the leading suspect; not reproduced.

### Admin UI

- [x] Per-client `rememberConsent` setting (default on) in `ClientEdit.tsx`.

- [x] Add the `users.scim.allow_session_unlock` toggle beside the other SCIM unlock settings in `packages/admin-ui/src/pages/Settings.tsx`.

### Docs

- [x] Update `packages/docs/src/content/docs/security/drk.mdx`, `developers/key-management.mdx`, and `users/zero-knowledge.mdx` to describe session unlock and its trade-off.

### Remaining

- [x] OTP sign-ins: keep the password-derived key in memory across the OTP step and save the envelope after verification (`services/pendingUnlock.ts`).
- [ ] `/token/organization` creates a relying-party refresh session from a bearer token with no `parentSignInId`, so revoking a sign-in does not end it. Carry the sign-in id in the access token or the session lookup.
- [ ] Run the acceptance checks below in a browser and add a Playwright flow for the new-tab authorize scenario. The demo test harness serves DarkAuth and the demo on `localhost`, so the demo reuses DarkAuth's refresh cookie and never reaches `/authorize`; the flow needs distinct sites (for example two hostnames) to reproduce it.

## Acceptance checks

- Sign in on the portal, close the tab, open a relying party in a new tab, and authorize: no prompt, CAK delivered.
- Reload the portal after sign-in: key state stays unlocked with no prompt.
- After logout, the local envelope is gone and a restored copy of it cannot be decrypted (server key deleted).
- After refresh rotation, restore still succeeds.
- A fresh sign-in invalidates the previous sign-in's envelope; it is deleted and replaced.
- With `users.scim.allow_session_unlock = false`, no envelope is written and new tabs require an unlock method.
- A partial session (OTP pending) cannot obtain the session unlock key.
- Returning to an approved app with the same scopes redirects straight back with CAK; no screen shown.
- Revoking an app approval shows the approval screen next time.
- Signing out a sign-in from another browser makes that browser's next restore fail and show sign-in.

## Verification

- API tests for the endpoint (auth, CSRF, partial session, policy, rotation carry-over, deletion on logout and password reset).
- User UI tests replacing memory-only assertions in `drkStorageUsage.test.js` with: no plaintext ARK in storage, only the session envelope under `DarkAuth_session_ark:`.
- Playwright flow for the new-tab authorize scenario.
- Run `pnpm tidy` and `pnpm build`.
