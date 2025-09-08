# Controller Refactor Checklist

Scope: Move all data/model logic from controllers into `packages/api/src/models/*` per 1_CODE_GUIDE.

Legend: [x] refactored, [ ] pending, [~] not needed (no model logic)

## Install
 - [~] install/getInstall.ts
 - [x] install/opaqueRegisterFinish.ts
 - [~] install/opaqueRegisterStart.ts
 - [x] install/postInstallComplete.ts

## User
 - [x] user/authorize.ts
- [x] user/authorizeFinalize.ts
- [x] user/encPublicGet.ts
- [x] user/encPublicPut.ts
- [x] user/getUserApps.ts
- [x] user/logout.ts
 - [x] user/opaqueLoginFinish.ts
- [x] user/opaqueLoginStart.ts
- [x] user/opaqueRegisterFinish.ts
- [~] user/opaqueRegisterStart.ts
- [x] user/passwordChangeFinish.ts
 - [~] user/passwordChangeStart.ts
 - [~] user/passwordChangeVerifyFinish.ts
- [x] user/passwordChangeVerifyStart.ts
 - [~] user/refreshToken.ts
- [x] user/session.ts
 - [x] user/token.ts
- [x] user/usersDirectory.ts
 - [~] user/wellKnownJwks.ts
 - [~] user/wellKnownOpenid.ts
- [x] user/wrappedDrk.ts
- [x] user/wrappedDrkPut.ts
- [x] user/wrappedEncPrivGet.ts
- [x] user/wrappedEncPrivPut.ts

## Admin
- [x] admin/adminUserCreate.ts
 - [x] admin/adminUserDelete.ts
 - [x] admin/adminUserPasswordReset.ts
 - [x] admin/adminUserPasswordSetFinish.ts
 - [x] admin/adminUserPasswordSetStart.ts
- [x] admin/adminUsers.ts
 - [x] admin/adminUserUpdate.ts
 - [x] admin/auditLogDetail.ts
 - [x] admin/auditLogExport.ts
- [x] admin/auditLogs.ts
- [x] admin/clientCreate.ts
- [x] admin/clientDelete.ts
- [x] admin/clients.ts
- [x] admin/clientUpdate.ts
- [x] admin/groupCreate.ts
 - [x] admin/groupDelete.ts
- [x] admin/groups.ts
 - [x] admin/groupUpdate.ts
- [x] admin/groupUsers.ts
- [x] admin/groupUsersUpdate.ts
- [x] admin/jwks.ts
- [x] admin/jwksRotate.ts
 - [~] admin/logout.ts
 - [x] admin/opaqueLoginFinish.ts
 - [x] admin/opaqueLoginStart.ts
 - [x] admin/passwordChangeFinish.ts
 - [~] admin/passwordChangeStart.ts
- [~] admin/permissionCreate.ts
 - [x] admin/permissionDelete.ts
- [x] admin/permissions.ts
 - [~] admin/refreshToken.ts
 - [x] admin/session.ts
- [x] admin/settings.ts
 - [~] admin/settingsUpdate.ts
- [x] admin/userCreate.ts
- [x] admin/userDelete.ts
- [x] admin/userGroups.ts
- [x] admin/userGroupsUpdate.ts
 - [x] admin/userPasswordReset.ts
- [x] admin/userPasswordSetFinish.ts
- [x] admin/userPasswordSetStart.ts
 - [x] admin/userPermissions.ts
- [x] admin/userPermissionsUpdate.ts
- [x] admin/users.ts
- [x] admin/userUpdate.ts

## Revisit/Polish
- [x] Normalize model naming (list*/get*/create*/update*/delete*) across:
  - models/clients.ts — [x] deleteClientById → deleteClient, [x] getClientById → getClient
  - models/users.ts — [x] findUserBySub → getUserBySub, [x] findUserBySubOrEmail → getUserBySubOrEmail
  - models/groups.ts — [x] updateGroupName → updateGroup, [x] deleteGroupByKey → deleteGroup
  - models/authCodes.ts — [x] getAuthCode/deleteAuthCode OK
- [x] Consolidate thin models (e.g., opaque.ts) or co-locate with related domain modules
  - Moved getUserOpaqueRecordByEmail into models/users.ts, removed models/opaque.ts
- [x] Re-scan controllers for any lingering `context.db` usage
  - Addressed admin/opaqueLoginStart.ts via model getAdminOpaqueRecordByAdminId
  - install/postInstallComplete.ts uses services/models only; no direct queries
