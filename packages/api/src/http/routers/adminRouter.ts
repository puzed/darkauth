import type { IncomingMessage, ServerResponse } from "node:http";
import { deleteAdminUserOtp, getAdminUserOtp } from "../../controllers/admin/adminOtp.ts";
import { createAdminUserController } from "../../controllers/admin/adminUserCreate.ts";
import { deleteAdminUserController } from "../../controllers/admin/adminUserDelete.ts";
import { postAdminUserPasswordReset } from "../../controllers/admin/adminUserPasswordReset.ts";
import { postAdminUserPasswordSetFinish } from "../../controllers/admin/adminUserPasswordSetFinish.ts";
import { postAdminUserPasswordSetStart } from "../../controllers/admin/adminUserPasswordSetStart.ts";
import { getAdminUsers } from "../../controllers/admin/adminUsers.ts";
import { updateAdminUserController } from "../../controllers/admin/adminUserUpdate.ts";
import { getAuditLogDetail } from "../../controllers/admin/auditLogDetail.ts";
import { getAuditLogExport } from "../../controllers/admin/auditLogExport.ts";
import { getAuditLogs } from "../../controllers/admin/auditLogs.ts";
import { createClient } from "../../controllers/admin/clientCreate.ts";
import { deleteClientController } from "../../controllers/admin/clientDelete.ts";
import { getClientSecretController } from "../../controllers/admin/clientSecret.ts";
import { getClients } from "../../controllers/admin/clients.ts";
import { updateClientController } from "../../controllers/admin/clientUpdate.ts";
import {
  getAdminEmailTemplates,
  putAdminEmailTemplate,
} from "../../controllers/admin/emailTemplates.ts";
import { postAdminEmailTest } from "../../controllers/admin/emailTest.ts";
import { getJwks } from "../../controllers/admin/jwks.ts";
import { rotateJwks } from "../../controllers/admin/jwksRotate.ts";
import { postAdminLogout } from "../../controllers/admin/logout.ts";
import { postAdminOpaqueLoginFinish } from "../../controllers/admin/opaqueLoginFinish.ts";
import { postAdminOpaqueLoginStart } from "../../controllers/admin/opaqueLoginStart.ts";
import { postOrganization } from "../../controllers/admin/organizationCreate.ts";
import { deleteOrganization } from "../../controllers/admin/organizationDelete.ts";
import { getOrganization } from "../../controllers/admin/organizationGet.ts";
import { postOrganizationMember } from "../../controllers/admin/organizationMemberCreate.ts";
import { deleteOrganizationMember } from "../../controllers/admin/organizationMemberDelete.ts";
import { deleteOrganizationMemberRole } from "../../controllers/admin/organizationMemberRoleDelete.ts";
import { postOrganizationMemberRoles } from "../../controllers/admin/organizationMemberRolesAdd.ts";
import { putOrganizationMemberRoles } from "../../controllers/admin/organizationMemberRolesUpdate.ts";
import { getOrganizationMembersAdmin } from "../../controllers/admin/organizationMembers.ts";
import { getOrganizations } from "../../controllers/admin/organizations.ts";
import { putOrganization } from "../../controllers/admin/organizationUpdate.ts";
import {
  getAdminOtpStatus,
  postAdminOtpDisable,
  postAdminOtpReset,
  postAdminOtpSetupInit,
  postAdminOtpSetupVerify,
  postAdminOtpVerify,
} from "../../controllers/admin/otp.ts";
import { postAdminPasswordChangeFinish } from "../../controllers/admin/passwordChangeFinish.ts";
import { postAdminPasswordChangeStart } from "../../controllers/admin/passwordChangeStart.ts";
import { createPermission } from "../../controllers/admin/permissionCreate.ts";
import { deletePermission } from "../../controllers/admin/permissionDelete.ts";
import { getPermissions } from "../../controllers/admin/permissions.ts";
import { postRole } from "../../controllers/admin/roleCreate.ts";
import { deleteRole } from "../../controllers/admin/roleDelete.ts";
import { getRole } from "../../controllers/admin/roleGet.ts";
import { putRolePermissions } from "../../controllers/admin/rolePermissionsUpdate.ts";
import { getRoles } from "../../controllers/admin/roles.ts";
import { putRole } from "../../controllers/admin/roleUpdate.ts";
import { getAdminSession } from "../../controllers/admin/session.ts";
import { getSettings } from "../../controllers/admin/settings.ts";
import { updateSettings } from "../../controllers/admin/settingsUpdate.ts";
import { createUser } from "../../controllers/admin/userCreate.ts";
import { deleteUser } from "../../controllers/admin/userDelete.ts";
import { getUserOtp } from "../../controllers/admin/userOtp.ts";
import { deleteUserOtp } from "../../controllers/admin/userOtpDelete.ts";
import { postUserOtpUnlock } from "../../controllers/admin/userOtpUnlock.ts";
import { postUserPasswordReset } from "../../controllers/admin/userPasswordReset.ts";
import { postUserPasswordSetFinish } from "../../controllers/admin/userPasswordSetFinish.ts";
import { postUserPasswordSetStart } from "../../controllers/admin/userPasswordSetStart.ts";
import { getUserPermissions } from "../../controllers/admin/userPermissions.ts";
import { updateUserPermissions } from "../../controllers/admin/userPermissionsUpdate.ts";
import { getUsers } from "../../controllers/admin/users.ts";
import { updateUser } from "../../controllers/admin/userUpdate.ts";
import { NotFoundError, UnauthorizedError } from "../../errors.ts";
import { getClientDashboardIcon } from "../../models/clients.ts";
import { getSessionId } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";
import { assertCsrf } from "../../utils/csrf.ts";
import { sendError } from "../../utils/http.ts";

export function createAdminRouter(context: Context) {
  return async function router(request: IncomingMessage, response: ServerResponse) {
    const method = request.method || "GET";
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const pathname = url.pathname;

    try {
      // Whitelist of endpoints that don't require session authentication
      const publicEndpoints = [
        "/admin/opaque/login/start",
        "/admin/opaque/login/finish",
        // Note: /admin/session is checked separately as it returns different data based on auth
      ];

      // Check authentication for all endpoints except whitelisted ones
      const isPublicClientIconEndpoint =
        method === "GET" && /^\/client-icons\/[^/]+$/.test(pathname);
      const isPublicEndpoint = publicEndpoints.includes(pathname) || isPublicClientIconEndpoint;
      const isSessionCheck = pathname === "/admin/session";

      if (!isPublicEndpoint && !isSessionCheck) {
        const sessionId = getSessionId(request, true);
        if (!sessionId) {
          throw new UnauthorizedError("Authentication required");
        }
        // Note: We don't validate the session here as each endpoint does its own validation
        // This is just a first-line defense to ensure a token is present
      }

      const needsCsrf = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (needsCsrf) assertCsrf(request, true);
      if (method === "GET" && pathname === "/admin/session") {
        return await getAdminSession(context, request, response);
      }

      if (method === "POST" && pathname === "/admin/logout") {
        return await postAdminLogout(context, request, response);
      }

      if (method === "POST" && pathname === "/admin/opaque/login/start") {
        return await postAdminOpaqueLoginStart(context, request, response);
      }

      if (method === "POST" && pathname === "/admin/opaque/login/finish") {
        return await postAdminOpaqueLoginFinish(context, request, response);
      }

      // Admin OPAQUE register endpoints removed; admin creation occurs only during install

      if (method === "POST" && pathname === "/admin/password/change/start") {
        return await postAdminPasswordChangeStart(context, request, response);
      }

      if (method === "POST" && pathname === "/admin/password/change/finish") {
        return await postAdminPasswordChangeFinish(context, request, response);
      }

      if (pathname === "/admin/users") {
        if (method === "GET") return await getUsers(context, request, response);
        if (method === "POST") return await createUser(context, request, response);
      }

      const userMatch = pathname.match(/^\/admin\/users\/([^/]+)$/);
      if (userMatch) {
        const userSub = userMatch[1];
        if (method === "PUT")
          return await updateUser(context, request, response, userSub as string);
        if (method === "DELETE")
          return await deleteUser(context, request, response, userSub as string);
      }

      const userResetMatch = pathname.match(/^\/admin\/users\/([^/]+)\/password\/reset$/);
      if (userResetMatch) {
        const userSub = userResetMatch[1];
        if (method === "POST")
          return await postUserPasswordReset(context, request, response, userSub as string);
      }

      const userSetStartMatch = pathname.match(/^\/admin\/users\/([^/]+)\/password\/set\/start$/);
      if (userSetStartMatch) {
        const userSub = userSetStartMatch[1];
        if (method === "POST")
          return await postUserPasswordSetStart(context, request, response, userSub as string);
      }

      const userSetFinishMatch = pathname.match(/^\/admin\/users\/([^/]+)\/password\/set\/finish$/);
      if (userSetFinishMatch) {
        const userSub = userSetFinishMatch[1];
        if (method === "POST")
          return await postUserPasswordSetFinish(context, request, response, userSub as string);
      }

      const userPermissionsMatch = pathname.match(/^\/admin\/users\/([^/]+)\/permissions$/);
      if (userPermissionsMatch) {
        const userSub = userPermissionsMatch[1];
        if (method === "GET") {
          return await getUserPermissions(context, request, response, userSub as string);
        }
        if (method === "PUT") {
          return await updateUserPermissions(context, request, response, userSub as string);
        }
      }

      const userOtpMatch = pathname.match(/^\/admin\/users\/([^/]+)\/otp$/);
      if (userOtpMatch) {
        const userSub = userOtpMatch[1];
        if (method === "GET")
          return await getUserOtp(context, request, response, userSub as string);
        if (method === "DELETE")
          return await deleteUserOtp(context, request, response, userSub as string);
      }

      const userOtpUnlockMatch = pathname.match(/^\/admin\/users\/([^/]+)\/otp\/unlock$/);
      if (userOtpUnlockMatch) {
        const userSub = userOtpUnlockMatch[1];
        if (method === "POST")
          return await postUserOtpUnlock(context, request, response, userSub as string);
      }

      if (pathname === "/admin/organizations") {
        if (method === "GET") return await getOrganizations(context, request, response);
        if (method === "POST") return await postOrganization(context, request, response);
      }

      const organizationMatch = pathname.match(/^\/admin\/organizations\/([^/]+)$/);
      if (organizationMatch) {
        const organizationId = organizationMatch[1];
        if (method === "GET")
          return await getOrganization(context, request, response, organizationId as string);
        if (method === "PUT")
          return await putOrganization(context, request, response, organizationId as string);
        if (method === "DELETE")
          return await deleteOrganization(context, request, response, organizationId as string);
      }

      const organizationMemberRolesMatch = pathname.match(
        /^\/admin\/organizations\/([^/]+)\/members\/([^/]+)\/roles$/
      );
      if (organizationMemberRolesMatch) {
        const organizationId = organizationMemberRolesMatch[1];
        const memberId = organizationMemberRolesMatch[2];
        if (method === "PUT") {
          return await putOrganizationMemberRoles(
            context,
            request,
            response,
            organizationId as string,
            memberId as string
          );
        }
        if (method === "POST") {
          return await postOrganizationMemberRoles(
            context,
            request,
            response,
            organizationId as string,
            memberId as string
          );
        }
      }

      const organizationMemberRoleMatch = pathname.match(
        /^\/admin\/organizations\/([^/]+)\/members\/([^/]+)\/roles\/([^/]+)$/
      );
      if (organizationMemberRoleMatch && method === "DELETE") {
        const organizationId = organizationMemberRoleMatch[1];
        const memberId = organizationMemberRoleMatch[2];
        const roleId = organizationMemberRoleMatch[3];
        return await deleteOrganizationMemberRole(
          context,
          request,
          response,
          organizationId as string,
          memberId as string,
          roleId as string
        );
      }

      const organizationMemberMatch = pathname.match(
        /^\/admin\/organizations\/([^/]+)\/members\/([^/]+)$/
      );
      if (organizationMemberMatch && method === "DELETE") {
        const organizationId = organizationMemberMatch[1];
        const memberId = organizationMemberMatch[2];
        return await deleteOrganizationMember(
          context,
          request,
          response,
          organizationId as string,
          memberId as string
        );
      }

      const organizationMembersMatch = pathname.match(/^\/admin\/organizations\/([^/]+)\/members$/);
      if (organizationMembersMatch) {
        const organizationId = organizationMembersMatch[1];
        if (method === "GET") {
          return await getOrganizationMembersAdmin(
            context,
            request,
            response,
            organizationId as string
          );
        }
        if (method === "POST") {
          return await postOrganizationMember(context, request, response, organizationId as string);
        }
      }

      if (pathname === "/admin/roles") {
        if (method === "GET") return await getRoles(context, request, response);
        if (method === "POST") return await postRole(context, request, response);
      }

      const roleMatch = pathname.match(/^\/admin\/roles\/([^/]+)$/);
      if (roleMatch) {
        const roleId = roleMatch[1];
        if (method === "GET") return await getRole(context, request, response, roleId as string);
        if (method === "PUT") return await putRole(context, request, response, roleId as string);
        if (method === "DELETE")
          return await deleteRole(context, request, response, roleId as string);
      }

      const rolePermissionsMatch = pathname.match(/^\/admin\/roles\/([^/]+)\/permissions$/);
      if (rolePermissionsMatch && method === "PUT") {
        const roleId = rolePermissionsMatch[1];
        return await putRolePermissions(context, request, response, roleId as string);
      }

      if (pathname === "/admin/permissions") {
        if (method === "GET") return await getPermissions(context, request, response);
        if (method === "POST") return await createPermission(context, request, response);
      }

      const permissionMatch = pathname.match(/^\/admin\/permissions\/([^/]+)$/);
      if (permissionMatch && method === "DELETE") {
        const permissionKey = permissionMatch[1];
        return await deletePermission(context, request, response, permissionKey as string);
      }

      if (pathname === "/admin/admin-users") {
        if (method === "GET") return await getAdminUsers(context, request, response);
        if (method === "POST") return await createAdminUserController(context, request, response);
      }

      const adminUserMatch = pathname.match(/^\/admin\/admin-users\/([^/]+)$/);
      if (adminUserMatch) {
        const adminId = adminUserMatch[1];
        if (method === "PUT")
          return await updateAdminUserController(context, request, response, adminId as string);
        if (method === "DELETE")
          return await deleteAdminUserController(context, request, response, adminId as string);
      }

      const adminUserOtpMatch = pathname.match(/^\/admin\/admins\/([^/]+)\/otp$/);
      if (adminUserOtpMatch) {
        const adminId = adminUserOtpMatch[1];
        if (method === "GET")
          return await getAdminUserOtp(context, request, response, adminId as string);
        if (method === "DELETE")
          return await deleteAdminUserOtp(context, request, response, adminId as string);
      }

      const adminResetMatch = pathname.match(/^\/admin\/admin-users\/([^/]+)\/password\/reset$/);
      if (adminResetMatch) {
        const adminId = adminResetMatch[1];
        if (method === "POST")
          return await postAdminUserPasswordReset(context, request, response, adminId as string);
      }

      if (pathname === "/admin/clients") {
        if (method === "GET") return await getClients(context, request, response);
        if (method === "POST") return await createClient(context, request, response);
      }

      const clientSecretMatch = pathname.match(/^\/admin\/clients\/([^/]+)\/secret$/);
      if (clientSecretMatch && method === "GET") {
        const clientId = clientSecretMatch[1];
        return await getClientSecretController(context, request, response, clientId as string);
      }

      const adminSetStartMatch = pathname.match(
        /^\/admin\/admin-users\/([^/]+)\/password\/set\/start$/
      );
      if (adminSetStartMatch) {
        const adminId = adminSetStartMatch[1];
        if (method === "POST")
          return await postAdminUserPasswordSetStart(context, request, response, adminId as string);
      }

      const adminSetFinishMatch = pathname.match(
        /^\/admin\/admin-users\/([^/]+)\/password\/set\/finish$/
      );
      if (adminSetFinishMatch) {
        const adminId = adminSetFinishMatch[1];
        if (method === "POST")
          return await postAdminUserPasswordSetFinish(
            context,
            request,
            response,
            adminId as string
          );
      }

      const clientMatch = pathname.match(/^\/admin\/clients\/([^/]+)$/);
      if (clientMatch) {
        const clientId = clientMatch[1];
        if (method === "PUT")
          return await updateClientController(context, request, response, clientId as string);
        if (method === "DELETE")
          return await deleteClientController(context, request, response, clientId as string);
      }

      const clientIconMatch = pathname.match(/^\/client-icons\/([^/]+)$/);
      if (method === "GET" && clientIconMatch) {
        const icon = await getClientDashboardIcon(
          context,
          decodeURIComponent(clientIconMatch[1] as string)
        );
        if (
          !icon ||
          icon.dashboardIconMode !== "upload" ||
          !icon.dashboardIconData ||
          !icon.dashboardIconMimeType
        ) {
          throw new NotFoundError("Icon not found");
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", icon.dashboardIconMimeType);
        response.setHeader("Cache-Control", "public, max-age=86400");
        response.end(icon.dashboardIconData);
        return;
      }

      if (pathname === "/admin/settings") {
        if (method === "GET") return await getSettings(context, request, response);
        if (method === "PUT") return await updateSettings(context, request, response);
      }
      if (pathname === "/admin/settings/email/test" && method === "POST") {
        return await postAdminEmailTest(context, request, response);
      }
      if (pathname === "/admin/email-templates") {
        if (method === "GET") return await getAdminEmailTemplates(context, request, response);
        if (method === "PUT") return await putAdminEmailTemplate(context, request, response);
      }

      if (pathname === "/admin/jwks") {
        if (method === "GET") return await getJwks(context, request, response);
        if (method === "POST") return await rotateJwks(context, request, response);
      }

      if (pathname === "/admin/otp/status" && method === "GET") {
        return await getAdminOtpStatus(context, request, response);
      }
      if (pathname === "/admin/otp/setup/init" && method === "POST") {
        return await postAdminOtpSetupInit(context, request, response);
      }
      if (pathname === "/admin/otp/setup/verify" && method === "POST") {
        return await postAdminOtpSetupVerify(context, request, response);
      }
      if (pathname === "/admin/otp/verify" && method === "POST") {
        return await postAdminOtpVerify(context, request, response);
      }
      if (pathname === "/admin/otp/disable" && method === "POST") {
        return await postAdminOtpDisable(context, request, response);
      }
      if (pathname === "/admin/otp/reset" && method === "POST") {
        return await postAdminOtpReset(context, request, response);
      }
      if (pathname === "/admin/audit-logs") {
        if (method === "GET") return await getAuditLogs(context, request, response);
      }

      if (pathname === "/admin/audit-logs/export") {
        if (method === "GET") return await getAuditLogExport(context, request, response);
      }

      const auditLogMatch = pathname.match(/^\/admin\/audit-logs\/([^/]+)$/);
      if (auditLogMatch && method === "GET") {
        const logId = auditLogMatch[1];
        // Skip if this is the export endpoint
        if (logId !== "export") {
          return await getAuditLogDetail(context, request, response, logId as string);
        }
      }

      throw new NotFoundError("Endpoint not found");
    } catch (error) {
      context.logger.error(
        { err: error, method, pathname, url: request.url },
        "admin router request failed"
      );
      sendError(response, error as Error);
    }
  };
}
