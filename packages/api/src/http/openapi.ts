import { toJSONSchema, z } from "zod/v4";
import { deleteAdminUserOtpSchema, getAdminUserOtpSchema } from "../controllers/admin/adminOtp.js";
import { schema as adminAdminUserCreateSchema } from "../controllers/admin/adminUserCreate.js";
import { schema as adminAdminUserDeleteSchema } from "../controllers/admin/adminUserDelete.js";
import { schema as adminAdminUserPasswordResetSchema } from "../controllers/admin/adminUserPasswordReset.js";
import { schema as adminAdminUserPasswordSetFinishSchema } from "../controllers/admin/adminUserPasswordSetFinish.js";
import { schema as adminAdminUserPasswordSetStartSchema } from "../controllers/admin/adminUserPasswordSetStart.js";
import { schema as adminAdminUsersSchema } from "../controllers/admin/adminUsers.js";
import { schema as adminAdminUserUpdateSchema } from "../controllers/admin/adminUserUpdate.js";
import { schema as adminAuditLogDetailSchema } from "../controllers/admin/auditLogDetail.js";
import { schema as adminAuditLogExportSchema } from "../controllers/admin/auditLogExport.js";
import { schema as adminAuditLogsSchema } from "../controllers/admin/auditLogs.js";
import { schema as adminClientCreateSchema } from "../controllers/admin/clientCreate.js";
import { schema as adminClientDeleteSchema } from "../controllers/admin/clientDelete.js";
import { schema as adminClientsSchema } from "../controllers/admin/clients.js";
import { schema as adminClientUpdateSchema } from "../controllers/admin/clientUpdate.js";
import { schema as adminGroupCreateSchema } from "../controllers/admin/groupCreate.js";
import { schema as adminGroupDeleteSchema } from "../controllers/admin/groupDelete.js";
import { schema as adminGroupsSchema } from "../controllers/admin/groups.js";
import { schema as adminGroupUpdateSchema } from "../controllers/admin/groupUpdate.js";
import { schema as adminGroupUsersSchema } from "../controllers/admin/groupUsers.js";
import { schema as adminGroupUsersUpdateSchema } from "../controllers/admin/groupUsersUpdate.js";
import { schema as adminJwksSchema } from "../controllers/admin/jwks.js";
import { schema as adminJwksRotateSchema } from "../controllers/admin/jwksRotate.js";
import { schema as adminLogoutSchema } from "../controllers/admin/logout.js";
import { schema as adminOpaqueLoginFinishSchema } from "../controllers/admin/opaqueLoginFinish.js";
import { schema as adminOpaqueLoginStartSchema } from "../controllers/admin/opaqueLoginStart.js";
import {
  getAdminOtpStatusSchema,
  postAdminOtpDisableSchema,
  postAdminOtpResetSchema,
  postAdminOtpSetupInitSchema,
  postAdminOtpSetupVerifySchema,
  postAdminOtpVerifySchema,
} from "../controllers/admin/otp.js";
import { schema as adminPasswordChangeFinishSchema } from "../controllers/admin/passwordChangeFinish.js";
import { schema as adminPermissionCreateSchema } from "../controllers/admin/permissionCreate.js";
import { schema as adminPermissionDeleteSchema } from "../controllers/admin/permissionDelete.js";
import { schema as adminPermissionsSchema } from "../controllers/admin/permissions.js";
import { schema as adminRefreshTokenSchema } from "../controllers/admin/refreshToken.js";
import { schema as adminSessionSchema } from "../controllers/admin/session.js";
import { schema as adminSettingsSchema } from "../controllers/admin/settings.js";
import { schema as adminSettingsUpdateSchema } from "../controllers/admin/settingsUpdate.js";
import { schema as adminUserCreateSchema } from "../controllers/admin/userCreate.js";
import { schema as adminUserDeleteSchema } from "../controllers/admin/userDelete.js";
import { schema as adminUserGroupsSchema } from "../controllers/admin/userGroups.js";
import { schema as adminUserGroupsUpdateSchema } from "../controllers/admin/userGroupsUpdate.js";
import { schema as adminUserOtpSchema } from "../controllers/admin/userOtp.js";
import { schema as adminUserOtpDeleteSchema } from "../controllers/admin/userOtpDelete.js";
import { schema as adminUserOtpUnlockSchema } from "../controllers/admin/userOtpUnlock.js";
import { schema as adminUserPasswordResetSchema } from "../controllers/admin/userPasswordReset.js";
import { schema as adminUserPasswordSetFinishSchema } from "../controllers/admin/userPasswordSetFinish.js";
import { schema as adminUserPasswordSetStartSchema } from "../controllers/admin/userPasswordSetStart.js";
import { schema as adminUserPermissionsSchema } from "../controllers/admin/userPermissions.js";
import { schema as adminUserPermissionsUpdateSchema } from "../controllers/admin/userPermissionsUpdate.js";
import { schema as adminUsersSchema } from "../controllers/admin/users.js";
import { schema as adminUserUpdateSchema } from "../controllers/admin/userUpdate.js";
import { schema as userAuthorizeSchema } from "../controllers/user/authorize.js";
import { schema as userAuthorizeFinalizeSchema } from "../controllers/user/authorizeFinalize.js";
import { schema as userEncPublicGetSchema } from "../controllers/user/encPublicGet.js";
import { schema as userEncPublicPutSchema } from "../controllers/user/encPublicPut.js";
import { schema as userAppsSchema } from "../controllers/user/getUserApps.js";
import { schema as userLogoutSchema } from "../controllers/user/logout.js";
import { schema as userOpaqueLoginFinishSchema } from "../controllers/user/opaqueLoginFinish.js";
import { schema as userOpaqueLoginStartSchema } from "../controllers/user/opaqueLoginStart.js";
import { schema as userOpaqueRegisterFinishSchema } from "../controllers/user/opaqueRegisterFinish.js";
import { schema as userOpaqueRegisterStartSchema } from "../controllers/user/opaqueRegisterStart.js";
import { schema as userOtpReauthSchema } from "../controllers/user/otpReauth.js";
import { schema as userOtpSetupInitSchema } from "../controllers/user/otpSetupInit.js";
import { schema as userOtpSetupVerifySchema } from "../controllers/user/otpSetupVerify.js";
import { schema as userOtpStatusSchema } from "../controllers/user/otpStatus.js";
import { schema as userOtpVerifySchema } from "../controllers/user/otpVerify.js";
import { schema as userPasswordChangeFinishSchema } from "../controllers/user/passwordChangeFinish.js";
import { schema as userPasswordChangeStartSchema } from "../controllers/user/passwordChangeStart.js";
import { schema as userPasswordChangeVerifyFinishSchema } from "../controllers/user/passwordChangeVerifyFinish.js";
import { schema as userPasswordChangeVerifyStartSchema } from "../controllers/user/passwordChangeVerifyStart.js";
import { schema as userRefreshTokenSchema } from "../controllers/user/refreshToken.js";
import { schema as userSessionSchema } from "../controllers/user/session.js";
import { schema as userTokenSchema } from "../controllers/user/token.js";
import {
  getUserSchema as userDirectoryGetSchema,
  schema as userDirectorySearchSchema,
} from "../controllers/user/usersDirectory.js";
import { schema as userWellKnownJwksSchema } from "../controllers/user/wellKnownJwks.js";
import { schema as userWellKnownOpenidSchema } from "../controllers/user/wellKnownOpenid.js";
import { schema as userWrappedDrkSchema } from "../controllers/user/wrappedDrk.js";
import { schema as userWrappedDrkPutSchema } from "../controllers/user/wrappedDrkPut.js";
import { schema as userWrappedEncPrivGetSchema } from "../controllers/user/wrappedEncPrivGet.js";
import { schema as userWrappedEncPrivPutSchema } from "../controllers/user/wrappedEncPrivPut.js";
import type { ControllerSchema } from "../types.js";

const documentedSchemas: ControllerSchema[] = [
  adminSessionSchema,
  adminLogoutSchema,
  adminRefreshTokenSchema,
  adminOpaqueLoginStartSchema,
  adminOpaqueLoginFinishSchema,
  getAdminOtpStatusSchema,
  postAdminOtpSetupInitSchema,
  postAdminOtpSetupVerifySchema,
  postAdminOtpVerifySchema,
  postAdminOtpDisableSchema,
  postAdminOtpResetSchema,
  adminAdminUsersSchema,
  adminAdminUserCreateSchema,
  adminAdminUserUpdateSchema,
  adminAdminUserDeleteSchema,
  adminAdminUserPasswordSetStartSchema,
  adminAdminUserPasswordSetFinishSchema,
  adminAdminUserPasswordResetSchema,
  getAdminUserOtpSchema,
  deleteAdminUserOtpSchema,
  adminAuditLogsSchema,
  adminAuditLogDetailSchema,
  adminAuditLogExportSchema,
  adminClientsSchema,
  adminClientCreateSchema,
  adminClientUpdateSchema,
  adminClientDeleteSchema,
  adminGroupsSchema,
  adminGroupCreateSchema,
  adminGroupUpdateSchema,
  adminGroupDeleteSchema,
  adminGroupUsersSchema,
  adminGroupUsersUpdateSchema,
  adminPermissionsSchema,
  adminPermissionCreateSchema,
  adminPermissionDeleteSchema,
  adminSettingsSchema,
  adminSettingsUpdateSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  adminUserDeleteSchema,
  adminUsersSchema,
  adminUserGroupsSchema,
  adminUserGroupsUpdateSchema,
  adminUserOtpSchema,
  adminUserOtpDeleteSchema,
  adminUserOtpUnlockSchema,
  adminUserPermissionsSchema,
  adminUserPermissionsUpdateSchema,
  adminUserPasswordSetStartSchema,
  adminUserPasswordSetFinishSchema,
  adminUserPasswordResetSchema,
  adminPasswordChangeFinishSchema,
  adminJwksSchema,
  adminJwksRotateSchema,
  userAuthorizeSchema,
  userAuthorizeFinalizeSchema,
  userSessionSchema,
  userLogoutSchema,
  userRefreshTokenSchema,
  userTokenSchema,
  userOtpStatusSchema,
  userOtpVerifySchema,
  userOtpReauthSchema,
  userOtpSetupInitSchema,
  userOtpSetupVerifySchema,
  userAppsSchema,
  userOpaqueLoginStartSchema,
  userOpaqueLoginFinishSchema,
  userOpaqueRegisterStartSchema,
  userOpaqueRegisterFinishSchema,
  userPasswordChangeStartSchema,
  userPasswordChangeFinishSchema,
  userPasswordChangeVerifyStartSchema,
  userPasswordChangeVerifyFinishSchema,
  userEncPublicGetSchema,
  userEncPublicPutSchema,
  userWrappedDrkSchema,
  userWrappedDrkPutSchema,
  userWrappedEncPrivGetSchema,
  userWrappedEncPrivPutSchema,
  userWellKnownJwksSchema,
  userWellKnownOpenidSchema,
  userDirectorySearchSchema,
  userDirectoryGetSchema,
];

function isZodType(value: unknown): value is z.ZodTypeAny {
  return value instanceof z.ZodType;
}

function toJsonSchema(schema: unknown) {
  if (isZodType(schema)) return toJSONSchema(schema);
  return schema;
}

function paramsFromObject(object: z.ZodObject<z.ZodRawShape>, location: "path" | "query") {
  const shapeEntries = Object.entries(object.shape);
  return shapeEntries.map(([name, definition]) => {
    const optional =
      typeof (definition as { isOptional?: () => boolean }).isOptional === "function"
        ? (definition as { isOptional?: () => boolean }).isOptional?.() || false
        : false;
    return {
      name,
      in: location,
      required: location === "path" || !optional,
      schema: toJsonSchema(definition),
    };
  });
}

function buildResponses(responses: ControllerSchema["responses"]) {
  return Object.fromEntries(
    Object.entries(responses).map(([status, response]) => {
      const content = response.content
        ? Object.fromEntries(
            Object.entries(response.content).map(([contentType, item]) => [
              contentType,
              { schema: toJsonSchema(item.schema) },
            ])
          )
        : undefined;
      return [
        status,
        {
          description: response.description,
          ...(content ? { content } : {}),
        },
      ];
    })
  );
}

function buildRequestBody(schema: ControllerSchema): Record<string, unknown> | undefined {
  if (!schema.body) return undefined;
  return {
    description: schema.body.description ?? "",
    required: schema.body.required ?? true,
    content: {
      [schema.body.contentType]: {
        schema: toJsonSchema(schema.body.schema),
      },
    },
  };
}

export function generateOpenApiDocument(adminUrl: string, userUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const schema of documentedSchemas) {
    const method = schema.method.toLowerCase();
    let pathItem = paths[schema.path];
    if (!pathItem) {
      pathItem = {};
      paths[schema.path] = pathItem;
    }
    const parameters = [] as Array<Record<string, unknown>>;
    if (schema.params) parameters.push(...paramsFromObject(schema.params, "path"));
    if (schema.query) parameters.push(...paramsFromObject(schema.query, "query"));
    const requestBody = buildRequestBody(schema);
    const responses = buildResponses(schema.responses);

    pathItem[method] = {
      summary: schema.summary,
      description: schema.description,
      tags: schema.tags,
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses,
    };
  }

  return {
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "DarkAuth API",
      description: "Generated API documentation",
    },
    servers: [{ url: adminUrl }, { url: userUrl }],
    paths,
    components: {
      schemas: {
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
                  path: {
                    type: "array",
                    items: { anyOf: [{ type: "string" }, { type: "number" }] },
                  },
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
      },
    },
  };
}
