# Password Reset by Email

## Goal

Add a secure self-service forgotten-password flow for user accounts:
- Login page shows a `Forgot your password?` link when enabled.
- User requests a reset email without account enumeration.
- Email uses the editable admin email template system.
- Reset link lets the user set a new OPAQUE password without knowing the old password.
- Existing sessions and refresh tokens are revoked after a successful reset.
- The feature is controlled by admin settings and only works when outbound email is available.

This feature is account access recovery, not cryptographic data recovery. If a user no longer knows the old password, DarkAuth cannot decrypt old DRK-wrapped material from that old password. The reset flow must preserve this zero-knowledge boundary and route the user through key recovery or key regeneration after login.

## Current State

- SMTP settings and templated email sending already exist.
- Admin email templates already include `password_recovery`, but no backend flow sends it.
- User UI has no public forgot-password page or reset-token page.
- Existing `/password/recovery/verify/*` endpoints are old-password key recovery endpoints for DRK continuity after password changes. They are not email reset endpoints.
- Admins can mark users/admins as requiring password reset, and admins can set temporary passwords. This is separate from self-service email reset.

## Product Decisions

- Feature default: disabled unless explicitly enabled by an admin or install-time default.
- Enabling requires SMTP to be complete and `email.smtp.enabled = true`.
- User request response is always generic: `If an account exists, we sent reset instructions.`
- Reset links are single-use, short-lived, and store only hashed tokens.
- Reset does not automatically sign the user in. The user returns to login after success.
- OTP/MFA remains required on next login.
- Email verification remains separate. If email verification is enabled and the account email is unverified, the request endpoint still returns the generic response and should not send reset mail unless product explicitly chooses otherwise.
- Existing active sessions, refresh tokens, authorization codes, and pending OIDC auth requests for the user are invalidated after successful reset.
- Admin users are out of scope for the first implementation unless explicitly added later. If supported later, use a separate admin reset flow and table cohort, not the user login page.

## Scope

### In Scope

- DB migration for password reset tokens.
- Settings for enablement, token TTL, request throttling, and optional login-page visibility.
- Public API to request a reset email.
- Public API to start and finish OPAQUE reset registration with a reset token.
- User UI routes for request and reset-token forms.
- Login page link and branding wording support.
- Admin Settings controls.
- Admin Email Templates page support for reset email variables.
- Session/token invalidation after reset.
- Audit logging.
- API, model, and UI tests.

### Out of Scope

- Recovering encrypted data without the previous password.
- Automatically emailing temporary passwords.
- Allowing admins to view reset tokens.
- Resetting admin-user passwords from the user login page.
- Passwordless login or magic-link login.

## Data Model

### New table: `password_reset_tokens`

Fields:
- `id` `uuid` primary key
- `user_sub` `text` fk -> `users.sub` cascade delete
- `email` `text` not null
- `token_hash` `text` unique not null
- `expires_at` `timestamp` not null
- `consumed_at` `timestamp null`
- `created_at` `timestamp` default now
- `requested_ip_hash` `text null`
- `user_agent_hash` `text null`

Indexes:
- Unique index on `token_hash`.
- Index on `user_sub`.
- Index on `email`.
- Index on `expires_at`.
- Partial or composite index for active-token lookup by `user_sub` and `consumed_at`.

Rules:
- Store only a token hash, never the plaintext token.
- Generate token with at least 32 bytes of cryptographically secure random entropy.
- Hash token with SHA-256 plus an application/server-side pepper if available through existing config/KEK conventions.
- Only one active reset token per user should be valid. Creating a new token invalidates unconsumed prior tokens for the same user.
- Token consume must happen in the same transaction as password replacement.
- Expired/consumed tokens must never reveal which account they belonged to.

## Settings Keys

Add settings rows via default seeding:

### Users / Password Reset

- `users.password_reset_email_enabled` boolean, default `false`
- `users.password_reset_show_login_link` boolean, default `true`
- `users.password_reset_token_ttl_minutes` number, default `30`
- `users.password_reset_request_cooldown_minutes` number, default `5`
- `users.password_reset_max_requests_per_hour` number, default `3`

Validation:
- TTL min `5`, max `1440`.
- Cooldown min `1`, max `60`.
- Max requests per hour min `1`, max `20`.
- `users.password_reset_email_enabled` can only be set to `true` when email sending is available.

Behavior:
- If reset is disabled, public reset endpoints still return safe generic responses where appropriate.
- Login page link appears only when `users.password_reset_email_enabled = true` and `users.password_reset_show_login_link = true`.
- Public feature config should expose only whether the link should be shown, not detailed SMTP state.

## Email Template

Reuse the existing `email.templates.password_recovery` key as the password reset email.

Default label:
- `Password reset`

Default subject:
- `Reset your password`

Required variables:
- `name`
- `reset_link`
- `expires_minutes`

Optional variables:
- `email`
- `requested_at`
- `ip_hint`

Template behavior:
- Admin Email Templates page must show the variable list for `password_recovery`.
- Existing `recovery_link` variable should be migrated or supported as an alias for `reset_link` to avoid breaking customized templates.
- `signup_existing_account_notice` should point to the forgot-password route only when password reset is enabled. Otherwise it should continue pointing to login.

## Backend Flow

### Request reset email

Endpoint:
- `POST /api/user/password/reset/request`

Request:
```json
{
  "email": "user@example.com"
}
```

Response:
```json
{
  "success": true,
  "message": "If an account exists, we sent reset instructions."
}
```

Rules:
- Normalize email by trim + lowercase before lookup.
- Always return the same response for unknown users, disabled feature, unverified account policy, SMTP failures, and success.
- Rate limit by IP and normalized email.
- Apply per-account cooldown and hourly cap for existing accounts.
- Log detailed internal errors, but do not expose them to the client.
- If a user exists and sending is allowed:
  - invalidate any active reset tokens for that user
  - create a fresh token row
  - send `password_recovery` template with `reset_link`
  - log audit event

### Validate reset token

Endpoint:
- `GET /api/user/password/reset/token?token=...`

Response for valid token:
```json
{
  "valid": true,
  "email": "u***@example.com"
}
```

Response for invalid token:
```json
{
  "valid": false
}
```

Rules:
- This endpoint is optional but useful for UI state.
- It must not return full email, user id, name, or token metadata.
- It must apply rate limiting.

### Start OPAQUE reset registration

Endpoint:
- `POST /api/user/password/reset/start`

Request:
```json
{
  "token": "plaintext-reset-token",
  "request": "base64url-opaque-registration-request"
}
```

Response:
```json
{
  "message": "base64url-registration-response",
  "serverPublicKey": "base64url-server-public-key",
  "identityU": "user@example.com"
}
```

Rules:
- Validate token hash, expiry, and unconsumed state.
- Use the token's user email as `identityU`.
- Do not consume the token in start.
- Return a generic invalid-token error if token is invalid or expired.
- Rate limit by IP and token hash.

### Finish OPAQUE reset registration

Endpoint:
- `POST /api/user/password/reset/finish`

Request:
```json
{
  "token": "plaintext-reset-token",
  "record": "base64url-opaque-registration-record",
  "export_key_hash": "base64url-sha256-export-key"
}
```

Response:
```json
{
  "success": true
}
```

Rules:
- Validate token hash, expiry, and unconsumed state.
- Reject password reuse using existing `user_password_history` and `export_key_hash`.
- Finish OPAQUE registration using the token account email.
- Replace the user's `opaque_records` row.
- Insert the new `user_password_history` row.
- Mark `users.password_reset_required = false`.
- Mark token `consumed_at = now`.
- Invalidate all active user sessions and refresh tokens.
- Delete pending auth codes and pending OIDC auth requests for that user.
- Invalidate other active reset tokens for the same user.
- Write audit event.
- Return success and require normal login.

## Cryptographic Key Recovery Behavior

After email reset, the new password produces a new OPAQUE export key. Existing DRK wrapping may be under the old export key.

Required user experience:
- On next login/authorization, if wrapped DRK cannot be unwrapped with the new export key, show the existing key recovery panel.
- User can recover data with old password if remembered.
- User can generate new keys if old password is unavailable.
- UI copy must clearly state that generating new keys may make old encrypted content unavailable unless another recovery path exists.

Backend behavior:
- Do not delete `wrapped_drk`, `wrapped_enc_private_jwk`, encryption public keys, or old opaque history during reset.
- Preserve enough existing opaque history for the current old-password recovery flow to work.
- Do not expose previous password verifier data except through the existing authenticated key recovery flow.

## User UI Changes

### Login page

- Add `Forgot your password?` link under the password field or below the submit button.
- Show only when public config says password reset is enabled and visible.
- Use branding wording key `forgotPassword`, already present, or add a dedicated `forgotPasswordLink` if needed.

### Forgot password page

Route:
- `/forgot-password`

Fields:
- Email

Behavior:
- Submit calls `POST /api/user/password/reset/request`.
- Always show generic success copy.
- Provide link back to login.
- Disable submit while loading.

### Reset password page

Route:
- `/reset-password?token=...`

Fields:
- New password
- Confirm password

Behavior:
- Validate minimum password length client-side consistently with existing reset/change forms.
- Optionally call token validation endpoint for early invalid/expired display.
- Run OPAQUE registration start/finish with reset token.
- Show success page with link back to login.
- Never auto-login.
- Clear password and OPAQUE state from memory after success/failure.

## Admin UI Changes

### Settings

Add a `Users / Password Reset` or `Email / Password Reset` section with:
- Enable email password reset
- Show forgot-password link on login page
- Token TTL minutes
- Request cooldown minutes
- Max requests per hour

Behavior:
- Disable or block enablement when SMTP settings are incomplete or disabled.
- Show concise explanatory text that reset restores account access but cannot recover encrypted data without old password.
- Read-only admins cannot edit.

### Email Templates

Update `password_recovery` template metadata:
- Label: `Password reset`
- Description: `Sent when a user requests a password reset.`
- Variables: `name`, `email`, `reset_link`, `recovery_link`, `expires_minutes`, `requested_at`, `ip_hint`

## Admin-Triggered Reset Interaction

Keep existing admin flows:
- Mark user as requiring reset.
- Set temporary password.

Optional enhancement:
- Add `Send password reset email` action to user row/detail page.
- This action should call the same token creation service as the public request endpoint.
- It must require write admin role.
- It should show success/failure to the admin and audit `ADMIN_USER_PASSWORD_RESET_EMAIL_SENT`.
- It should still not reveal or display the reset token.

## API and Service Structure

Suggested backend modules:
- `models/passwordResetTokens.ts`
- `services/passwordReset.ts`
- `controllers/user/passwordResetRequest.ts`
- `controllers/user/passwordResetToken.ts`
- `controllers/user/passwordResetStart.ts`
- `controllers/user/passwordResetFinish.ts`

Shared service responsibilities:
- normalize email
- check settings and email availability
- enforce cooldown/caps
- create/hash tokens
- render/send email template
- validate/consume token
- complete OPAQUE reset transaction
- invalidate sessions and grants
- audit events

Avoid duplicating OPAQUE registration logic. Reuse the existing password set/change model patterns where possible, but keep the no-current-password reset authorization tied strictly to the reset token.

## Security Requirements

- No account enumeration from request, validation, resend, disabled feature, or SMTP error paths.
- Tokens must be high entropy, one-time, short-lived, and hashed at rest.
- Token value must appear only in the email link and request body.
- Never log plaintext tokens.
- Rate limit:
  - request endpoint by IP
  - request endpoint by normalized email
  - token validation/start/finish by IP and token hash
- Invalidate older reset tokens whenever a new token is issued.
- Invalidate sessions and refresh tokens after successful reset.
- Require CSRF protection for same-origin POSTs where the existing user router expects it, but avoid requiring an existing login session.
- Do not accept client-supplied email/user id during reset start/finish.
- Do not weaken OPAQUE identity binding. `identityU` must come from server-side token lookup.
- Preserve MFA requirements after reset.
- Keep timing and response differences small enough to avoid obvious enumeration.
- Audit successful sends, successful resets, invalid-token attempts above threshold, rate-limited attempts, and SMTP failures.

## Audit Events

Add or reuse event names:
- `USER_PASSWORD_RESET_REQUESTED`
- `USER_PASSWORD_RESET_EMAIL_SENT`
- `USER_PASSWORD_RESET_EMAIL_SKIPPED`
- `USER_PASSWORD_RESET_TOKEN_INVALID`
- `USER_PASSWORD_RESET_COMPLETED`
- `USER_PASSWORD_RESET_RATE_LIMITED`
- `ADMIN_USER_PASSWORD_RESET_EMAIL_SENT` optional

Audit payloads should not include plaintext tokens or full sensitive request metadata.

## Error Handling

User-facing messages:
- Request submitted: `If an account exists, we sent reset instructions.`
- Invalid token: `This password reset link is invalid or expired.`
- Reused password: `Choose a password you have not used before.`
- SMTP disabled on direct reset page/request path: use generic request response; admin settings can show precise SMTP errors.
- Reset success: `Your password has been reset. Sign in with your new password.`

Internal errors:
- SMTP send failures should be logged and audited.
- Token creation failures should return generic request response when possible.
- OPAQUE finish failures should return a validation error without consuming the token unless the token itself is invalid.

## Testing Plan

### Model and service tests

- Token generation stores only hash.
- Token validation accepts active token and rejects consumed/expired/unknown tokens.
- Creating a new token invalidates previous active tokens for the same user.
- Request cooldown and hourly cap work per user/email.
- Unknown email request returns generic success and sends no email.
- Disabled feature returns generic success and sends no email.
- SMTP unavailable path returns generic success and logs/audits internally.
- Finish consumes token and updates OPAQUE record atomically.
- Reused password hash is rejected.
- Consumed token cannot be reused.
- Sessions and refresh tokens are invalidated after reset.

### API tests

- `POST /password/reset/request` generic response for existing and unknown emails.
- Request endpoint sends `password_recovery` template with correct variables.
- `GET /password/reset/token` valid/invalid responses do not expose account data.
- `POST /password/reset/start` binds `identityU` to token account email.
- `POST /password/reset/finish` resets password and requires normal login after success.
- Old password fails login after reset.
- New password succeeds login after reset.
- OTP requirement remains enforced after reset.
- Email verification policy for unverified accounts follows product decision.
- Rate limits return appropriate status without revealing account existence.

### UI tests

- Login link appears when enabled and hidden when disabled.
- Forgot-password page shows generic success for submitted email.
- Reset page handles missing, invalid, expired, and valid token states.
- Reset page validates password confirmation.
- Successful reset redirects or links back to login.
- Admin Settings validates SMTP dependency before enabling reset.
- Email Templates page exposes reset variables and saves customized template.
- Key recovery panel appears after reset when existing wrapped DRK cannot be unwrapped with the new password.

### End-to-end tests

- Configure SMTP test transport or mock sender.
- Register user.
- Request password reset.
- Extract reset link from captured email.
- Set new password.
- Confirm old password no longer works.
- Confirm new password works.
- Confirm all pre-reset sessions are invalid.
- Confirm encrypted-data recovery path appears and old-password recovery still works if the old password is supplied.

## Rollout Notes

- Ship DB migration before enabling the setting.
- Keep `users.password_reset_email_enabled = false` by default for existing installs.
- Existing customized `password_recovery` templates may use `recovery_link`; support aliasing during rollout.
- Update documentation to clarify the distinction between password reset and encrypted data recovery.
- Consider adding a one-time admin notice after deploy that SMTP must be configured before email reset can be enabled.

## Implementation Checklist

- [x] Add `password_reset_tokens` table and indexes
- [x] Add settings defaults and validation
- [x] Expose safe public feature flag for login link visibility
- [x] Add password reset token model
- [x] Add password reset service
- [x] Add request endpoint
- [x] Add optional token validation endpoint
- [x] Add OPAQUE reset start endpoint
- [x] Add OPAQUE reset finish endpoint
- [x] Add session/refresh-token/grant invalidation after reset
- [x] Wire `password_recovery` template sending with `reset_link`
- [x] Update Email Templates metadata and alias `recovery_link`
- [x] Add admin settings controls
- [x] Add login page forgot-password link
- [x] Add forgot-password page
- [x] Add reset-password token page
- [x] Add optional admin `Send password reset email` action
- [x] Add audit events
- [x] Add model/service/API tests
- [x] Add UI and end-to-end tests
- [x] Run `npm run tidy`
- [x] Run `npm run build`
