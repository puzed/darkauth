# Permissions Implementation

## Summary

Complete the permissions feature to allow admins to create permissions and assign them to groups. Users inherit permissions from the groups they belong to. The database schema and basic UI are already in place; this spec covers the remaining backend and frontend work to make permissions fully functional.

## Current State

### What Exists

**Database Schema (Complete)**
- `permissions` table: `key` (pk), `description`
- `groups` table: `key` (pk), `name`, `enableLogin`, `requireOtp`
- `group_permissions` junction: `group_key`, `permission_key` (composite pk)
- `user_permissions` junction: `user_sub`, `permission_key` (composite pk)
- `user_groups` junction: `user_sub`, `group_key` (composite pk)
- All Drizzle ORM relations defined in `schema.ts:342-383`

**Models (Partial)**
- `listPermissionsWithCounts()` - lists all permissions with group/user counts
- `deletePermissionByKey()` - deletes a permission
- `createGroup()` - supports `permissionKeys` parameter
- `setUserGroups()`, `getUserGroups()` - manage user group membership
- `models/access.ts` - calculates effective permissions (union of direct + group-inherited)

**Controllers (Partial)**
- `GET /admin/permissions` - lists permissions (working)
- `DELETE /admin/permissions/:key` - deletes permissions (working)
- `POST /admin/permissions` - returns 501 Not Implemented
- `POST /admin/groups` - creates groups with permissions (working)
- `PUT /admin/groups/:key` - does NOT accept `permissionKeys`

**Admin UI (Partial)**
- `GroupEdit.tsx` has full permission selection UI built (checkboxes, descriptions)
- Shows "No permissions available" when no permissions exist
- Warning banner states permissions editing is not fully implemented
- Attempts to send `permissionKeys` on save but backend ignores it

### What's Missing

1. **Create Permission** - `POST /admin/permissions` returns 501
2. **Update Group Permissions** - `PUT /admin/groups/:key` doesn't accept `permissionKeys`
3. **Get Group Permissions** - No endpoint/model to fetch a group's current permissions
4. **UI Integration** - Need to load group's current permissions when editing

## Goals

- Admins can create, list, and delete permissions
- Admins can assign permissions to groups when creating or editing groups
- When editing a group, the UI shows which permissions are currently assigned
- Users inherit permissions from their groups (already working via `models/access.ts`)

## Non-Goals

- User-level direct permission assignment (deferred - schema exists but no UI)
- Permission-based access control in controllers (separate feature)
- Permission hierarchy or inheritance between permissions

## Data Model

No schema changes required - all tables and relations already exist.

## API Changes

### POST /admin/permissions (Implement)

**Request:**
```json
{
  "key": "users:read",
  "description": "Can view user profiles"
}
```

**Response (201):**
```json
{
  "key": "users:read",
  "description": "Can view user profiles",
  "groupCount": 0,
  "directUserCount": 0
}
```

**Errors:**
- 400: Invalid key format or missing required fields
- 409: Permission with this key already exists

### PUT /admin/groups/:key (Extend)

**Request (add permissionKeys):**
```json
{
  "name": "Administrators",
  "enableLogin": true,
  "requireOtp": false,
  "permissionKeys": ["users:read", "users:write", "admin:access"]
}
```

**Response (200):**
```json
{
  "success": true,
  "permissions": [
    { "key": "users:read", "description": "Can view user profiles" },
    { "key": "users:write", "description": "Can modify user profiles" },
    { "key": "admin:access", "description": "Can access admin panel" }
  ]
}
```

### GET /admin/groups/:key (New - Optional)

Returns a single group with its permissions. Alternative: extend list endpoint response.

**Response (200):**
```json
{
  "key": "admins",
  "name": "Administrators",
  "enableLogin": true,
  "requireOtp": false,
  "permissions": ["users:read", "users:write"],
  "userCount": 5,
  "permissionCount": 2
}
```

## Implementation Plan

### Phase 1: Permission CRUD

1. Implement `createPermission` model function
2. Update `permissionCreate` controller to use the model
3. Add validation for permission key format (lowercase, colons allowed)

### Phase 2: Group Permission Management

1. Add `setGroupPermissions()` model function
2. Add `getGroupPermissions()` model function
3. Update `updateGroup` model to accept and handle `permissionKeys`
4. Update `groupUpdate` controller request schema to include `permissionKeys`
5. Update group response to include assigned permissions

### Phase 3: Admin UI Integration

1. Create `GET /admin/groups/:key` endpoint (or extend existing)
2. Update `GroupEdit.tsx` to load current permissions on mount
3. Remove warning banner about permissions not being implemented
4. Test full flow: create permission, assign to group, verify user inherits

## Security Considerations

- Permission keys should follow a consistent format (e.g., `resource:action`)
- Only admins with `write` role can create/modify permissions
- Audit logs should capture permission changes (already wired via `withAudit`)

## Testing

- Create permission with valid/invalid data
- Update group with permission assignment
- Verify cascade delete works (deleting permission removes from groups)
- Verify user inherits permissions through group membership
- UI tests for permission selection flow

---

## Implementation Checklist

### Backend - Models

- [ ] `models/permissions.ts`: Add `createPermission(context, { key, description })` function
  - Validate key format (non-empty string)
  - Check for existing permission with same key (throw ConflictError)
  - Insert into `permissions` table
  - Return created permission with counts (0, 0)

- [ ] `models/groups.ts`: Add `getGroupPermissions(context, groupKey)` function
  - Verify group exists
  - Query `group_permissions` joined with `permissions`
  - Return array of `{ key, description }`

- [ ] `models/groups.ts`: Add `setGroupPermissions(context, groupKey, permissionKeys)` function
  - Verify group exists
  - Verify all permission keys exist
  - Delete existing `group_permissions` for this group
  - Insert new `group_permissions` rows
  - Return updated permissions list

- [ ] `models/groups.ts`: Update `updateGroup()` to accept `permissionKeys` parameter
  - Call `setGroupPermissions()` when `permissionKeys` is provided
  - Return permissions in response

### Backend - Controllers

- [ ] `controllers/admin/permissionCreate.ts`: Implement handler
  - Parse request body with existing schema
  - Call `createPermission()` model
  - Return 201 with created permission
  - Remove 501 response

- [ ] `controllers/admin/groupUpdate.ts`: Add `permissionKeys` to request schema
  - Add `permissionKeys: z.array(z.string()).optional()` to `Req`
  - Pass to `updateGroup()` model

- [ ] `controllers/admin/groupGet.ts`: Create new endpoint `GET /admin/groups/:key`
  - Require admin session
  - Call `getGroupPermissions()` and merge with group data
  - Return group with permissions array

- [ ] `controllers/admin/groups.ts`: Update `GroupSchema` to include permissions array
  - Add `permissions: z.array(z.string()).optional()` for responses

### Backend - Routes

- [ ] Register `GET /admin/groups/:key` route in admin server
  - Add route pattern and controller binding

### Admin UI - API Service

- [ ] `services/api.ts`: Update `Group` interface
  - Add `permissions?: string[]` field (already exists, verify usage)

- [ ] `services/api.ts`: Add `getGroup(key)` function
  - Fetch single group with permissions from new endpoint

- [ ] `services/api.ts`: Verify `updateGroup()` sends `permissionKeys`
  - Already implemented, verify it works with backend

### Admin UI - Components

- [ ] `pages/GroupEdit.tsx`: Load group's current permissions
  - Call `getGroup(key)` or extract from `getGroups()` response
  - Set `selectedPermissions` from group's permissions array
  - Remove comment on lines 74-77

- [ ] `pages/GroupEdit.tsx`: Remove warning banner
  - Delete lines 267-279 (the orange warning about permissions not being implemented)

- [ ] `pages/GroupEdit.tsx`: Handle save response
  - Update local state with returned permissions
  - Show success feedback

### Tests

- [ ] `tests/controllers/admin/permissionCreate.test.ts`
  - Test successful creation
  - Test duplicate key rejection
  - Test invalid input validation

- [ ] `tests/controllers/admin/groupUpdate.test.ts`
  - Test adding permissions to group
  - Test removing permissions from group
  - Test invalid permission keys

- [ ] `tests/models/permissions.test.ts`
  - Test `createPermission()` happy path
  - Test conflict error on duplicate

- [ ] `tests/models/groups.test.ts`
  - Test `getGroupPermissions()` returns correct permissions
  - Test `setGroupPermissions()` replaces permissions correctly

### Documentation

- [ ] Update OpenAPI schemas for new/modified endpoints
- [ ] Add changelog entry for permissions feature completion
