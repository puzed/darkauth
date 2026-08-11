# Token Authentication Claims

Status: verified implementation gaps

## Objective

Make ID-token identity and authentication claims reflect persisted verification state and the authentication methods that produced the authorization session.

## Verified current behavior

- `packages/api/src/controllers/user/token.ts` builds `email_verified` as `!!data.email`. Any non-empty email is therefore claimed as verified even when `users.email_verified_at` is null.
- The same controller emits `amr = ["pwd"]` in authorization-code paths regardless of whether authentication came from federation, passkey, or an existing session.
- Refresh issuance reconstructs `amr` as `['pwd']` or `['pwd', 'otp']` from `otpVerified` rather than propagating the original authentication methods.
- `buildUserIdTokenClaims` emits `acr = "mfa"` whenever `amr` exists, including password-only authentication. This both mislabels the assurance level and differs from the MFA identifier documented elsewhere.

## Required behavior

- `email_verified` is derived from non-null `email_verified_at`, not email presence.
- The authentication boundary records normalized methods on the session or authorization code, for example `pwd`, `otp`, `federated`, or `passkey` as actually completed.
- Authorization-code and refresh-token issuance propagate the recorded `amr`; they do not invent password authentication.
- Refresh preserves the original authentication context and adds only methods proven by a later step-up.
- `acr` is omitted when no assurance level was evaluated. When MFA policy is satisfied, it uses one documented value consistently, such as `urn:ietf:params:acr:mfa`.
- Userinfo and ID-token `email_verified` remain consistent for the same user state.

## Checklist

- [ ] Add `emailVerifiedAt` to every user lookup used for ID-token issuance.
- [ ] Change the ID-token claim builder to accept explicit verified state.
- [ ] Add tests for present-but-unverified email and verified email.
- [ ] Define normalized `amr` values for password, OTP, federation, passkey, recovery, and session reuse.
- [ ] Persist authentication methods and evaluated assurance at login/step-up boundaries.
- [ ] Bind the authentication context to authorization codes and refresh sessions.
- [ ] Remove hard-coded `['pwd']` values from token grant paths.
- [ ] Propagate accurate `amr` through authorization-code and refresh grants.
- [ ] Emit `acr` only from evaluated assurance, using the documented MFA identifier consistently.
- [ ] Add password-only, password-plus-OTP, federation, passkey, session-reuse, and refresh regression tests.
- [ ] Verify OIDC discovery and userinfo documentation use the same claim semantics.

## Verification

- Run focused API token, OAuth endpoint, federation, passkey, and OTP tests.
- Decode issued ID tokens in tests and assert exact `email_verified`, `amr`, and `acr` values.
- Run `pnpm tidy` and `pnpm build` after implementation.
