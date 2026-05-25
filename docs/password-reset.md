# Email Password Reset

DarkAuth supports self-service password reset for user accounts when outbound email is configured.
The flow restores account access only; it does not decrypt user data that was wrapped under the
previous OPAQUE export key.

## Admin Setup

1. Configure SMTP in Admin Settings under `Email / SMTP`.
2. Enable `email.smtp.enabled`.
3. Enable `users.password_reset_email_enabled` under `Users / Password Reset`.
4. Keep `users.password_reset_show_login_link` enabled to show the login-page link.
5. Review `email.templates.password_recovery` under Admin Email Templates.

Password reset cannot be enabled until SMTP sending is available. The setting remains disabled by
default for existing and new installs.

## Settings

- `users.password_reset_email_enabled`: enables email reset requests when SMTP is available.
- `users.password_reset_show_login_link`: controls the `Forgot your password?` login-page link.
- `users.password_reset_token_ttl_minutes`: reset link lifetime, from 5 to 1440 minutes.
- `users.password_reset_request_cooldown_minutes`: per-account cooldown, from 1 to 60 minutes.
- `users.password_reset_max_requests_per_hour`: per-account hourly cap, from 1 to 20 requests.

The public `/config.js` exposes only whether the link should be visible. It does not expose SMTP
state or detailed reset configuration.

## User Flow

1. User opens `/forgot-password`.
2. User submits an email address.
3. DarkAuth always returns `If an account exists, we sent reset instructions.`
4. If the account exists, the feature is enabled, SMTP works, and email policy allows it, DarkAuth
   creates a single-use reset token and sends `email.templates.password_recovery`.
5. User opens `/reset-password?token=...`.
6. The UI validates the token, runs OPAQUE reset registration start/finish, and returns the user to
   login after success.

The reset flow never logs the user in automatically. Existing OTP requirements still apply on the
next login.

## Admin-Triggered Reset Email

Write admins can send a reset email from a user detail page or call:

- `POST /admin/users/{userSub}/password/reset-email`

This uses the same reset-token creation and `password_recovery` template as the public request flow.
The admin never sees the plaintext reset token. The action requires password reset and SMTP sending
to be enabled and writes `ADMIN_USER_PASSWORD_RESET_EMAIL_SENT` audit events.

## API Endpoints

User API endpoints live under `/api/user` internally and are served from the user origin:

- `POST /api/user/password/reset/request`
- `GET /api/user/password/reset/token?token=...`
- `POST /api/user/password/reset/start`
- `POST /api/user/password/reset/finish`

Request responses are designed to avoid account enumeration. Invalid, unknown, disabled, unverified,
and SMTP-failure request paths return the same generic response.

## Token Storage and Invalidation

Reset tokens are generated with high entropy and only stored as HMAC-SHA-256 hashes using the
server-side KEK passphrase when available. Creating a new token consumes any other active token for
that user.

Successful reset happens in one transaction:

- Consume the reset token.
- Replace the OPAQUE record.
- Store password history hash for reuse checks.
- Clear `users.password_reset_required`.
- Consume other active reset tokens for the user.
- Delete active user sessions, authorization codes, and pending authorization requests.

## Email Template

The reset email uses `email.templates.password_recovery`.

Supported variables:

- `name`
- `email`
- `reset_link`
- `recovery_link`
- `expires_minutes`
- `requested_at`
- `ip_hint`

`recovery_link` is kept as an alias for `reset_link` so existing customized templates continue to
work.

## Zero-Knowledge Recovery Boundary

Email password reset creates a new OPAQUE password record and a new password-derived export key. It
does not recover old encrypted material by itself.

If an app depends on wrapped DRK or wrapped private-key material, users may need to complete the
existing old-password recovery flow after signing in with the new password. If the old password is
not available, the user can generate new keys, but old encrypted content may remain unavailable
unless another recovery path exists.

## Audit and Security

DarkAuth writes audit events for reset email sends, skipped sends, SMTP failures, invalid-token
attempts, completed resets, and rate-limited requests. Plaintext reset tokens are never logged or
shown to admins.
