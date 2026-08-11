# OTP, email, and account recovery

Status: completed

## Delivered

- [x] Add TOTP enrollment and verification, backup codes, recovery, and admin policy controls.
- [x] Enforce OTP during login and identity-sensitive account changes, including organization-aware policy.
- [x] Add SMTP-backed email verification with user/admin flows and authentication gating.
- [x] Add email password reset without claiming recovery of encrypted keys that the reset cannot unlock.
- [x] Add self-service account profile updates and manual email verification controls.
- [x] Cover OTP bypass, backup-code replay, verification, password reset, and recovery behavior in tests.

## Evidence

- OTP backend and UI: commits `fcb33e1`, `dd7872f`, `8a4c604`; management follow-up `5adab5a`.
- OTP security fixes: PRs #120 (`acc01ee`), #121 (`391daa5`), and #122 (`edda39a`).
- Email verification: PR #117 (`2cd2344`).
- Password reset: PR #132 (`13536e1`).
- Self-service profile updates: PR #146 (`fa5a72c`).
