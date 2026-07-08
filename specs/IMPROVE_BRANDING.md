# Improve Branding

Status: implemented
Owner: user UI, admin UI, branding
Scope: `packages/user-ui`, `packages/admin-ui`, `packages/api`

## Why This Exists

Branding is now used across login, user portal, authorize, organization selection, and admin preview surfaces. The implementation has grown from a small palette override into a semantic theme contract. We need to make that contract explicit so the real user pages, admin controls, and preview panel stay in sync.

The immediate bugs are:
- Authorize initials can become invisible when icon text and icon background are both light or both dark.
- The selected organization row looks over-outlined and exposes browser radio styling in a way that clashes with the brand.
- The authorize button uses success green but that color is not editable from Branding.
- The Branding preview for Authorize does not match the real authorize route.
- Some user UI surfaces consume branding indirectly while the preview has copied markup and inconsistent branding injection.

## Goals

- Define a semantic branding token contract for all user-facing pages.
- Make every visible authorize color configurable or derived safely.
- Prevent admin-selected colors from producing unreadable text on chips, buttons, selected rows, and page surfaces.
- Make the Branding preview match the real user UI structure closely enough to trust it.
- Keep login, apps, security, authorize, and profile previews driven by the same branding application path.
- Preserve existing branding settings and custom CSS compatibility.
- Keep implementation simple; remove duplicated styling where possible.

## Non-Goals

- Replacing the entire custom branding system.
- Designing a full no-code theme builder.
- Supporting arbitrary per-component CSS variables for every visual detail.
- Reworking user portal IA beyond branding correctness.
- Changing OAuth consent semantics.

## Design Decisions

- Branding settings remain database-backed under `branding.*`.
- Admin color fields map to semantic tokens, not page-specific CSS selectors.
- The user UI should consume semantic CSS variables from `useBranding`.
- If a configured foreground color fails contrast against its background, the runtime should pick readable black or white where possible.
- The authorize approve CTA remains semantically success-like, but its color and foreground become branding settings.
- Organization selection is a first-party authorize control and should use selected-row tokens, not raw brand color outlines.
- Preview screens can be mocked, but they must use the same shell components or the same branding hook path as the real screen they represent.
- Existing legacy color keys should continue to work as fallbacks while the admin UI moves toward the new keys.

## Branding Token Contract

Required semantic tokens:

- `--da-color-brand`
- `--da-color-action`
- `--da-color-action-text`
- `--da-color-page`
- `--da-color-surface`
- `--da-color-surface-raised`
- `--da-color-surface-muted`
- `--da-color-border`
- `--da-color-text`
- `--da-color-text-secondary`
- `--da-color-text-muted`
- `--da-color-icon-bg`
- `--da-color-icon-text`
- `--da-color-selection-bg`
- `--da-color-selection-border`
- `--da-color-selection-text`
- `--da-color-success`
- `--da-color-success-text`
- `--da-color-warning`
- `--da-color-danger`
- `--da-focus-ring`

Admin color keys:

- `brandColor`
- `primaryBackgroundColor`
- `primaryForegroundColor`
- `backgroundColor`
- `surfaceColor`
- `surfaceRaisedColor`
- `borderColor`
- `textColor`
- `textSecondaryColor`
- `textMutedColor`
- `iconBackgroundColor`
- `iconForegroundColor`
- `selectionBackgroundColor`
- `selectionBorderColor`
- `selectionForegroundColor`
- `authorizeButtonColor`
- `authorizeButtonForegroundColor`
- `warningColor`
- `dangerColor`

Legacy fallback keys to preserve:

- `primary`
- `success`
- `error`
- `warning`
- `text`
- `textSecondary`
- `textMuted`
- `border`
- `cardBackground`
- `inputBackground`
- `inputBorder`
- `inputFocus`

## Task List

### 1. Branding Model

- [x] Add semantic color keys to admin defaults for light and dark mode.
- [x] Preserve existing unknown color keys when admin branding is loaded and saved.
- [x] Add matching server defaults for new installs.
- [x] Audit all current `branding.colors` consumers and document every supported key.
- [x] Add a small shared type or schema for branding color keys so admin UI, user UI, and API cannot drift.
- [x] Decide whether legacy keys should remain indefinitely or be normalized on read.
- [x] Add tests for normalizing missing new keys while preserving stored legacy keys.

### 2. Runtime Branding Application

- [x] Map new admin color keys to semantic CSS variables in `useBranding`.
- [x] Add readable fallback text for action, icon, selection, and success foregrounds.
- [x] Make success button text use `--da-color-success-text`.
- [x] Add unit tests for `readableTextColor` and semantic token fallback behavior.
- [x] Handle invalid CSS color values consistently instead of silently accepting them everywhere.
- [x] Ensure custom CSS mode either documents or preserves semantic variables needed by built-in UI.
- [x] Re-check theme switching so light and dark values are fully cleared and reapplied.

### 3. Authorize UI

- [x] Replace hard-coded icon chip color mixes with icon semantic tokens.
- [x] Remove the checked-radio square outline.
- [x] Restyle selected organization rows with selected-row tokens.
- [x] Make authorize approve CTA color configurable through success/authorize tokens.
- [x] Review all authorize states: normal consent, org selection, org summary, no orgs, loading orgs, ZK unlock, trusted-browser approval, and errors.
- [x] Make organization radio control keyboard/focus states visually clear without adding heavy outlines.
- [x] Verify mobile layout for long org names, long role lists, and long app names.
- [x] Verify selected row contrast in both light and dark themes.
- [x] Decide whether selected org row should use selection text for all child text or only primary label.

### 4. User Portal Surfaces

- [x] Audit Apps, Security, Profile, Switch Org, Organization Detail, Change Password, Reset Password, Verify Email, OTP, and Key Unlock for hard-coded colors.
- [x] Replace hard-coded success, danger, warning, chip, and icon colors with semantic tokens where appropriate.
- [x] Ensure all user-facing shells use the same logo, title, theme, surface, and text token path.
- [x] Remove duplicated local color fallbacks that conflict with branding variables.
- [ ] Add visual coverage for dark mode across user portal surfaces.

### 5. Admin Branding UI

- [x] Add controls for surfaces, borders, icon chips, selected rows, authorize button, warning, and danger colors.
- [x] Add contrast checks for authorize button, selected row, and icon text.
- [x] Group color fields into sections so the Branding page does not become a long undifferentiated list.
- [x] Add clearer labels or helper copy for which screens each color affects.
- [x] Add reset-to-default for individual colors.
- [x] Add palette copy behavior that handles light-to-dark intelligently rather than blindly copying all values.
- [x] Validate entered hex values before save and show inline errors.
- [x] Decide whether color fields should support only hex or broader CSS colors.

### 6. Branding Preview

- [x] Make Authorize preview include the real branded header shell, account panel, organization selector, permissions, actions, and footnote.
- [x] Make preview iframe background follow selected light/dark mode.
- [x] Make preview app tiles use icon semantic tokens.
- [x] Make preview authorize CTA use success semantic tokens with correct specificity.
- [x] Bring all preview screens into a consistent pattern for branding injection.
- [x] Prefer real exported user UI components in preview where practical.
- [x] Add preview variants for authorize with org selection enabled and disabled.
- [x] Add preview variants for zero-knowledge encrypted app key scope.
- [ ] Add preview mobile and desktop snapshots for light and dark themes.
- [x] Add an automated check that preview authorize contains the same major sections as real authorize.

### 7. Tests And Verification

- [x] Run user UI tests.
- [x] Run admin UI build.
- [x] Run `pnpm tidy`.
- [x] Run `pnpm build`.
- [x] Use browser preview to verify icon chip, selected org row, and authorize button computed colors.
- [x] Add targeted tests for branding color normalization.
- [x] Add targeted tests for admin Branding preserving unknown keys.
- [x] Add Playwright coverage for Branding preview authorize in light and dark.
- [x] Add Playwright or DOM checks for authorize org selection visual states.
- [x] Add regression fixture for white-on-white and black-on-black branding combinations.

### 8. Cleanup And Rollout

- [ ] Split commits by concern:
  - branding token model and defaults
  - authorize UI styling
  - admin Branding controls
  - preview parity
  - tests
- [x] Update `specs/4_CUSTOM_BRANDING.md` or link it to this spec after implementation.
- [ ] Add release note for new branding color controls.
- [x] Confirm existing deployments without new color keys render correctly.
- [x] Confirm saving Branding in admin does not delete old custom keys.
- [x] Confirm custom CSS users can still override built-in variables.

## Acceptance Criteria

- A client can configure the authorize CTA color and text color from Branding.
- A client can configure icon chip and selected organization row colors from Branding.
- Bad icon, button, and selected-row foreground/background combinations are corrected to readable text where possible.
- Real Authorize and Branding preview Authorize have matching major sections and dark-mode behavior.
- The selected organization row no longer has the awkward checked-radio square outline or double-heavy outline.
- Admin Branding does not drop unknown or legacy color keys on save.
- All new branding defaults exist for light and dark mode.
- `pnpm tidy`, `pnpm build`, and targeted user/admin checks pass.

## Open Questions

- Should `authorizeButtonColor` be a dedicated token, or should approve actions use the general success token everywhere?
- Should selected organization rows use brand colors by default, or a neutral selected-row default with brand only as border/focus?
- Should the preview import real `Authorize` with fixture data instead of maintaining mock authorize markup?
- Should Branding expose advanced token names directly, or use friendlier labels with tooltips?
- Should invalid color input be blocked at admin save time, API save time, or both?
