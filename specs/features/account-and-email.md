# Account and email

## Account Profile

- `GET /api/user/profile` returns the signed-in user's subject, name, current email, verification state, pending email state, and sign-in email.
- `PUT /api/user/profile` changes the display name and updates active user sessions so first-party UI state remains consistent.
- Email addresses used for lookup and changes are trimmed and lowercased.

## Email Verification

- Email delivery and verification policy are database settings managed by an admin. Enabling verification does not silently bypass unavailable SMTP.
- When verification is required, registration creates an unverified account, issues a hashed, expiring, single-use verification token, sends the configured template, and withholds a full authenticated session.
- Successful password verification for an unverified account is gated into the verification journey rather than a normal signed-in session.
- Verification and resend responses avoid disclosing whether an arbitrary address belongs to an account.
- Tokens are stored only as hashes. A token is valid only for its recorded user, target address, purpose, expiry, and unconsumed state. Resend invalidates earlier active tokens for the same purpose.

## Email Change

- `PUT /api/user/profile/email` starts an email change for an authenticated user. The requested address is stored as `pendingEmail`; the existing address remains the active sign-in address until verification.
- `POST /api/user/profile/email/resend` replaces and resends the pending verification token.
- `DELETE /api/user/profile/email/pending` cancels the pending change.
- Completing an `email_change_verify` token atomically promotes the target address and clears pending state. Duplicate addresses and stale, expired, or consumed tokens are rejected.
- Name and email changes are separate operations. A display-name update never changes the OPAQUE identity.

## Password Change and Reset

- An authenticated password change first verifies the existing OPAQUE password, then registers the replacement OPAQUE record.
- When the old password is available, the UI can rewrap password-protected key material for continuity; the server never receives plaintext account keys.
- Email password reset is a public three-part flow: request, validate/start, and OPAQUE reset finish under `/api/user/password/reset/*`.
- Reset requests always return the same generic result for existing and unknown accounts. Sending is subject to feature enablement, verified-account policy, SMTP availability, cooldowns, and rate limits.
- Reset tokens are random, hashed at rest, expiring, and single-use. Reset finish replaces the user's OPAQUE record and revokes their active sessions, refresh credentials, authorization codes, and pending authorizations.
- Password reset does not sign the user in and does not decrypt key material wrapped by the forgotten password. The next login can require OTP and a recovery key, PRF passkey, trusted-device approval, or new-key setup before ZK use.

## Email Templates and Secrets

- Verification, email-change, password-recovery, and other outbound messages use admin-editable templates with an explicit variable allowlist.
- SMTP credentials are protected settings and are not returned in plaintext by normal settings reads.
- Public failures use non-enumerating messages; operational delivery errors are retained for audit and server logs rather than exposed to the requester.
