# OTP and passkeys

## TOTP Contract

- DarkAuth supports TOTP for both `user` and `admin` cohorts. OTP records are cohort-bound; an admin OTP cannot satisfy a user session and vice versa.
- Setup generates a secret and provisioning URI, then requires a valid TOTP before activation. The secret is encrypted at rest with the server KEK.
- Setup completion returns one-time backup codes. Backup codes are stored as Argon2 hashes, can each be consumed once, and are never recoverable from storage.
- Verification applies configured timestep skew, rejects replay of an already-used timestep, counts failures, and enforces temporary lockout and endpoint rate limits.
- A completed MFA session is represented in issued identity claims with password and OTP authentication methods and an MFA `acr`.

## OTP Policy

- Global OTP enablement gates OTP behavior.
- Admin OTP requirement is controlled by the admin OTP policy.
- User OTP requirement is organization-based: login checks all active memberships, and any membership whose organization has `force_otp = true` requires OTP.
- `organizations.force_otp` defaults to `false`, including for the default organization. It can be changed through organization administration.
- If OTP is required and no verified OTP configuration exists, the user must complete setup. If one exists, the login session remains partial until `/api/user/otp/verify` succeeds.
- Changing the selected organization does not erase an OTP requirement established by another active membership.

## Passkey Authentication

- Passkey registration requires an authenticated user session. Login is discoverable and does not require an email or username before the WebAuthn ceremony.
- Challenges are short-lived, server-stored, typed as registration or authentication, and consumed only by the matching ceremony.
- Registration and authentication validate expected origin, RP ID, challenge, credential public key, and signature counter.
- WebAuthn requests set user verification to `preferred`, and server verification uses `requireUserVerification: false`. User verification is recorded when supplied but is not required for a valid DarkAuth passkey ceremony.
- Credentials record transports, counters, backup eligibility/state, observed user verification, PRF support, label, use time, and revocation state. A revoked credential cannot sign in.
- Successful passkey login creates normal user session and refresh cookies and evaluates email/account, organization force-OTP, and SCIM policy just like password login.

## Passkey PRF and Key Unlock

- A passkey can be authentication-only or authentication plus encryption-key unlock.
- Registration requests the WebAuthn PRF extension when available. Capability alone does not make the credential an unlock method.
- A PRF passkey becomes an unlock method only after the browser confirms a real PRF result and stores a client-created envelope wrapping the account key. The server stores the encrypted envelope, salt, AAD, and metadata, never the PRF output or plaintext key.
- Login requests PRF evaluation for eligible credentials. A confirmed result for a credential with a valid envelope returns the material needed for client-side unwrap and permits the session key state to become unlocked.
- If PRF is absent, unsupported, inconsistent on another device, or has no envelope, passkey authentication can still succeed with `keyState: "locked"`. ZK authorization then requires another unlock method.
- Credential revocation also removes that credential as a future authentication and PRF-unlock path; users must retain another recovery or unlock method before relying on ZK data.
