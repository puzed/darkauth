# User portal

## Purpose and session

- The user portal is the first-party account surface on the user origin. It is separate from the admin portal and uses the user session cohort.
- The shell exposes Apps, Security, and Profile, plus the current organization and organization switcher.
- A valid user session is refreshed while active. Logout clears the user session and supports the OIDC logout continuation when present.
- Partial sessions route users through required password reset, email verification, OTP, or key-unlock work before protected actions continue.

## Apps and authorization

- Apps lists enabled clients configured for dashboard display, in configured order, with their administered icon and description.
- Launching an app starts DarkAuth's OIDC authorization flow. A remembered consent skips the approval screen (see [`oidc-and-clients.md`](oidc-and-clients.md#remembered-consent)).
- Organization-aware clients require a valid organization selection before approval and token issuance.
- Organizationless clients do not prompt for an organization and receive no organization RBAC context.
- The authorization screen shows the requesting client, scopes, organization choice when required, and any ZK key-delivery requirement.

## Organizations

- The account menu lists active memberships and shows the active organization. Switching revalidates membership and updates the session.
- Profile lists the user's organizations and supports creation. A dedicated organization page shows details, security policy, roles, and members.
- Users with `darkauth.org:manage` can invite members, assign exposed roles, remove members or roles, delete the organization, and manage Enterprise Connections.
- Users without management permission receive a read-only organization view and do not receive protected member details.
- Leave, removal, and deletion preserve the last-active-organization and last-manager invariants.
- Organization `forceOtp` is visible in organization security status and is enforced when that organization becomes active.

## Profile

- Users can review and update their display name and email address.
- Email changes use a pending address and verification flow; the current address remains authoritative until verification completes.
- Verification can be resent or the pending change cancelled.
- The portal does not expose administrative attributes, role definitions, or direct permission editing.

## Security

- Users can change or recover an OPAQUE password without exposing it to the server.
- OTP setup verifies the authenticator before activation and supplies backup codes. Required OTP cannot be bypassed by navigating away.
- Recovery keys are shown only at creation and may be listed by metadata, added, used, or revoked.
- WebAuthn credentials and passkey PRF unlock methods can be enrolled and revoked.
- Trusted devices can hold approved key envelopes and can be reviewed or revoked. Device approval requests are explicit and short-lived.
- Active sign-ins are listed with browser, created, and last active times. Users can sign out any one of them or all others; signing out destroys that browser's session unlock.
- Remembered app approvals are listed with scopes and organization and can be revoked.
- Connected OIDC identities are visible as sign-in methods. Enterprise connection configuration belongs to the organization page, not account Security.

## Zero-knowledge key state

- The portal coordinates the account root key, DRK-derived material, client app keys, recovery envelopes, passkey PRF envelopes, and trusted-device envelopes without sending plaintext keys to DarkAuth.
- A user may be authenticated but still have a locked key state. ZK clients require a compatible unlock or setup path before key delivery.
- Key unlock availability reflects local password, recovery key, passkey PRF, trusted device, and federation policy.
- After one unlock, new tabs and reloads on the user origin restore ARK from the session unlock envelope without prompting until the sign-in ends.
- Sensitive browser state is scoped to the authenticated user and cleared on logout or account transition.

## Presentation and safety

- Login, authorization, organization selection, and portal pages use instance branding and semantic light/dark theme values.
- State-changing cookie-authenticated requests require same-origin CSRF protection.
- User-facing errors remain actionable without disclosing credentials, token material, account existence, or protected membership data.
- Account, organization, authentication, and key-management changes generate audit events with the user and organization context when applicable.
