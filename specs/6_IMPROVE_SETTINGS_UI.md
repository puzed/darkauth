 # Improve Settings UI
 
 ## Goal
 
 Make the Settings page easier to scan and edit by:
 - Adding a `description` field to each setting in the database and exposing it via the API.
 - Replacing the current card/grid of large inputs with a compact, single‑row list per setting.
 - Treating JSON settings as editable objects via a modal/editor (no big textareas inline).
 - Providing an explicit Reset action that restores a setting to its `defaultValue`.
 
 ## Current State (Summary)
 
 - Settings live in Postgres table `settings` and are read/written through the API.
 - GET `/api/admin/settings` returns an array of setting rows including `key`, `name`, `type`, `category`, `tags`, `defaultValue`, `value`, `secure`, `updatedAt`.
 - PUT `/api/admin/settings` updates a setting by `key` with auditing and validation for selected keys.
 - Admin UI renders the Settings page using a grid with per‑field editors. Booleans render as a checkbox, numbers and strings as inputs, and objects as large JSON textareas.
 - Some complex objects are flattened in the API model (`listSettings`) for better ergonomics; branding objects are not flattened and currently appear as large textareas.
 
 ## Changes
 
 ### 1) Database
 
 - Add a nullable `description` column to `settings`.
 - Keep it optional to maintain compatibility with existing rows; seed and populate descriptions going forward.
 
 Drizzle schema change:
 - Update `packages/api/src/db/schema.ts` `settings` table definition to include `description: text("description")`.
 
 Migration:
 - Add a migration that executes `ALTER TABLE settings ADD COLUMN description text;`.
 - No backfill required; null is acceptable. Follow‑on seeds will populate core/branding rows.
 
 ### 2) API
 
 - Include `description` in the settings response.
   - Update `packages/api/src/controllers/admin/settings.ts` zod schema and response shape to include `description?: string | null`.
   - Update the SELECT in `packages/api/src/models/settings.ts` to select `settings.description`.
 - No new endpoints required for Reset. The UI can issue a normal update using `defaultValue`.
 - Keep existing flattening behavior; the UI changes eliminate large textareas for JSON even when not flattened.
 
 OpenAPI impact:
 - Extend the `Setting` schema with `description?: string | null`.
 
 ### 3) Seeding and Services
 
 - When seeding defaults, set useful `description` values for important keys.
   - Update `packages/api/src/services/settings.ts` seed arrays to include a `description` string per row.
   - Update `packages/api/src/services/branding.ts` default rows with `description`.
 - Examples (suggested copy):
   - `branding.colors`: "Color palette for user login and consent screens."
   - `branding.colors_dark`: "Dark mode color palette for user login and consent screens."
   - `branding.identity`: "Product name and tagline used across user‑facing pages."
   - `branding.custom_css`: "Additional CSS injected into user login and consent pages."
   - `issuer`: "Issuer URL used in OIDC discovery and tokens."
   - `public_origin`: "Public base origin for redirects and links."
   - `admin_session.*`: "Admin session lifetimes in seconds."
   - Rate limit rows: "Window length and request limits for this area."
 
 ### 4) Admin UI
 
 Layout
 - Replace the grid of inputs with a vertical list of setting rows grouped by category/subcategory.
 - Each setting renders on a single line with concise controls.
 
 Row structure
 - Name | Description | Control(s)
 - Control rules:
   - Boolean: inline switch, autosaves on toggle.
   - String/number: compact input with Save button on blur/Enter; no textareas inline.
   - Object/JSON: no inline textarea. Show: `Edit` and `Reset` buttons.
     - `Edit` opens a modal JSON editor with validation. Prettify on save.
     - `Reset` updates value to `defaultValue` with confirmation. Disabled when already at default.
 
 Components
 - Add `SettingRow` with variants for boolean, string, number, and json.
 - Add `JsonEditDialog` for editing object values (simple `<textarea>` is acceptable inside the dialog; no inline giant fields).
 - Replace the grid container in `pages/Settings.tsx` with a stacked list. Keep existing grouping by top/sub category.
 
 Behavior
 - Continue to redact secure values for read‑only admins (unchanged).
 - Use current `PUT /api/admin/settings` for all saves, including Reset (send `defaultValue`).
 - Show diff‑aware toasts: Saved, Error. Disable controls while saving.
 - Preserve the existing grouping and label logic; add optional description below the label in muted text.
 
 Type updates
 - Extend `AdminSetting` in `packages/admin-ui/src/services/api.ts` with `description?: string | null`.
 
 ### 5) UX Details
 
 - Keyboard
   - Enter saves for text/number fields, Esc reverts unsaved changes in inputs and closes the dialog for JSON.
 - Preview for JSON rows (optional, non‑blocking)
   - Show a short monospace preview like `{ primary: "#6600cc", ... }` faded, truncated.
 - Accessibility
   - Labels bound to inputs; dialog has focus trap and aria labels.
 
 ### 6) Backwards Compatibility
 
 - Existing databases work; `description` is nullable.
 - Existing clients unaffected; new field is additive. UI still functions if `description` is null.
 - No change to update permissions or allowed keys.
 
 ### 7) Acceptance Criteria
 
 - The Settings page lists one row per setting with no large inline textareas.
 - JSON settings display as a compact row with `Edit` and `Reset` actions; editing happens in a modal.
 - Reset restores the exact `defaultValue` and shows a success toast.
 - Descriptions appear where provided across core and branding settings.
 - GET `/api/admin/settings` includes `description` and the Admin UI renders it.
 - Tests that interact with settings continue to pass.
 
 ### 8) Implementation Plan
 
 1. DB column + migration
 2. Update Drizzle schema
 3. Include `description` in models and controller response
 4. Add descriptions in settings + branding seeders
 5. Extend `AdminSetting` type in admin‑ui API service
 6. Refactor `pages/Settings.tsx` to stacked rows
 7. Add `SettingRow` and `JsonEditDialog`; wire saves and reset
 8. Light visual polish and preview for JSON (optional)
 
 ### 9) Non‑Goals
 
 - No change to authentication/authorization flows for admin settings.
 - No change to object flattening strategy in the API; UI no longer relies on inline JSON fields.
 - No new endpoints for reset; reuse the existing update path.
 
