import { toJSONSchema, z } from "zod/v4";
import { deleteAdminUserOtpSchema, getAdminUserOtpSchema } from "../controllers/admin/adminOtp.ts";
import { schema as adminAdminUserCreateSchema } from "../controllers/admin/adminUserCreate.ts";
import { schema as adminAdminUserDeleteSchema } from "../controllers/admin/adminUserDelete.ts";
import { schema as adminAdminUserPasswordResetSchema } from "../controllers/admin/adminUserPasswordReset.ts";
import { schema as adminAdminUserPasswordSetFinishSchema } from "../controllers/admin/adminUserPasswordSetFinish.ts";
import { schema as adminAdminUserPasswordSetStartSchema } from "../controllers/admin/adminUserPasswordSetStart.ts";
import { schema as adminAdminUsersSchema } from "../controllers/admin/adminUsers.ts";
import { schema as adminAdminUserUpdateSchema } from "../controllers/admin/adminUserUpdate.ts";
import { schema as adminAuditLogDetailSchema } from "../controllers/admin/auditLogDetail.ts";
import { schema as adminAuditLogExportSchema } from "../controllers/admin/auditLogExport.ts";
import { schema as adminAuditLogsSchema } from "../controllers/admin/auditLogs.ts";
import { schema as adminClientCreateSchema } from "../controllers/admin/clientCreate.ts";
import { schema as adminClientDeleteSchema } from "../controllers/admin/clientDelete.ts";
import { schema as adminClientSecretSchema } from "../controllers/admin/clientSecret.ts";
import { schema as adminClientsSchema } from "../controllers/admin/clients.ts";
import { schema as adminClientUpdateSchema } from "../controllers/admin/clientUpdate.ts";
import { schema as adminJwksSchema } from "../controllers/admin/jwks.ts";
import { schema as adminJwksRotateSchema } from "../controllers/admin/jwksRotate.ts";
import { schema as adminLogoutSchema } from "../controllers/admin/logout.ts";
import { schema as adminOpaqueLoginFinishSchema } from "../controllers/admin/opaqueLoginFinish.ts";
import { schema as adminOpaqueLoginStartSchema } from "../controllers/admin/opaqueLoginStart.ts";
import { schema as adminOrganizationCreateSchema } from "../controllers/admin/organizationCreate.ts";
import { schema as adminOrganizationDeleteSchema } from "../controllers/admin/organizationDelete.ts";
import { schema as adminOrganizationGetSchema } from "../controllers/admin/organizationGet.ts";
import { schema as adminOrganizationMemberCreateSchema } from "../controllers/admin/organizationMemberCreate.ts";
import { schema as adminOrganizationMemberDeleteSchema } from "../controllers/admin/organizationMemberDelete.ts";
import { schema as adminOrganizationMemberRoleDeleteSchema } from "../controllers/admin/organizationMemberRoleDelete.ts";
import { schema as adminOrganizationMemberRolesAddSchema } from "../controllers/admin/organizationMemberRolesAdd.ts";
import { schema as adminOrganizationMemberRolesUpdateSchema } from "../controllers/admin/organizationMemberRolesUpdate.ts";
import { schema as adminOrganizationMembersSchema } from "../controllers/admin/organizationMembers.ts";
import { schema as adminOrganizationsSchema } from "../controllers/admin/organizations.ts";
import { schema as adminOrganizationUpdateSchema } from "../controllers/admin/organizationUpdate.ts";
import {
  getAdminOtpStatusSchema,
  postAdminOtpDisableSchema,
  postAdminOtpResetSchema,
  postAdminOtpSetupInitSchema,
  postAdminOtpSetupVerifySchema,
  postAdminOtpVerifySchema,
} from "../controllers/admin/otp.ts";
import { schema as adminPasswordChangeFinishSchema } from "../controllers/admin/passwordChangeFinish.ts";
import { schema as adminPermissionCreateSchema } from "../controllers/admin/permissionCreate.ts";
import { schema as adminPermissionDeleteSchema } from "../controllers/admin/permissionDelete.ts";
import { schema as adminPermissionsSchema } from "../controllers/admin/permissions.ts";
import { schema as adminRefreshTokenSchema } from "../controllers/admin/refreshToken.ts";
import { schema as adminRoleCreateSchema } from "../controllers/admin/roleCreate.ts";
import { schema as adminRoleDeleteSchema } from "../controllers/admin/roleDelete.ts";
import { schema as adminRoleGetSchema } from "../controllers/admin/roleGet.ts";
import { schema as adminRolePermissionsUpdateSchema } from "../controllers/admin/rolePermissionsUpdate.ts";
import { schema as adminRolesSchema } from "../controllers/admin/roles.ts";
import { schema as adminRoleUpdateSchema } from "../controllers/admin/roleUpdate.ts";
import { schema as adminSessionSchema } from "../controllers/admin/session.ts";
import { schema as adminSettingsSchema } from "../controllers/admin/settings.ts";
import { schema as adminSettingsUpdateSchema } from "../controllers/admin/settingsUpdate.ts";
import { schema as adminUserCreateSchema } from "../controllers/admin/userCreate.ts";
import { schema as adminUserDeleteSchema } from "../controllers/admin/userDelete.ts";
import { schema as adminUserOtpSchema } from "../controllers/admin/userOtp.ts";
import { schema as adminUserOtpDeleteSchema } from "../controllers/admin/userOtpDelete.ts";
import { schema as adminUserOtpUnlockSchema } from "../controllers/admin/userOtpUnlock.ts";
import { schema as adminUserPasswordResetSchema } from "../controllers/admin/userPasswordReset.ts";
import { schema as adminUserPasswordSetFinishSchema } from "../controllers/admin/userPasswordSetFinish.ts";
import { schema as adminUserPasswordSetStartSchema } from "../controllers/admin/userPasswordSetStart.ts";
import { schema as adminUserPermissionsSchema } from "../controllers/admin/userPermissions.ts";
import { schema as adminUserPermissionsUpdateSchema } from "../controllers/admin/userPermissionsUpdate.ts";
import { schema as adminUsersSchema } from "../controllers/admin/users.ts";
import { schema as adminUserUpdateSchema } from "../controllers/admin/userUpdate.ts";
import { schema as userAuthorizeSchema } from "../controllers/user/authorize.ts";
import { schema as userAuthorizeFinalizeSchema } from "../controllers/user/authorizeFinalize.ts";
import { schema as userEncPublicGetSchema } from "../controllers/user/encPublicGet.ts";
import { schema as userEncPublicPutSchema } from "../controllers/user/encPublicPut.ts";
import { schema as userAppsSchema } from "../controllers/user/getUserApps.ts";
import { schema as userLogoutSchema } from "../controllers/user/logout.ts";
import { schema as userOpaqueLoginFinishSchema } from "../controllers/user/opaqueLoginFinish.ts";
import { schema as userOpaqueLoginStartSchema } from "../controllers/user/opaqueLoginStart.ts";
import { schema as userOpaqueRegisterFinishSchema } from "../controllers/user/opaqueRegisterFinish.ts";
import { schema as userOpaqueRegisterStartSchema } from "../controllers/user/opaqueRegisterStart.ts";
import {
  createOrganizationSchema as userCreateOrganizationSchema,
  organizationInvitesSchema as userOrganizationInvitesSchema,
  organizationMemberRoleDeleteSchema as userOrganizationMemberRoleDeleteSchema,
  organizationMemberRolesSchema as userOrganizationMemberRolesSchema,
  organizationMembersSchema as userOrganizationMembersSchema,
  organizationSchema as userOrganizationSchema,
  organizationsSchema as userOrganizationsSchema,
} from "../controllers/user/organizations.ts";
import { schema as userOtpReauthSchema } from "../controllers/user/otpReauth.ts";
import { schema as userOtpSetupInitSchema } from "../controllers/user/otpSetupInit.ts";
import { schema as userOtpSetupVerifySchema } from "../controllers/user/otpSetupVerify.ts";
import { schema as userOtpStatusSchema } from "../controllers/user/otpStatus.ts";
import { schema as userOtpVerifySchema } from "../controllers/user/otpVerify.ts";
import { schema as userPasswordChangeFinishSchema } from "../controllers/user/passwordChangeFinish.ts";
import { schema as userPasswordChangeStartSchema } from "../controllers/user/passwordChangeStart.ts";
import { schema as userPasswordChangeVerifyFinishSchema } from "../controllers/user/passwordChangeVerifyFinish.ts";
import { schema as userPasswordChangeVerifyStartSchema } from "../controllers/user/passwordChangeVerifyStart.ts";
import { schema as userRefreshTokenSchema } from "../controllers/user/refreshToken.ts";
import { schema as userSessionSchema } from "../controllers/user/session.ts";
import { schema as userTokenSchema } from "../controllers/user/token.ts";
import {
  getUserSchema as userDirectoryGetSchema,
  schema as userDirectorySearchSchema,
} from "../controllers/user/usersDirectory.ts";
import { schema as userWellKnownJwksSchema } from "../controllers/user/wellKnownJwks.ts";
import { schema as userWellKnownOpenidSchema } from "../controllers/user/wellKnownOpenid.ts";
import { schema as userWrappedDrkSchema } from "../controllers/user/wrappedDrk.ts";
import { schema as userWrappedDrkPutSchema } from "../controllers/user/wrappedDrkPut.ts";
import { schema as userWrappedEncPrivGetSchema } from "../controllers/user/wrappedEncPrivGet.ts";
import { schema as userWrappedEncPrivPutSchema } from "../controllers/user/wrappedEncPrivPut.ts";
import type { ControllerSchema } from "../types.ts";

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
  adminClientSecretSchema,
  adminClientUpdateSchema,
  adminClientDeleteSchema,
  adminOrganizationsSchema,
  adminOrganizationCreateSchema,
  adminOrganizationGetSchema,
  adminOrganizationUpdateSchema,
  adminOrganizationDeleteSchema,
  adminOrganizationMemberCreateSchema,
  adminOrganizationMemberDeleteSchema,
  adminOrganizationMembersSchema,
  adminOrganizationMemberRolesAddSchema,
  adminOrganizationMemberRolesUpdateSchema,
  adminOrganizationMemberRoleDeleteSchema,
  adminRolesSchema,
  adminRoleCreateSchema,
  adminRoleGetSchema,
  adminRoleUpdateSchema,
  adminRoleDeleteSchema,
  adminRolePermissionsUpdateSchema,
  adminPermissionsSchema,
  adminPermissionCreateSchema,
  adminPermissionDeleteSchema,
  adminSettingsSchema,
  adminSettingsUpdateSchema,
  adminUserCreateSchema,
  adminUserUpdateSchema,
  adminUserDeleteSchema,
  adminUsersSchema,
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
  userOrganizationsSchema,
  userCreateOrganizationSchema,
  userOrganizationSchema,
  userOrganizationMembersSchema,
  userOrganizationInvitesSchema,
  userOrganizationMemberRolesSchema,
  userOrganizationMemberRoleDeleteSchema,
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
