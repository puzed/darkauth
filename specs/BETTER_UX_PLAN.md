# Better User Portal UX Plan

Status: proposed rewrite plan
Owner: user portal
Scope: `packages/user-ui`

## Why This Exists

The current user portal exposes the right capabilities, but the experience feels like an internal admin console. It makes simple tasks hard to understand, spreads related actions across routes and menus, and exposes zero-knowledge key-management internals before users have a reason to care.

The rewrite should make DarkAuth feel like a modern account and application portal:

- Mobile-first, fast, calm, and obvious.
- Simple for normal users who only want to open an app.
- Clear for security-sensitive users managing passkeys, trusted devices, recovery, and 2FA.
- Honest about the difference between signing in and unlocking encrypted app access.
- Fully brandable from the admin branding configuration.

## Current UX Problems

- The dashboard does not answer "what can I do now?" quickly enough. Apps and account data compete for attention.
- Security settings are a dense two-column settings console with technical labels like key envelopes, PRF unlock credentials, and key state.
- Important actions hide in the user dropdown while the page itself repeats some of them.
- Change password is a separate oversized page with no account context, no success path clarity, and no recovery implications until something fails.
- Security status is shown as raw metrics, not an actionable health summary.
- Zero-knowledge unlock is presented as implementation detail rather than a human journey.
- Desktop spacing creates huge empty areas while forms stretch too wide.
- Mobile behavior is implied by responsive CSS, not designed as the primary experience.
- Branding exists, but the portal does not use a coherent brand token contract across app, auth, settings, and consent routes.
- The UI relies on heavy cards, borders, dark panels, and weak hierarchy instead of clear layout and direct actions.

## Research Inputs

- Android settings guidance recommends putting frequent actions near the feature they affect, keeping settings out of top-level navigation unless crucial, using overview pages, grouping related settings, and moving complex groups into subscreens. Source: https://developer.android.com/design/ui/mobile/guides/patterns/settings
- Material tabs guidance says tabs should switch between related peer content, be short, and not be used for destinations of varied importance. Source: https://m1.material.io/components/tabs.html
- Material navigation guidance recommends ordering destinations by user importance and adapting drawer patterns by viewport. Source: https://m2.material.io/components/navigation-drawer
- Okta's end-user dashboard positions the portal as one place to launch apps, with self-service security tasks available without IT. Source: https://www.okta.com/okta-end-user-experience/
- Okta passkey UX puts passkey enrollment under end-user security methods and uses guided prompts. Source: https://help.okta.com/oie/en-us/content/topics/identity-engine/authenticators/passkeys-end-user-experience.htm
- Progressive disclosure is the right pattern for DarkAuth because most users need the next safe action, not every key-management detail at once. Source: https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/

## Product Principle

DarkAuth has two states:

- Signed in: DarkAuth knows who the user is.
- Encryption ready: this browser can unlock or receive encrypted app keys.

The UI should teach this through state and action, not documentation. Normal users should see "Ready for encrypted apps" or "Unlock encrypted app access" before seeing terms like ARK, PRF, envelope, or ZK.

## Target Information Architecture

Use three user-facing destinations:

- Apps: launch assigned apps and resolve anything blocking access.
- Security: manage sign-in, encrypted access, recovery, devices, and 2FA.
- Profile: name, email, organizations, account identifiers, session actions.

Use secondary destinations only when a focused flow needs its own screen:

- Authorize app
- Unlock encrypted access
- Change password
- Set up passkey
- Set up recovery key
- Set up two-factor authentication
- Approve new browser
- Switch organization
- Reset password
- Verify email

## Navigation Model

Mobile:

- Use a bottom navigation bar with Apps, Security, and Profile.
- Keep the brand mark in a compact top bar.
- Put theme and logout in Profile, not in the primary top bar.
- Use single-column screens, sticky primary actions, and bottom sheets for confirmation or advanced choices.

Desktop:

- Use a narrow left rail or compact top app shell with Apps, Security, and Profile.
- Keep content to readable max widths.
- Use split list-detail only where it improves scanning, such as Security on desktop.
- Do not stretch forms or settings rows across the full viewport.

Menus:

- Replace the current user dropdown actions with Profile, Help if added later, and Sign out.
- Move Change password into Security > Password.
- Move Passkeys & Security into the primary Security destination.
- Add organization switcher only when the user has multiple active organizations.

## Brand Contract

The rewrite must treat admin branding as a first-class design input.

- Use `branding.identity.title` and `branding.identity.tagline` in auth screens only where helpful.
- Use `logoUrl`, `logoUrlDark`, `faviconUrl`, and `faviconUrlDark` consistently in all portal shells.
- Map admin colors into semantic user-portal tokens:
  - `--da-color-brand`
  - `--da-color-action`
  - `--da-color-action-text`
  - `--da-color-page`
  - `--da-color-surface`
  - `--da-color-surface-raised`
  - `--da-color-text`
  - `--da-color-text-muted`
  - `--da-color-border`
  - `--da-color-success`
  - `--da-color-warning`
  - `--da-color-danger`
  - `--da-focus-ring`
- Derive hover, pressed, subtle, and border colors from the semantic tokens.
- Respect light and dark brand sets.
- Keep custom CSS support, but make the default UI excellent without it.
- Avoid locking the product into the current purple/dark-slate palette.
- Ensure brand color is used for action and focus, not as every surface color.
- Create contrast safeguards so admin-selected colors cannot make primary actions unreadable.
- Add preview coverage for login, apps, security, authorize, and profile instead of only login.

## Visual Design Direction

- Replace oversized dark panels with clean surfaces, strong spacing, and a clear content hierarchy.
- Use fewer cards. Use lists for settings, compact summary cards for status, and cards only for apps or focused repeated entities.
- Use 8px or smaller radii unless a component needs a platform-native shape.
- Use icons for recognizable actions and statuses, with text labels for navigation and destructive actions.
- Use consistent density: 44px minimum touch targets, compact desktop rows, and readable mobile spacing.
- Use one primary action per screen or section.
- Use inline status chips for "Ready", "Action needed", "Managed by organization", "Sign-in only", and "Unlock enabled".
- Use neutral copy that starts with user outcomes.
- Replace emojis with a consistent icon set.
- Keep typography restrained. No hero-scale headings inside account panels.

## Core Journeys

### Apps

Goal: users open their apps with minimal friction.

- Show "Your apps" as the first screen after sign-in.
- Put the first available app near the top and make it clearly clickable.
- Add search only when there are enough apps to need it.
- Show app icon, name, description, organization context, and access state.
- If encrypted access is locked, show one concise banner: "Unlock encrypted app access to use zero-knowledge apps."
- If all visible apps are normal OIDC apps, do not force key-management language into the dashboard.
- If no apps exist, show a useful empty state and account/security shortcuts.
- Add recent or pinned apps later, but do not block the rewrite on it.

### Security

Goal: users understand whether their account is safe and what to do next.

- Rename "Security Settings" to "Security".
- Start with a security health overview:
  - Sign-in methods
  - Encrypted app access
  - Recovery
  - Trusted browsers
  - Two-factor authentication
- Show the top recommended action first, such as "Create a recovery key" or "Add a passkey".
- Use list rows that open focused detail screens.
- Keep advanced key records behind "Advanced encrypted access records".
- Do not show raw key-envelope counts in the primary overview.
- Explain "sign-in" and "encrypted access" as separate concepts only where relevant.

### Profile

Goal: account facts and session actions are easy to find.

- Show name, email, user ID, current organization, and active organizations.
- Put copy user ID behind an icon button.
- Put sign out at the bottom, separated from normal account information.
- Include change email only if supported by policy and API.
- Include password reset requirement state if active.

### Authorize App

Goal: consent and zero-knowledge handoff feel like one guided app-opening flow.

- Use title: "Continue to {appName}".
- Show the selected account and organization clearly.
- Group permissions into human categories:
  - Basic profile
  - Email address
  - Offline access
  - Encrypted app key
- For ZK requests, say "Share an encrypted app key with {appName}" instead of "Access your encryption keys".
- If keys are already unlocked, keep the flow one screen with Continue and Cancel.
- If keys are locked, insert an inline step: "Unlock encrypted app access".
- Prioritize trusted-device approval when available, then passkey unlock, then password, then recovery.
- Keep "Create new keys" as a last-resort recovery path with strong warning language.
- Show the verification code in a large, copyable, mobile-friendly component for trusted-device approval.
- Preserve fragment-only JWE and hash-binding behavior.

### Sign-In

Goal: fast sign-in without confusing auth methods.

- Use a clean auth frame with brand, one focused form, and clear alternate methods.
- If passkey sign-in is available, show "Continue with passkey" as a prominent option above or beside password.
- Keep email-first SSO detection, but make the transition explicit: "Your organization uses {provider}".
- Avoid stacked full-width secondary buttons that look equal to the primary password action.
- Move forgot password and create account into predictable secondary positions.
- Keep wording driven by `branding.wording`.

### Password Change

Goal: changing a password feels safe and understandable.

- Move from a standalone oversized form into Security > Password with a focused modal or detail screen.
- Explain that changing a password also rewraps encrypted access when possible.
- Show password requirements near the new password field.
- Add show/hide password controls.
- Add success state that returns to Security, not always Apps.
- If keys cannot be preserved, show a recovery choice screen rather than an inline technical failure.

### Passkeys

Goal: users understand which passkeys sign in and which unlock encrypted apps.

- Use one list called "Passkeys".
- Each row should show:
  - Label
  - Added date
  - Last used date
  - "Signs you in"
  - "Unlocks encrypted apps" if PRF envelope exists
- Create passkey should be a guided flow:
  - Explain what it will do.
  - Call browser WebAuthn.
  - Show result: sign-in only or sign-in plus encrypted access.
  - Offer next action if PRF was not available.
- Rename "PRF passkey" to "Passkey unlock" in user-facing copy.
- Keep PRF details in a disclosure row.

### Trusted Browsers

Goal: users trust and approve devices without understanding envelope records.

- Rename "Trusted Devices" to "Trusted browsers" unless native devices are later added.
- Show current browser status at the top.
- Provide one action: "Trust this browser".
- Show pending approvals as urgent cards only when pending.
- Approval flow should use code matching, app/client name, expiry, and Approve/Deny.
- Keep revoked or historical devices out of the default view.

### Recovery

Goal: users have a clear offline recovery safety net.

- Make recovery key setup a wizard:
  - Why this matters
  - Create key
  - Save/copy/download
  - Confirm saved
  - Completion
- Never leave a one-time recovery key visible after completion.
- Rotate recovery key should explain that the old key stops working.
- Show "Recovery ready" on the Security overview when active.

### Two-Factor Authentication

Goal: 2FA setup is quick and hard to mess up.

- Keep a focused setup screen for forced enrollment.
- Use segmented choice between authenticator code and backup code on verify.
- Use a large OTP input with auto-submit at six digits.
- Show backup codes as a completion step with copy/download and confirmation.
- Rename "Resetup OTP" to "Replace authenticator app".

### Organizations

Goal: organization context is visible only when it matters.

- Show current organization in Profile and Authorize.
- Add a compact organization switcher when multiple active organizations exist.
- In authorize flows, default to the active session organization when valid.
- When an app requests a locked organization, explain that the app requested it.

## What To Remove Or Hide

- Remove the security left-column tab rail on mobile.
- Remove raw key-envelope metrics from the primary security overview.
- Hide wrapping algorithms, envelope IDs, and PRF compatibility details behind Advanced.
- Remove duplicated Change Password entry points from the dashboard and dropdown.
- Remove full-width desktop forms that stretch beyond comfortable reading width.
- Remove inline style usage from user-facing components as part of the rewrite.
- Remove emoji icons from auth, organization, and permissions UI.
- Remove the account details card from the Apps dashboard; move it to Profile.
- Remove empty bordered containers that fill most of the viewport.

## Proposed Routes

- `/apps` replaces `/dashboard` as the canonical signed-in landing route.
- `/security` replaces `/settings`.
- `/profile` is new.
- `/security/password` replaces direct use of `/change-password`.
- `/security/passkeys`
- `/security/recovery`
- `/security/trusted-browsers`
- `/security/two-factor`
- `/security/advanced-keys`
- `/authorize` remains the OIDC consent route.
- Keep redirects from old routes for compatibility.

## Component Rewrite Plan

- Create `UserShell` to replace `UserLayout`.
- Create `MobileBottomNav` and `DesktopNav`.
- Create `BrandMark` used by all auth and portal screens.
- Create `StatusBanner`, `StatusRow`, `ActionList`, `SettingsList`, `AppTile`, `EmptyState`, `ConfirmSheet`, and `InlineAlert`.
- Create `SecurityOverview`.
- Split `SettingsSecurity.tsx` into focused feature modules:
  - `SecurityOverview.tsx`
  - `PasswordSecurity.tsx`
  - `PasskeysSecurity.tsx`
  - `EncryptedAccess.tsx`
  - `TrustedBrowsers.tsx`
  - `RecoverySecurity.tsx`
  - `TwoFactorSecurity.tsx`
  - `AdvancedKeyRecords.tsx`
- Split `Authorize.tsx` into:
  - `AuthorizeShell.tsx`
  - `PermissionSummary.tsx`
  - `OrganizationChoice.tsx`
  - `EncryptedAccessStep.tsx`
  - `TrustedBrowserApprovalStep.tsx`
- Move all shared copy through a small user-facing copy layer so technical terms are intentional.

## Accessibility Requirements

- Every interactive element must have a visible label or accessible name.
- Focus order must follow visual order.
- Bottom navigation must expose the current page with `aria-current`.
- Modals and bottom sheets must trap focus.
- Color cannot be the only indicator of state.
- Error messages must be linked to inputs.
- OTP and recovery inputs must support paste.
- Touch targets must be at least 44px on mobile.
- All branded color combinations must meet WCAG AA for normal text and controls.

## Mobile Requirements

- Design at 360px first.
- No horizontal scrolling.
- No two-column forms.
- Sticky bottom primary action for long setup flows.
- Use bottom sheets for confirmation and advanced method selection.
- Keep top bars compact enough that content starts above the fold.
- Ensure long emails, organization names, app names, and user IDs wrap without breaking layout.

## Desktop Requirements

- Content max width should be intentional:
  - Auth forms: 420-480px
  - Settings detail: 640-760px
  - Apps grid: 1120-1280px
- Use empty space for breathing room, not giant inactive panels.
- Use list-detail on Security only when it reduces navigation.
- Keep primary actions close to the section they affect.

## Copy Guidelines

- Use user-language labels:
  - "Encrypted app access" instead of "key state".
  - "Trusted browser" instead of "trusted device" in browser-only flows.
  - "Passkey unlock" instead of "PRF passkey".
  - "Recovery key" instead of "recovery envelope".
  - "Advanced key records" instead of "key envelopes".
- Avoid acronyms in primary UI unless the admin configured wording uses them.
- Put security tradeoffs in concise disclosure text near the action.
- Keep destructive action labels explicit: "Remove passkey", "Revoke recovery key", "Sign out".

## Implementation Checklist

### Foundation

- [x] Audit all current user-ui routes and map each to the new IA.
- [x] Create the semantic brand token layer.
- [x] Replace duplicated global/auth CSS with component-scoped design primitives.
- [x] Add responsive shell with mobile bottom nav and desktop nav.
- [x] Add redirects from `/dashboard`, `/settings`, and `/change-password`.
- [x] Remove inline styles from user-facing components touched by the rewrite.
- [x] Replace emoji icons with a consistent icon library.

### Apps

- [x] Rename dashboard destination to Apps.
- [x] Move account details out of Apps.
- [x] Redesign app tiles for mobile first.
- [x] Add locked encrypted-access banner only when relevant.
- [x] Add useful empty state.
- [x] Add app search when app count crosses a practical threshold.

### Security Overview

- [x] Build Security overview with actionable status rows.
- [x] Add recommended next action.
- [x] Move raw key details to Advanced.
- [x] Add managed-by-organization states.
- [x] Make all rows navigate to focused detail screens.

### Password

- [x] Move change password into Security.
- [x] Add show/hide controls.
- [x] Add clearer key-preservation success and failure states.
- [x] Add recovery route when password change cannot preserve encrypted access.

### Passkeys

- [x] Create guided passkey setup flow.
- [x] Distinguish sign-in-only from sign-in plus encrypted unlock.
- [x] Add clearer revoke flow.
- [x] Move compatibility details behind disclosure.

### Encrypted Access

- [x] Create user-facing encrypted access screen.
- [x] Explain sign-in versus unlock in one concise paragraph.
- [x] Hide algorithms and envelope IDs behind Advanced.
- [x] Add setup prompts for password envelope, passkey unlock, trusted browser, and recovery key.

### Trusted Browsers

- [x] Rename UI to Trusted browsers.
- [x] Add current browser status.
- [x] Redesign trust current browser journey.
- [x] Redesign pending approval cards.
- [x] Add code-matching UI for approvals.

### Recovery

- [x] Build recovery key setup wizard.
- [x] Add saved-confirmation step.
- [x] Add rotate/revoke confirmation.
- [x] Ensure one-time key display cannot linger accidentally.

### Two-Factor

- [x] Redesign setup flow around QR, code entry, backup codes, and completion.
- [x] Replace "Resetup OTP" copy.
- [x] Improve verify screen with segmented normal code and backup code modes.

### Authorize

- [x] Redesign consent page around "Continue to app".
- [x] Group permissions into human categories.
- [x] Integrate organization choice cleanly.
- [x] Integrate locked encrypted-access step inline.
- [x] Prioritize trusted browser approval when available.
- [x] Make create-new-keys a last-resort path with clear warning.

### Profile

- [x] Add Profile route.
- [x] Move account details from Apps to Profile.
- [x] Add current organization and organization switcher.
- [x] Add user-facing organization creation where supported by the user API.
- [x] Make the current organization read as the default account context.
- [x] Add copy user ID action.
- [x] Move sign out here and keep it visually separate.

### Consistency Correction Pass

- [x] Replace page-specific header, section, status, and empty-state styling with shared portal primitives.
- [x] Remove the oversized Security wrapper and make Security use the same page grid as Apps and Profile.
- [x] Replace card-like Security tabs with a clean settings menu and detail pane.
- [x] Normalize page gutters, max widths, section padding, touch targets, and status pills across the user portal.
- [x] Reduce the header account control so it no longer competes with the main page.

### Branding Preview

- [x] Extend admin branding preview beyond login.
- [x] Add preview modes for Apps, Security, Authorize, and Profile.
- [x] Add light/dark contrast validation for action and text tokens.
- [x] Document the new semantic token contract.

### Quality Gates

- [x] Add visual regression coverage for 360px, 390px, 768px, 1280px, and 1440px.
- [x] Add tests for old-route redirects.
- [x] Add tests for locked versus unlocked encrypted-access states.
- [x] Add tests for sign-in-only passkeys versus passkey unlock.
- [x] Add tests for forced OTP setup and verify flows.
- [x] Add tests for brand token application in light and dark mode.
- [x] Verify keyboard navigation across shell, settings lists, dialogs, and authorize.
- [x] Run `npm run tidy`.
- [x] Run `npm run build`.

## Suggested Delivery Phases

### Phase 1: Shell And IA

- Build the new shell, navigation, tokens, redirects, Apps, Profile, and a Security overview that links to existing detail routes.
- This gives immediate UX improvement without touching every key-management flow.

### Phase 2: Security Detail Rewrite

- Split `SettingsSecurity.tsx` into focused screens.
- Rewrite Password, Passkeys, Recovery, Trusted browsers, Two-factor, and Advanced key records.
- Keep API behavior unchanged.

### Phase 3: Authorize And Unlock Rewrite

- Redesign `/authorize` and the encrypted-access unlock step.
- Polish trusted-browser approval and recovery/new-key fallback.
- Add full mobile and desktop visual coverage.

### Phase 4: Branding Preview And Polish

- Expand admin branding preview.
- Add contrast checks and preview states.
- Finish visual regression suite and accessibility QA.

## Success Criteria

- A first-time user can sign in, open an app, and understand any blocked encrypted-access state without reading documentation.
- A user can find passkeys, password, recovery, trusted browsers, and 2FA from Security in one tap on mobile.
- A user can tell whether a passkey signs them in, unlocks encrypted apps, or both.
- A ZK authorization request feels like continuing to an app, not operating a key-management console.
- Admin branding changes visibly and safely affect every user-facing portal route.
- The portal works beautifully at phone width before desktop enhancements are considered.
- Advanced key-management details remain available without dominating normal workflows.
