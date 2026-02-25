# Admin UI

Admin console for DarkAuth (`packages/admin-ui`).

## Shared list/table behavior

- Tables use `src/components/ui/table.tsx` + `src/components/ui/table.module.css`.
- Horizontal overflow is handled inside the table wrapper (`overflow-x: auto`).
- Headers and cells are no-wrap (`white-space: nowrap`).
- Sortable headers use `src/components/table/sortable-table-head.tsx`.
- Primary/main table column content uses `tableStyles.primaryActionButton` and triggers the table default action (same as the first row action) where applicable.
- Row actions use vertical kebab menus via `src/components/row-actions.tsx` + `src/components/row-actions.module.css`.
- Row-action menu item icons are standardized to `14x14` (`.actionIcon :global(svg)` in `src/components/row-actions.module.css`).
- Row-action menus use cleaner trigger spacing and open-state trigger treatment (`.triggerOpen`).
- Users list highlights the row that owns the open row-action menu (`src/pages/Users.tsx`, `.rowActive`).
- Users row actions are guarded per user (`runUserRowAction` in `src/pages/Users.tsx`) so repeated clicks while an action is running are ignored and row-action items are disabled until completion.
- Row-action menu and submenu shadows are removed (`.menuContent`, `.menuSubContent`).
- Row-action submenu triggers use pointer cursor and `gap: 8px` for icon/label alignment (`.subTrigger`).
- Page scrolling is internal to dashboard content (`src/components/dashboard-layout.module.css`).
- Organizations list uses a compact table variant (`src/pages/Organizations.tsx` + `src/pages/Organizations.module.css`): tighter header/row/cell spacing, a 28x28 right-aligned row-action trigger, and a visually hidden `Actions` header label for accessibility.
- Organization edit page includes a dedicated `Members` section (`src/pages/OrganizationEdit.tsx`) for membership and role management.
- Members section includes an `Add User` modal flow (`src/pages/OrganizationEdit.tsx`).
- `Add User` modal supports searching users by name, email, or subject (`sub`) before selection.
- `Add` in the modal calls `adminApiService.addOrganizationMember` (`POST /organizations/{organizationId}/members`) and refreshes the member list.
- Organization member role assignment is not inline via dropdown on the edit form.
- Member roles are updated per row action (`Edit Roles`) using an `Edit Roles` modal with multi-select checkboxes.
- Saving from `Edit Roles` uses a single atomic replace call (`adminApiService.updateOrganizationMemberRoles` → `PUT /organizations/{organizationId}/members/{memberId}/roles`) before refreshing the members list.

## Admin list API contract consumed by UI

List screens use standard query params:

- `page`
- `limit`
- `search`
- `sortBy`
- `sortOrder`

Expected pagination response shape:

- `pagination.page`
- `pagination.limit`
- `pagination.total`
- `pagination.totalPages`
- `pagination.hasNext`
- `pagination.hasPrev`

Bounds enforced server-side where relevant:

- `page <= 10000`
- `search.length <= 128`

See `docs/admin-list-standards.md` for the canonical cross-package standard.
