# Change Account Details

## Goal

Let a signed-in user manage their own account details from the user portal instead of seeing a read-only profile card. The Profile page should answer obvious user questions:

- How do I change my name?
- How do I change my email?
- Is a new email waiting for verification?
- What happens to my sign-in if I change the email I use to log in?

This work is about self-service profile editing. Organization management and password changes stay in their existing areas unless the flow needs to link to them.

## Current State

The user Profile page at `packages/user-ui/src/components/Profile.tsx` renders name, email, user id, organizations, and session actions. Name and email are display-only.

The frontend API client already has `requestEmailChange(email)` in `packages/user-ui/src/services/api.ts`, calling `PUT /api/user/profile/email`.

The backend already has an email-change verification path:

- `PUT /api/user/profile/email` in `packages/api/src/controllers/user/profileEmailUpdate.ts`
- `POST /api/user/email/verification/verify` in `packages/api/src/controllers/user/emailVerificationVerify.ts`
- `POST /api/user/email/verification/resend` in `packages/api/src/controllers/user/emailVerificationResend.ts`
- pending-email storage and token application in `packages/api/src/services/emailVerification.ts`
- `users.pending_email`, `users.pending_email_set_at`, and `users.email_verified_at` in `packages/api/src/db/schema.ts`

The verification spec in `specs/EMAIL_VERIFICATION.md` already says email change should keep the current email active until verification succeeds.

There is no current self-service user endpoint for changing `name`. Admins can update name and email through `PUT /api/admin/users/{sub}` via `packages/api/src/controllers/admin/userUpdate.ts`, but that is not a user portal flow.

`GET /api/user/session` returns `sub`, `email`, `name`, auth state, key state, and organization context. It does not currently expose `emailVerifiedAt`, `pendingEmail`, or `pendingEmailSetAt`, so the Profile UI cannot show a pending email state after reload.

## What We Are Trying To Do

Turn the Profile page into a clear account details management surface:

- Name is editable in place with Save and Cancel.
- Email has a dedicated change flow because it is a sign-in identifier.
- If email verification is enabled, entering a new email creates a pending email and sends a verification link. The current email remains active until the link is clicked.
- If email verification is not enabled and product allows direct email change, the change still needs a safe re-auth and OPAQUE compatibility decision before the current email is replaced.
- The user can see when a pending email exists and resend or cancel it.
- The page refreshes session/profile state after changes so the header and Profile page remain consistent.

The UX should be simple:

1. Profile shows Account details with inline Edit actions.
2. Editing name opens a small form in the same section.
3. Changing email opens a focused form explaining that the current email remains active until verification.
4. After submitting an email change, the page shows `Verification sent to new@example.com` with Resend and Cancel actions.
5. When the verification link is clicked, the existing `/verify-email?token=...` page completes the change and tells the user to sign in with the new email if the current session is stale.

## Important Identity Constraint

Email is currently used as the OPAQUE login identity. Registration calls `finishRegistration(record, email)`, and login start fetches the user by email before starting OPAQUE with that email as `identityU`.

Before allowing direct email replacement, we must confirm one of these approaches:

- OPAQUE records are safe to reuse when `identityU` changes.
- Email change also migrates or re-enrolls the OPAQUE record.
- The system separates login identity from contact email, preserving the original OPAQUE identity unless the user completes a password re-enrollment.

This is resolved by storing a separate preserved OPAQUE sign-in identity. Verified email change updates the account contact email and clears the pending email state, but password sign-in remains bound to the existing OPAQUE identity until the user completes a password re-enrollment flow. The Profile UI exposes the separate password sign-in email when it differs from the contact email.

## UX Requirements

### Profile Page

- Replace the read-only account details list with editable rows.
- Keep the page clean: no large modal for simple name edits.
- Use the existing portal card/list styling and shared button controls.
- Show one primary action per editing state.
- Keep mobile-first layout: labels and values stack cleanly, controls stay full-width on small screens, and long emails/user ids do not overflow.

### Name Change

- User clicks `Edit` on the Name row.
- Form fields:
  - Name
- Actions:
  - Save
  - Cancel
- Empty name is allowed only if product decides display name is optional. Otherwise require a non-empty trimmed value.
- Successful save updates session/profile state and the header.

### Email Change

- User clicks `Change` on the Email row.
- Form fields:
  - New email
- Copy:
  - Explain that the current email stays active until the new email is verified.
- Actions:
  - Send verification
  - Cancel
- On submit:
  - Validate email format client-side and server-side.
  - Reject same email.
  - Reject email already used by another user.
  - Send verification to the new email.
  - Keep current email shown as active.
  - Show pending email state.

### Pending Email State

- Show:
  - Current email
  - Pending email
  - When the verification was requested, if available
- Actions:
  - Resend verification
  - Cancel pending change
- Resend should send another email-change verification token to the pending email.
- Cancel should clear `pending_email` and `pending_email_set_at`.

### Verification Result

- Reuse `/verify-email?token=...`.
- For email change success, copy should say the email address was changed.
- If the active session still contains old email data, the app should refresh the session or ask the user to sign in again.
- Invalid and expired tokens should keep the existing safe error copy.

## API Requirements

### Existing Endpoint To Keep

`PUT /api/user/profile/email`

Current behavior requests pending-email verification. Keep this behavior when verification is enabled.

Recommended response:

```json
{
  "success": true,
  "message": "Please verify your new email to complete the change",
  "pendingEmail": "new@example.com",
  "pendingEmailSetAt": "2026-05-30T19:00:00.000Z"
}
```

### New User Name Endpoint

`PUT /api/user/profile`

Request:

```json
{
  "name": "Mark"
}
```

Response:

```json
{
  "sub": "user-sub",
  "email": "mark@example.com",
  "name": "Mark",
  "pendingEmail": null,
  "emailVerified": true
}
```

This endpoint should only update self-service-safe profile fields. It must not accept permissions, organization memberships, email directly, key state, or admin-only fields.

### Profile Read Shape

Either extend `GET /api/user/session` or add `GET /api/user/profile`.

Required fields:

```json
{
  "sub": "user-sub",
  "email": "mark@example.com",
  "name": "Mark",
  "emailVerified": true,
  "pendingEmail": "new@example.com",
  "pendingEmailSetAt": "2026-05-30T19:00:00.000Z"
}
```

Recommendation: add `GET /api/user/profile` for account detail state and keep `/session` focused on session/auth routing. If the header needs updated name/email immediately after save, refresh both profile and session or update session data server-side.

### Pending Email Actions

Add:

- `POST /api/user/profile/email/resend`
- `DELETE /api/user/profile/email/pending`

`POST /api/user/profile/email/resend` should resend only for the authenticated user's current pending email. It should not accept an arbitrary email in the request body.

`DELETE /api/user/profile/email/pending` should clear the authenticated user's pending email fields and invalidate active `email_change_verify` tokens.

## Security Requirements

- Require an authenticated user session for all profile mutation endpoints.
- Use CSRF protection through the existing user API request path.
- Rate limit email-change request and resend endpoints.
- Store only hashed verification tokens.
- Never reveal whether an email belongs to another account beyond the existing authenticated conflict message.
- Audit:
  - `USER_PROFILE_NAME_UPDATED`
  - existing `USER_EMAIL_CHANGE_REQUESTED`
  - existing `USER_EMAIL_CHANGE_VERIFIED`
  - `USER_EMAIL_CHANGE_CANCELLED`
  - `USER_EMAIL_CHANGE_VERIFICATION_RESENT`
- Decide whether email change needs password re-auth before submission. If direct email replacement is allowed without re-auth, document why this is acceptable.
- Confirm OPAQUE behavior before marking email change complete.

## Testing Requirements

- API tests for name update validation, persistence, and session refresh behavior.
- API tests for email change request, pending state, resend, cancel, verification, expiry, and conflict.
- OPAQUE login regression test:
  - register with old email
  - request email change
  - verify new email
  - login with new email succeeds
  - login with old email fails or follows the expected product decision
- User UI tests for Profile edit name and email pending state.
- Mobile screenshots or Playwright assertions for Profile account rows and actions.

## Implementation Checklist

### Product Decisions

- [x] Decide whether user display name can be blank or must be non-empty.
- [x] Decide whether email change requires password re-auth before sending verification.
- [x] Decide whether email can change immediately when email verification is disabled.
- [x] Decide and document how OPAQUE login identity is handled when email changes.

### Backend

- [x] Add `GET /api/user/profile` or extend `GET /api/user/session` with `emailVerified`, `pendingEmail`, and `pendingEmailSetAt`.
- [x] Add `PUT /api/user/profile` for self-service name updates only.
- [x] Return pending email metadata from `PUT /api/user/profile/email`.
- [x] Add `POST /api/user/profile/email/resend` for authenticated pending email resend.
- [x] Add `DELETE /api/user/profile/email/pending` for cancelling pending email change.
- [x] Invalidate active `email_change_verify` tokens when cancelling pending email.
- [x] Refresh or rotate current session data after name change and verified email change.
- [x] Add audit events for name update, pending email cancel, and pending email resend.
- [x] Add rate limits for email change request and resend.
- [x] Verify and fix OPAQUE email-change login behavior.

### User UI

- [x] Replace read-only name row with inline edit state.
- [x] Add frontend API method for self-service profile update.
- [x] Add frontend API methods for pending email resend and cancel.
- [x] Add email change form to Profile.
- [x] Show current email and pending email separately.
- [x] Show success, loading, validation, and server-error states.
- [x] Refresh profile/session state after save, resend, cancel, and verification completion.
- [x] Keep Profile controls full-width on mobile and aligned with shared portal spacing.

### Verification Page

- [x] Detect email-change verification success copy separately from signup verification if backend returns purpose.
- [x] Refresh active session/profile after successful email-change verification when possible.
- [x] Show a clear next action after verified email change.

### Tests

- [x] Add API tests for self-service name update.
- [x] Add API tests for pending email read, resend, cancel, and verification.
- [x] Add OPAQUE login regression coverage for changed email.
- [x] Add user UI tests for Profile name edit.
- [x] Add user UI tests for Profile email change pending state.
- [x] Add responsive tests for Profile account details controls.
- [x] Run `npm run tidy`.
- [x] Run `npm run build`.
