# Default User Group and Group Settings (Enable Login)

## Summary

Introduce a mandatory default group to guarantee every user belongs to at least one group. On fresh installs, create the group `Default` (`key: default`). When a user is created and no groups are assigned, automatically assign them to `default`. Add a per‑group setting “Enable login” (default: true) to control whether membership in that group permits login. Add a new “Settings” section above “Permissions” in Group Create/Edit UI with a toggle for “Enable login”.

## Goals

- Ensure every user always belongs to at least one group.
- Seed a `default` group on first install.
- Auto‑assign `default` when creating a user without explicit groups.
- Add the `Enable login` setting per group (default true) and surface it in Admin UI.
- Gate login on presence of at least one group with `enable_login = true` (configurable behavior in this PRD; see rollout).

## Non‑Goals

- Changing permission semantics.
- Introducing global settings for login enablement (this is per group only).
- Modifying client/OIDC flows beyond login gating.

## Users and Stories

- Admin: Creates users without specifying groups → users land in `Default` automatically.
- Admin: Creates or edits a group and can toggle whether it allows member logins.
- User: Can log in only if in at least one group where login is enabled.

## UX

- Admin UI → Groups → Create Group: Add a new “Settings” card above “Permissions” with a single toggle:
  - Label: Enable login
  - Default: On
  - Help text: Members of this group may sign in when enabled
- Admin UI → Groups → Edit Group: Same section and toggle.
- Users UI: No change in screens; failed login shows an error when no allowed group exists.

## Data Model

- Schema change: `groups.enable_login boolean not null default true`.
- Seed: Insert `groups(key, name, enable_login) values ('default', 'Default', true)` on fresh install.
- Backfill: For existing deployments, ensure every user has at least one group membership by inserting `('default')` membership when a user has none.

## Backend Behavior

- User create (admin API): After user row insert, if no groups provided, add `user_groups(user_sub, group_key) = (sub, 'default')`.
- User self‑registration: After user row insert, same assignment to `default`.
- Group CRUD: Persist and return `enable_login`. Listing includes it for UI consumption.
- Login gating (enforcement): After successful OPAQUE login finish, query user memberships and proceed only if at least one membership has `enable_login = true`. Otherwise return 403 with a specific error code. See rollout for staged enablement.

## API Changes

- Admin GET /admin/groups, /admin/groups/:key: Include `enableLogin` in payloads.
- Admin POST /admin/groups: Accept `enableLogin` (default true).
- Admin PUT /admin/groups/:key: Accept `enableLogin`.
- No change to public OIDC or token endpoints beyond login gating.

## Install and Migration

- New migration to add `groups.enable_login`.
- Install path seeds the `default` group.
- Data migration/backfill: Insert `default` membership for users with zero memberships.

## Security and Privacy

- Login gating runs server‑side after authenticated OPAQUE finish and before issuing sessions.
- No sensitive data added to logs. Avoid logging group toggles at debug levels that reveal policy decisions per user.

## Performance

- Minimal impact. Gating adds a single join query on login finish.

## Telemetry and Logging

- Audit events already exist for group changes; include `enable_login` in audit details.
- Login denial due to policy: emit an audit log event with reason code (no permitted group).

## Acceptance Criteria

- Fresh install contains a `default` group with `enable_login = true`.
- Creating a user without groups assigns the user to `default`.
- Existing databases are backfilled so all users belong to at least one group.
- Admin can toggle “Enable login” when creating or editing a group.
- If a user is only in groups with `enable_login = false`, login is rejected with a clear error.
- OpenAPI reflects group `enableLogin` on relevant endpoints.

## Rollout Plan

- Phase 1 (Schema + UI + Auto‑assignment):
  - Ship schema/migration, seed `default`, auto‑assign on user creation and self‑registration, UI toggle surfaced, APIs extended. Do not hard‑fail login yet if any legacy users slip through.
- Phase 2 (Enforcement):
  - Enable login gating in OPAQUE login finish: require at least one `enable_login = true` membership.
  - Add a temporary feature flag if necessary to toggle enforcement during rollout (optional).

## Risks and Mitigations

- Orphan users with zero groups: Backfill and auto‑assignment mitigate this.
- Admin disables all groups for a user: User cannot log in by design; error message should be explicit.
- Deleting `default`: Disallow deletion of `default` or require reassigning; initial approach: reject delete for `default`.

## Open Questions

- Should we allow multiple default groups? For now, single `default` is sufficient.
- Should enforcement be feature‑flagged for gradual rollout? Default to enabled in Phase 2.

## Additional Implementation Considerations

### Default Group Protection

- The `default` group must be protected from deletion. Add validation in `models/groups.ts#deleteGroup()`:
  ```typescript
  if (key === 'default') {
    throw new ValidationError("Cannot delete the default group");
  }
  ```
- Consider making the default group read-only in the Admin UI to prevent accidental modification of its key
- The group's name and `enable_login` setting should remain editable

### Configuration

- Consider adding a setting for the default group key to allow customization:
  ```typescript
  settings.default_user_group = { 
    value: { key: 'default' },
    description: 'Group automatically assigned to new users when no groups specified'
  }
  ```
- This allows organizations to use their own naming conventions while maintaining the auto-assignment behavior

### Installation Integration

- Add group seeding to the installation process alongside client seeding
- Create a new `seedDefaultGroups` function in `models/install.ts` or extend `seedDefaultClients`:
  ```typescript
  export async function seedDefaultGroups(context: Context) {
    await context.db.insert(groups).values({
      key: 'default',
      name: 'Default',
      enableLogin: true
    });
  }
  ```

### Error Handling

- Use consistent error codes matching existing patterns:
  - `USER_LOGIN_NOT_ALLOWED` when user has no groups with `enable_login = true`
  - Include error code in audit logs for monitoring
- Error message should be generic to prevent information leakage: "Authentication not permitted"

### UI/UX Refinements

- Default group should be visible in Admin UI but with visual indication of its special status
- Add tooltip or help text explaining the default group's purpose
- Consider adding a badge or icon to indicate system-managed groups
- Sort groups with `default` always appearing first in lists

---

## Implementation Plan (Checklists)

### Database and Migrations

- [ ] Create migration: `ALTER TABLE groups ADD COLUMN enable_login boolean NOT NULL DEFAULT true;`
- [ ] Seed `default` group during install complete with `enable_login = true` if not present
- [ ] Backfill: insert into `user_groups` the pair `(user_sub, 'default')` for users with zero groups
- [ ] Update Drizzle schema to include `enableLogin` on `groups`
- [ ] Add `settings.default_user_group` configuration (optional, for customization)

### Models

- [ ] `models/groups.ts`: accept and persist `enableLogin` in create/update return shapes
- [ ] `models/groups.ts#deleteGroup`: prevent deletion of `default` group
- [ ] `models/groupsList.ts`: include `enableLogin` in list/select
- [ ] `models/users.ts#createUser`: auto‑assign `default` when no groups provided
- [ ] `models/registration.ts#userOpaqueRegisterFinish`: auto‑assign `default`
- [ ] `models/install.ts`: add `seedDefaultGroups` function or extend existing seed functions

### Controllers (Admin)

- [ ] `controllers/admin/groupCreate.ts`: Zod accept `enableLogin` (default true), return it
- [ ] `controllers/admin/groupUpdate.ts`: accept `enableLogin`, update row
- [ ] `controllers/admin/groups.ts`: include `enableLogin` in response schema

### Controllers (User Login Enforcement)

- [ ] `controllers/user/opaqueLoginFinish.ts`: after OPAQUE success, verify at least one membership with `enable_login = true`; else 403 with error code `USER_LOGIN_NOT_ALLOWED`

### Services and Settings

- [ ] No new global settings; ensure existing settings loader unchanged

### Admin UI

- [ ] `services/api.ts`: extend `Group` type and create/update payloads to include `enableLogin`
- [ ] Group Create page: add "Settings" card above "Permissions" with "Enable login" toggle (default on)
- [ ] Group Edit page: surface and persist the same toggle
- [ ] Group List page: add visual indicator for `default` group (badge/icon)
- [ ] Group List page: sort with `default` group always first
- [ ] Group Edit page: disable key editing for `default` group (name and enableLogin remain editable)
- [ ] Optional: indicate `enableLogin` status in group list rows

### Tests

- [ ] Migration test: `enable_login` exists and defaults to true
- [ ] Install test: `default` group created with `enable_login = true`
- [ ] Backfill test: users with no groups gain `default`
- [ ] User creation test: auto‑assign `default` when no groups provided
- [ ] Self‑registration test: auto‑assign `default`
- [ ] Login gating test: user with only disabled groups cannot log in; enabling any group allows login
- [ ] Default group deletion test: verify deletion is prevented with appropriate error
- [ ] Admin API schema tests: create/update include `enableLogin` and reflect in list
- [ ] Error code test: verify `USER_LOGIN_NOT_ALLOWED` error code when no enabled groups
- [ ] Audit log test: verify login denial events are properly logged

### Documentation

- [ ] Update Admin UI docs for Groups: Settings section and toggle semantics
- [ ] Update API docs/OpenAPI for group schemas
- [ ] Changelog entry

### Deployment

- [ ] Apply migration
- [ ] Run install seeding on fresh environments
- [ ] Monitor audit logs for `USER_LOGIN_NOT_ALLOWED` spikes during Phase 2

## Pseudocode Notes (non‑binding)

- Enforce gating in login finish: query `SELECT 1 FROM user_groups ug JOIN groups g ON ug.group_key=g.key WHERE ug.user_sub=$1 AND g.enable_login = true LIMIT 1` and branch accordingly.

- Backfill query: `INSERT INTO user_groups(user_sub, group_key) SELECT u.sub, 'default' FROM users u LEFT JOIN user_groups ug ON ug.user_sub = u.sub WHERE ug.user_sub IS NULL;`

- Reject delete of `default` in `models/groups.ts#deleteGroup`.

