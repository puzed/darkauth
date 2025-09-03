import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { registerOpenApi as regAdminUserCreate } from "../controllers/admin/adminUserCreate.js";
import { registerOpenApi as regAdminUserDelete } from "../controllers/admin/adminUserDelete.js";
import { registerOpenApi as regAdminUsersList } from "../controllers/admin/adminUsers.js";
import { registerOpenApi as regAdminUserUpdate } from "../controllers/admin/adminUserUpdate.js";
import { registerOpenApi as regAuditLogDetail } from "../controllers/admin/auditLogDetail.js";
import { registerOpenApi as regAuditLogExport } from "../controllers/admin/auditLogExport.js";
import { registerOpenApi as regAuditLogs } from "../controllers/admin/auditLogs.js";
import { registerOpenApi as regClientCreate } from "../controllers/admin/clientCreate.js";
import { registerOpenApi as regClientDelete } from "../controllers/admin/clientDelete.js";
import { registerOpenApi as regClientsList } from "../controllers/admin/clients.js";
import { registerOpenApi as regClientUpdate } from "../controllers/admin/clientUpdate.js";
import { registerOpenApi as regGroupCreate } from "../controllers/admin/groupCreate.js";
import { registerOpenApi as regGroupDelete } from "../controllers/admin/groupDelete.js";
import { registerOpenApi as regGroupsList } from "../controllers/admin/groups.js";
import { registerOpenApi as regGroupUpdate } from "../controllers/admin/groupUpdate.js";
import { registerOpenApi as regGroupUsers } from "../controllers/admin/groupUsers.js";
import { registerOpenApi as regGroupUsersUpdate } from "../controllers/admin/groupUsersUpdate.js";
import { registerOpenApi as regJwks } from "../controllers/admin/jwks.js";
import { registerOpenApi as regJwksRotate } from "../controllers/admin/jwksRotate.js";
import { registerOpenApi as regAdminLogout } from "../controllers/admin/logout.js";
import { registerOpenApi as regPermissionsList } from "../controllers/admin/permissions.js";
import { registerOpenApi as regAdminRefresh } from "../controllers/admin/refreshToken.js";
import { registerOpenApi as regAdminSession } from "../controllers/admin/session.js";
import { registerOpenApi as regSettings } from "../controllers/admin/settings.js";
import { registerOpenApi as regSettingsUpdate } from "../controllers/admin/settingsUpdate.js";
import { registerOpenApi as regUserCreate } from "../controllers/admin/userCreate.js";
import { registerOpenApi as regUserDelete } from "../controllers/admin/userDelete.js";
import { registerOpenApi as regUserGroups } from "../controllers/admin/userGroups.js";
import { registerOpenApi as regUserPermissions } from "../controllers/admin/userPermissions.js";
import { registerOpenApi as regUserPermissionsUpdate } from "../controllers/admin/userPermissionsUpdate.js";
import { registerOpenApi as regUsersList } from "../controllers/admin/users.js";
import { registerOpenApi as regUserUpdate } from "../controllers/admin/userUpdate.js";
import { registerOpenApi as regUserAuthorize } from "../controllers/user/authorize.js";
import { registerOpenApi as regUserAuthorizeFinalize } from "../controllers/user/authorizeFinalize.js";
import { registerOpenApi as regUserEncPubGet } from "../controllers/user/encPublicGet.js";
import { registerOpenApi as regUserEncPubPut } from "../controllers/user/encPublicPut.js";
import { registerOpenApi as regUserLogout } from "../controllers/user/logout.js";
import { registerOpenApi as regUserOpaqueLoginFinish } from "../controllers/user/opaqueLoginFinish.js";
import { registerOpenApi as regUserOpaqueLoginStart } from "../controllers/user/opaqueLoginStart.js";
import { registerOpenApi as regUserOpaqueRegisterFinish } from "../controllers/user/opaqueRegisterFinish.js";
import { registerOpenApi as regUserOpaqueRegisterStart } from "../controllers/user/opaqueRegisterStart.js";
import { registerOpenApi as regUserPwdChangeFinish } from "../controllers/user/passwordChangeFinish.js";
import { registerOpenApi as regUserPwdChangeStart } from "../controllers/user/passwordChangeStart.js";
import { registerOpenApi as regUserPwdVerifyFinish } from "../controllers/user/passwordChangeVerifyFinish.js";
import { registerOpenApi as regUserPwdVerifyStart } from "../controllers/user/passwordChangeVerifyStart.js";
import { registerOpenApi as regUserRefresh } from "../controllers/user/refreshToken.js";
import { registerOpenApi as regUserSession } from "../controllers/user/session.js";
import { registerOpenApi as regUserToken } from "../controllers/user/token.js";
import { registerOpenApi as regUserUsersDir } from "../controllers/user/usersDirectory.js";
import { registerOpenApi as regUserWellKnownJwks } from "../controllers/user/wellKnownJwks.js";
import { registerOpenApi as regUserWellKnownOpenid } from "../controllers/user/wellKnownOpenid.js";
import { registerOpenApi as regUserWrappedDrkGet } from "../controllers/user/wrappedDrk.js";
import { registerOpenApi as regUserWrappedDrkPut } from "../controllers/user/wrappedDrkPut.js";
import { registerOpenApi as regUserWrappedEncPrivGet } from "../controllers/user/wrappedEncPrivGet.js";
import { registerOpenApi as regUserWrappedEncPrivPut } from "../controllers/user/wrappedEncPrivPut.js";

export function generateOpenApiDocument(adminUrl: string, userUrl: string) {
  const registry = new OpenAPIRegistry();
  regAdminSession(registry);
  regAdminUsersList(registry);
  regAdminUserCreate(registry);
  regAdminUserUpdate(registry);
  regAdminUserDelete(registry);
  regUsersList(registry);
  regGroupsList(registry);
  regClientsList(registry);
  regClientCreate(registry);
  regPermissionsList(registry);
  regAdminLogout(registry);
  regAdminRefresh(registry);
  regAuditLogExport(registry);
  regUserPwdVerifyFinish(registry);
  regUserPwdVerifyStart(registry);
  regUserPwdChangeFinish(registry);
  regUserPwdChangeStart(registry);
  regUserOpaqueRegisterFinish(registry);
  regUserOpaqueRegisterStart(registry);
  regUserOpaqueLoginFinish(registry);
  regUserOpaqueLoginStart(registry);
  regUserWrappedEncPrivPut(registry);
  regUserWrappedEncPrivGet(registry);
  regUserEncPubPut(registry);
  regUserEncPubGet(registry);
  regUserWrappedDrkPut(registry);
  regUserWrappedDrkGet(registry);
  regUserUsersDir(registry);
  regUserRefresh(registry);
  regUserLogout(registry);
  regUserSession(registry);
  regUserWellKnownJwks(registry);
  regUserWellKnownOpenid(registry);
  regUserToken(registry);
  regUserAuthorizeFinalize(registry);
  regUserAuthorize(registry);
  regAuditLogDetail(registry);
  regAuditLogs(registry);
  regUserPermissionsUpdate(registry);
  regUserPermissions(registry);
  regUserGroups(registry);
  regUserDelete(registry);
  regUserUpdate(registry);
  regUserCreate(registry);
  regGroupUsersUpdate(registry);
  regGroupUsers(registry);
  regGroupDelete(registry);
  regGroupUpdate(registry);
  regGroupCreate(registry);
  regClientDelete(registry);
  regClientUpdate(registry);
  regSettingsUpdate(registry);
  regSettings(registry);
  regJwksRotate(registry);
  regJwks(registry);

  const generator = new OpenApiGeneratorV3(registry.definitions);
  const doc = generator.generateDocument({
    openapi: "3.0.0",
    info: { version: "1.0.0", title: "DarkAuth API", description: "Generated API documentation" },
    servers: [{ url: adminUrl }, { url: userUrl }],
  });

  doc.components = doc.components || {};
  doc.components.schemas = {
    ...(doc.components.schemas || {}),
    ErrorResponse: {
      type: "object",
      properties: {
        error: { type: "string" },
        code: { type: "string" },
      },
      required: ["error"],
      additionalProperties: false,
    },
    ValidationErrorResponse: {
      type: "object",
      properties: {
        error: { type: "string" },
        code: { type: "string" },
        details: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string" },
              path: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] } },
              message: { type: "string" },
            },
            required: ["code", "path", "message"],
            additionalProperties: false,
          },
        },
      },
      required: ["error"],
      additionalProperties: false,
    },
    UnauthorizedResponse: {
      type: "object",
      properties: { error: { type: "string" }, code: { type: "string" } },
      required: ["error"],
      additionalProperties: false,
    },
    ForbiddenResponse: {
      type: "object",
      properties: { error: { type: "string" }, code: { type: "string" } },
      required: ["error"],
      additionalProperties: false,
    },
    NotFoundResponse: {
      type: "object",
      properties: { error: { type: "string" }, code: { type: "string" } },
      required: ["error"],
      additionalProperties: false,
    },
    TooManyRequestsResponse: {
      type: "object",
      properties: {
        error: { type: "string" },
        code: { type: "string" },
        retryAfter: { type: "number" },
      },
      required: ["error"],
      additionalProperties: false,
    },
  };

  return doc;
}
