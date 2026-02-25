import type { IncomingMessage, ServerResponse } from "node:http";
import { deleteAdminUserOtp, getAdminUserOtp } from "../../controllers/admin/adminOtp.js";
import { createAdminUserController } from "../../controllers/admin/adminUserCreate.js";
import { deleteAdminUserController } from "../../controllers/admin/adminUserDelete.js";
import { postAdminUserPasswordReset } from "../../controllers/admin/adminUserPasswordReset.js";
import { postAdminUserPasswordSetFinish } from "../../controllers/admin/adminUserPasswordSetFinish.js";
import { postAdminUserPasswordSetStart } from "../../controllers/admin/adminUserPasswordSetStart.js";
import { getAdminUsers } from "../../controllers/admin/adminUsers.js";
import { updateAdminUserController } from "../../controllers/admin/adminUserUpdate.js";
import { getAuditLogDetail } from "../../controllers/admin/auditLogDetail.js";
import { getAuditLogExport } from "../../controllers/admin/auditLogExport.js";
import { getAuditLogs } from "../../controllers/admin/auditLogs.js";
import { createClient } from "../../controllers/admin/clientCreate.js";
import { deleteClientController } from "../../controllers/admin/clientDelete.js";
import { getClientSecretController } from "../../controllers/admin/clientSecret.js";
import { getClients } from "../../controllers/admin/clients.js";
import { updateClientController } from "../../controllers/admin/clientUpdate.js";
import { createGroup } from "../../controllers/admin/groupCreate.js";
import { deleteGroupController } from "../../controllers/admin/groupDelete.js";
import { getGroup } from "../../controllers/admin/groupGet.js";
import { getGroups } from "../../controllers/admin/groups.js";
import { updateGroupController } from "../../controllers/admin/groupUpdate.js";
import { getGroupUsers } from "../../controllers/admin/groupUsers.js";
import { updateGroupUsers } from "../../controllers/admin/groupUsersUpdate.js";
import { getJwks } from "../../controllers/admin/jwks.js";
import { rotateJwks } from "../../controllers/admin/jwksRotate.js";
import { postAdminLogout } from "../../controllers/admin/logout.js";
import { postAdminOpaqueLoginFinish } from "../../controllers/admin/opaqueLoginFinish.js";
import { postAdminOpaqueLoginStart } from "../../controllers/admin/opaqueLoginStart.js";
import { postOrganization } from "../../controllers/admin/organizationCreate.js";
import { deleteOrganization } from "../../controllers/admin/organizationDelete.js";
import { getOrganization } from "../../controllers/admin/organizationGet.js";
import { postOrganizationMember } from "../../controllers/admin/organizationMemberCreate.js";
import { deleteOrganizationMember } from "../../controllers/admin/organizationMemberDelete.js";
import { deleteOrganizationMemberRole } from "../../controllers/admin/organizationMemberRoleDelete.js";
import { postOrganizationMemberRoles } from "../../controllers/admin/organizationMemberRolesAdd.js";
import { putOrganizationMemberRoles } from "../../controllers/admin/organizationMemberRolesUpdate.js";
import { getOrganizationMembersAdmin } from "../../controllers/admin/organizationMembers.js";
import { getOrganizations } from "../../controllers/admin/organizations.js";
import { putOrganization } from "../../controllers/admin/organizationUpdate.js";
import {
  getAdminOtpStatus,
  postAdminOtpDisable,
  postAdminOtpReset,
  postAdminOtpSetupInit,
  postAdminOtpSetupVerify,
  postAdminOtpVerify,
} from "../../controllers/admin/otp.js";
import { postAdminPasswordChangeFinish } from "../../controllers/admin/passwordChangeFinish.js";
import { postAdminPasswordChangeStart } from "../../controllers/admin/passwordChangeStart.js";
import { createPermission } from "../../controllers/admin/permissionCreate.js";
import { deletePermission } from "../../controllers/admin/permissionDelete.js";
import { getPermissions } from "../../controllers/admin/permissions.js";
import { postAdminRefreshToken } from "../../controllers/admin/refreshToken.js";
import { postRole } from "../../controllers/admin/roleCreate.js";
import { deleteRole } from "../../controllers/admin/roleDelete.js";
import { getRole } from "../../controllers/admin/roleGet.js";
import { putRolePermissions } from "../../controllers/admin/rolePermissionsUpdate.js";
import { getRoles } from "../../controllers/admin/roles.js";
import { putRole } from "../../controllers/admin/roleUpdate.js";
import { getAdminSession } from "../../controllers/admin/session.js";
import { getSettings } from "../../controllers/admin/settings.js";
import { updateSettings } from "../../controllers/admin/settingsUpdate.js";
import { createUser } from "../../controllers/admin/userCreate.js";
import { deleteUser } from "../../controllers/admin/userDelete.js";
import { getUserGroups } from "../../controllers/admin/userGroups.js";
import { updateUserGroups } from "../../controllers/admin/userGroupsUpdate.js";
import { getUserOtp } from "../../controllers/admin/userOtp.js";
import { deleteUserOtp } from "../../controllers/admin/userOtpDelete.js";
import { postUserOtpUnlock } from "../../controllers/admin/userOtpUnlock.js";
import { postUserPasswordReset } from "../../controllers/admin/userPasswordReset.js";
import { postUserPasswordSetFinish } from "../../controllers/admin/userPasswordSetFinish.js";
import { postUserPasswordSetStart } from "../../controllers/admin/userPasswordSetStart.js";
import { getUserPermissions } from "../../controllers/admin/userPermissions.js";
import { updateUserPermissions } from "../../controllers/admin/userPermissionsUpdate.js";
import { getUsers } from "../../controllers/admin/users.js";
import { updateUser } from "../../controllers/admin/userUpdate.js";
import { NotFoundError, UnauthorizedError } from "../../errors.js";
import { getSessionId } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { assertSameOrigin } from "../../utils/csrf.js";
import { sendError } from "../../utils/http.js";

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
        "/admin/refresh-token", // Uses refresh token in body, not session header
        // Note: /admin/session is checked separately as it returns different data based on auth
      ];

      // Check authentication for all endpoints except whitelisted ones
      const isPublicEndpoint = publicEndpoints.includes(pathname);
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
      if (needsCsrf) assertSameOrigin(request);
      if (method === "GET" && pathname === "/admin/session") {
        return await getAdminSession(context, request, response);
      }

      if (method === "POST" && pathname === "/admin/logout") {
        return await postAdminLogout(context, request, response);
      }

      if (method === "POST" && pathname === "/admin/refresh-token") {
        return await postAdminRefreshToken(context, request, response);
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

      const userGroupsMatch = pathname.match(/^\/admin\/users\/([^/]+)\/groups$/);
      if (userGroupsMatch) {
        const userSub = userGroupsMatch[1];
        if (method === "GET") {
          return await getUserGroups(context, request, response, userSub as string);
        }
        if (method === "PUT") {
          return await updateUserGroups(context, request, response, userSub as string);
        }
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

      if (pathname === "/admin/groups") {
        if (method === "GET") return await getGroups(context, request, response);
        if (method === "POST") return await createGroup(context, request, response);
      }

      const groupMatch = pathname.match(/^\/admin\/groups\/([^/]+)$/);
      if (groupMatch) {
        const groupKey = groupMatch[1];
        if (method === "GET") return await getGroup(context, request, response, groupKey as string);
        if (method === "PUT")
          return await updateGroupController(context, request, response, groupKey as string);
        if (method === "DELETE")
          return await deleteGroupController(context, request, response, groupKey as string);
      }

      const groupUsersMatch = pathname.match(/^\/admin\/groups\/([^/]+)\/users$/);
      if (groupUsersMatch) {
        const groupKey = groupUsersMatch[1];
        if (method === "GET")
          return await getGroupUsers(context, request, response, groupKey as string);
        if (method === "PUT")
          return await updateGroupUsers(context, request, response, groupKey as string);
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

      if (pathname === "/admin/settings") {
        if (method === "GET") return await getSettings(context, request, response);
        if (method === "PUT") return await updateSettings(context, request, response);
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
      sendError(response, error as Error);
    }
  };
}
