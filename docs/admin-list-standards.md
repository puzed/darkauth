# Admin Table and List Standards

Implementation reference for shared admin table UX and admin list API contracts.

## Shared table UX (`packages/admin-ui`)

- Use shared table primitives from `src/components/ui/table.tsx` and `src/components/ui/table.module.css`.
- Table container uses internal horizontal scroll (`.wrapper { overflow-x: auto; overflow-y: hidden; }`).
- Headers and cells are no-wrap (`white-space: nowrap`) to preserve dense list layouts.
- Compact list sizing is the shared default in `src/components/ui/table.module.css`:
  - `.head` (38px header height, tighter padding/font size)
  - `.row` (36px row height)
  - `.cell` (reduced padding/line-height)
  - `.actionCell` and last-column rules keep a narrow action column + smaller action trigger
- Do not apply page-level compact table classes; shared defaults already provide compact sizing.
- Sortable columns use `src/components/table/sortable-table-head.tsx`:
  - click header button to toggle sort
  - icons: `ArrowUpDown` (inactive), `ArrowUp`/`ArrowDown` (active)
- Row actions use vertical kebab (`MoreVertical`) via `src/components/row-actions.tsx`.
- Primary/main table column content uses `tableStyles.primaryActionButton` and triggers the table default action (same as the first row action) where row-action menus are present.
- Row-action menu item icons are standardized to `14x14` via `src/components/row-actions.module.css` (`.actionIcon :global(svg)`).
- Page-level scroll stays internal to dashboard content (`src/components/dashboard-layout.module.css`, `.content { overflow: auto; }`).

## Server-side admin list contract (`packages/api/src/controllers/admin`)

Standard list query fields (endpoint-specific `sortBy` enum values):

- `page`
- `limit`
- `search`
- `sortBy`
- `sortOrder` (`asc` | `desc`)

Shared bounds and validation helpers:

- `listQueryBounds.ts`
  - `LIST_PAGE_MAX = 10000`
  - `LIST_SEARCH_MAX_LENGTH = 128`
  - `listPageQuerySchema` enforces `page <= 10000`
  - `listSearchQuerySchema` enforces `search.length <= 128`

Notes:

- `limit` is enforced per endpoint (current admin list endpoints use positive integer with max `100`, default `20`).
- `sortBy` is endpoint-specific and validated as an enum in each controller.

## Pagination response shape

Admin list responses include:

- `pagination.page`
- `pagination.limit`
- `pagination.total`
- `pagination.totalPages`
- `pagination.hasNext`
- `pagination.hasPrev`

This shape is used across admin list responses (for example: users, admin users, clients, roles, groups, permissions, organizations, audit logs).

## Verification tests

- `packages/api/src/controllers/admin/listEndpointsSchema.test.ts`
  - validates standard query fields
  - validates pagination object presence
  - validates bounds (`page > 10000` rejected, `search.length > 128` rejected)
