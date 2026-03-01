# Email Verification and SMTP Settings

## Goal

Add first-class SMTP configuration and user email verification controls with these outcomes:
- Installer can prefill SMTP fields from root `.env` only.
- SMTP and `Require Email Verification` are managed in admin `/settings`.
- A new `Email` menu item manages editable email templates.
- Registration and login enforce verification when required.
- Email change requires verification of the new address before it becomes active.
- Verification behavior is safe by default and configurable.

## Confirmed Product Decisions

- Do not use dotenv; use Node `--env-file` / `--env-file-if-exists` only.
- `.env` values are installer prefills only, persisted settings must be stored in database.
- Installer prefill keys are exactly:
  - `EMAIL_FROM`
  - `EMAIL_TRANSPORT`
  - `EMAIL_SMTP_HOST`
  - `EMAIL_SMTP_PORT`
  - `EMAIL_SMTP_USER`
  - `EMAIL_SMTP_PASSWORD`
- `EMAIL_NOTIFICATION_TO` is not used.
- If SMTP details are provided during install, `users.require_email_verification` defaults to `true`.
- If SMTP details are not provided during install, `users.require_email_verification` defaults to `false`.
- If SMTP is later removed/disabled, do not auto-toggle `users.require_email_verification`.
- If verification is required but email sending is not available, self-registration should show: `Registration currently disabled`.
- Existing users become subject to enforcement at next login and follow a verify-email journey.
- Login for unverified users is blocked with a verify/resend flow.
- Email change uses pending email; current email remains active until verification succeeds.
- Verification token expiry must be configurable in admin `/settings`.
- Test email button sends to currently logged-in admin email.
- All outgoing email templates must be editable from new `Email` menu.

## Scope

### In Scope

- DB/schema changes for verification state and tokens.
- Settings additions for SMTP, verification toggle, and verification token expiry.
- Installer UI/API prefill and persistence for SMTP/verification defaults.
- User auth flow updates: registration, login gating, resend verification, verify by token.
- User email change flow with pending email and verification.
- Admin `/settings` controls for SMTP + verification + test email.
- Admin sidebar `Email` menu and new templates page.
- Template storage and rendering for all system-sent emails.
- Tests for settings behavior and end-to-end auth journeys.

### Out of Scope

- Automatic disabling/enabling of verification from later SMTP edits.
- Silent fallback that allows registration while verification is required but email transport fails.

## Data Model

### `users` table additions

- `email_verified_at` `timestamp null`
- `pending_email` `text null`
- `pending_email_set_at` `timestamp null`

Behavior:
- Registered user with required verification starts with `email_verified_at = null`.
- Verified user has non-null `email_verified_at`.
- During email change, current `email` remains active; new target lives in `pending_email`.

### New table: `email_verification_tokens`

Fields:
- `id` `uuid` primary key
- `user_sub` `text` fk -> `users.sub` cascade delete
- `purpose` `text` enum-like (`signup_verify`, `email_change_verify`)
- `target_email` `text` not null
- `token_hash` `text` unique not null
- `expires_at` `timestamp` not null
- `consumed_at` `timestamp null`
- `created_at` `timestamp` default now

Rules:
- Store only token hash, never plaintext token.
- Only unconsumed and unexpired token is valid.
- On consume, mark `consumed_at`.
- Resend creates a new token row and invalidates previous active rows for same user+purpose.

## Settings Keys

Add these settings rows via default seeding:

### Users

- `users.require_email_verification` (boolean)
  - Default at seed: `false`
  - Install completion updates value according to SMTP presence decision.

### Email / SMTP

- `email.transport` (string, default `"smtp"`)
- `email.from` (string)
- `email.smtp.host` (string)
- `email.smtp.port` (number)
- `email.smtp.user` (string)
- `email.smtp.password` (string, `secure: true`)
- `email.smtp.enabled` (boolean)

Default behavior:
- During install completion, if required SMTP fields exist, store SMTP values and set `email.smtp.enabled = true`; otherwise false.

### Email Verification

- `email.verification.token_ttl_minutes` (number, default `1440`)

Validation:
- TTL min 5, max 10080.
- Port min 1, max 65535.

## Installer Changes

## UI (`packages/admin-ui/src/pages/Install.tsx`)

Add an optional `Email (SMTP)` section with fields:
- From
- Transport
- Host
- Port
- User
- Password

Prefill source:
- Install GET endpoint returns a `prefill.email` object sourced from process env loaded by Node env-file flags.

Submit behavior:
- Installer POST includes SMTP form values.
- Server persists SMTP settings to DB.
- Server computes and persists `users.require_email_verification` default:
  - `true` if SMTP details provided and enabled.
  - `false` otherwise.

## API (`install` controllers)

- Extend install GET response schema with SMTP prefill payload.
- Extend install complete request schema to accept optional SMTP payload.
- Persist SMTP + verification default during install complete transaction.

## Admin Settings Changes (`/settings`)

Add under existing Settings page:

### Section: Email (SMTP)

Controls:
- `email.smtp.enabled`
- `email.from`
- `email.transport`
- `email.smtp.host`
- `email.smtp.port`
- `email.smtp.user`
- `email.smtp.password`

Actions:
- `Send test email` button.
- Sends test message to current admin session email.
- Disabled for read-only admins and when required SMTP fields are missing.

### Section: Users

Controls:
- `users.require_email_verification`
- `email.verification.token_ttl_minutes`

Behavior notes shown in UI copy:
- Existing unverified users will verify on next login.
- If verification is required but email is unavailable, self-registration is disabled.

## New Admin Page: `Email`

Navigation:
- Add sidebar item `Email` under System.
- Route suggestion: `/settings/email-templates` or `/email` (pick consistent Settings route style).

Purpose:
- Manage all outbound email templates.

Template inventory:
- Account verification (signup)
- Verification resend confirmation content
- Email change verification
- Password recovery email
- Any other email currently sent by backend
- Future templates must register here to stay complete

Per-template editable fields:
- Subject
- Body (plain text and/or HTML according to current email sender capabilities)
- Optional preview variables/help text

Storage:
- Store template config in settings (object key namespace `email.templates.*`) or dedicated table if needed for size/versioning.
- Must be editable via admin API and rendered by the email service.

## Auth and User Flow Changes

### Registration

- If `users.self_registration_enabled = false`: keep current behavior.
- If self-registration enabled and verification required but email sending unavailable:
  - Reject with user-visible message: `Registration currently disabled`.
- If registration allowed:
  - Create user.
  - If verification required:
    - mark unverified (`email_verified_at = null`)
    - issue signup verification token
    - send verification email
    - do not establish fully authenticated login session
  - If verification not required:
    - preserve existing auto-login behavior.

### Login

- On successful credential verification, check `users.require_email_verification`.
- If off: existing behavior.
- If on and `email_verified_at` is null:
  - deny normal login completion
  - return explicit state for client: unverified + resend allowed
  - show verify-email journey with resend action

### Resend verification

- New endpoint for authenticated-by-credentials unverified state or dedicated guarded flow.
- Rate limit by email/user.
- Mint fresh token and send email.

### Verify endpoint

- New public endpoint accepts token.
- Validate token hash, expiry, and consumed status.
- For `signup_verify`:
  - set `email_verified_at = now`
- For `email_change_verify`:
  - set `users.email = target_email`
  - clear pending fields
  - set `email_verified_at = now`
- Mark token consumed.
- Return success page/message and next step to login.

### Email change

- When user requests email update:
  - validate uniqueness
  - set `pending_email` and `pending_email_set_at`
  - mint `email_change_verify` token for `target_email`
  - send email to new address
  - keep current `email` active until verification

### Existing users when toggle turns on

- No migration lockout job required.
- At next successful login attempt, unverified users are sent through verify-email journey.

## Error Handling

User-facing messages:
- Registration blocked due to verification dependency: `Registration currently disabled`
- Login blocked due to verification: `Please verify your email to continue`
- Invalid/expired token: `Verification link is invalid or expired`

Audit events:
- `USER_EMAIL_VERIFICATION_SENT`
- `USER_EMAIL_VERIFICATION_RESENT`
- `USER_EMAIL_VERIFIED`
- `USER_EMAIL_CHANGE_REQUESTED`
- `USER_EMAIL_CHANGE_VERIFIED`

## Security

- Tokens must be random, high entropy, one-time, hashed at rest.
- Token URLs must include opaque token only.
- TTL enforced from setting.
- Resend and verify endpoints rate limited.
- Avoid account enumeration in resend and registration errors where applicable.

## API Changes Summary

New/updated API surfaces:
- `GET /api/install` add SMTP prefill payload.
- `POST /api/install/complete` accept SMTP payload and persist settings defaults.
- `POST /api/user/email/verification/resend`.
- `POST /api/user/email/verification/verify` (or `GET` callback route, then redirect).
- `PUT /api/user/profile/email` adapted to pending-email verification flow.
- `GET/PUT /api/admin/settings` include new keys.
- `POST /api/admin/settings/email/test` send test email to current admin.
- `GET/PUT /api/admin/email-templates` for template management.

## Frontend Changes Summary

### Install

- Add optional SMTP form block and prefill from install response.

### Admin Settings

- Add SMTP controls and test email button.
- Add `Require Email Verification` toggle and token expiry field.

### Admin Navigation and Templates Page

- Add `Email` menu item.
- Create templates CRUD UI.

### User Login/Register Screens

- Add unverified state screen with resend action.
- Surface registration-disabled error when verification required but SMTP unavailable.

## Testing Plan

### API tests

- Install stores SMTP + verification defaults correctly.
- Verification required with SMTP unavailable blocks registration.
- Registration emits token + email send when required.
- Login blocked for unverified user when required.
- Resend issues fresh token and invalidates prior active token.
- Verify token success/failure paths and expiry handling.
- Email change pending flow keeps old email active until verified.

### UI tests

- Install SMTP prefill and submit payload.
- Settings page shows SMTP, verification toggle, TTL.
- Test email sends to current admin email.
- Email menu renders templates page and saves templates.
- Login/register flows show correct verification journey and errors.

## Rollout Notes

- Add DB migration before application deploy.
- Deploy backend first, then admin UI.
- Ensure email sender is wired to template lookup before enabling verification in production.

## Implementation Checklist

- [x] Add DB columns to `users`: `email_verified_at`, `pending_email`, `pending_email_set_at`
- [x] Add `email_verification_tokens` table and indexes
- [x] Add setting keys for SMTP, verification toggle, and token TTL
- [x] Extend install GET to return SMTP prefills from env
- [x] Extend install complete to persist SMTP settings in DB
- [x] Compute install default for `users.require_email_verification` from SMTP presence
- [x] Add backend email service abstraction for SMTP send + test-send
- [x] Add admin settings endpoint support for test email action
- [x] Add admin `/settings` controls for SMTP + verification + TTL
- [x] Add sidebar `Email` menu item and route
- [x] Add admin email templates API and persistence
- [x] Add email templates UI for all outbound email types
- [x] Add signup verification token creation and email send
- [x] Add login gate for unverified users when verification required
- [x] Add resend verification endpoint and UI action
- [x] Add verification consume endpoint and success/error UX
- [x] Add pending-email verification flow for email change
- [x] Add audit events for verification-related actions
- [ ] Add API tests for install/settings/verification flows
- [ ] Add UI tests for settings/templates and auth journeys
- [x] Run `npm run tidy`
- [x] Run `npm run build`
