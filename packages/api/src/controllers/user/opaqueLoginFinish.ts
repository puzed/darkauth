import type { IncomingMessage, ServerResponse } from "node:http";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  groups,
  opaqueLoginSessions,
  organizationMemberRoles,
  organizationMembers,
  roles,
  userGroups,
} from "../../db/schema.js";
import { AppError, UnauthorizedError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { getUserBySubOrEmail } from "../../models/users.js";
import { requireOpaqueService } from "../../services/opaque.js";
import { createSession } from "../../services/sessions.js";
import type { Context, ControllerSchema, OpaqueLoginResult } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, sendJson } from "../../utils/http.js";

export const postOpaqueLoginFinish = withRateLimit("opaque", (body) => {
  // Rate limit by sessionId to prevent abuse
  const data = body as { sessionId?: string };
  return data?.sessionId;
})(
  withAudit({
    eventType: "USER_LOGIN",
    resourceType: "user",
    extractResourceId: (body) => {
      // Use sessionId for audit correlation
      const data = body as { sessionId?: string };
      return data?.sessionId;
    },
  })(
    async (
      context: Context,
      request: IncomingMessage,
      response: ServerResponse,
      ..._params: unknown[]
    ): Promise<void> => {
      const opaque = await requireOpaqueService(context);

      if (!context.db) {
        throw new ValidationError("Database context not available");
      }

      // Read and parse request body (may be cached by rate limit middleware)
      const body = await getCachedBody(request);
      const data = parseJsonSafely(body);
      const Req = z.union([
        z.object({ finish: z.string(), sessionId: z.string() }),
        z.object({ message: z.string(), sessionId: z.string() }),
      ]);
      const parsed = Req.parse(data);
      const finishB64 = "finish" in parsed ? parsed.finish : parsed.message;
      const sessionId = parsed.sessionId;

      let finishBuffer: Uint8Array;
      try {
        finishBuffer = fromBase64Url(finishB64);
      } catch {
        throw new ValidationError("Invalid base64url encoding in finish");
      }

      // CRITICAL SECURITY FIX: Retrieve identity from server-side OPAQUE session
      // This prevents account takeover by ensuring the authenticated identity
      // comes from the server's session store, not client input
      const sessionRow = await context.db.query.opaqueLoginSessions.findFirst({
        where: eq(opaqueLoginSessions.id, sessionId),
      });

      if (!sessionRow) {
        throw new UnauthorizedError("Invalid or expired login session");
      }

      // Decrypt identityU from the session to get the user's email
      let userEmail: string;
      if (context.services?.kek) {
        try {
          const kekSvc = context.services.kek;
          const decU = await kekSvc.decrypt(Buffer.from(sessionRow.identityU, "base64"));
          userEmail = decU.toString("utf-8");
        } catch {
          // Fallback if decryption fails (data might be base64 encoded during initial setup)
          userEmail = Buffer.from(sessionRow.identityU, "base64").toString("utf-8");
        }
      } else {
        // Fallback to base64 decoding if KEK not available
        userEmail = Buffer.from(sessionRow.identityU, "base64").toString("utf-8");
      }

      // Call OPAQUE service to finish login first to normalize timing
      let loginResult: OpaqueLoginResult;
      try {
        loginResult = await opaque.finishLogin(finishBuffer, sessionId);
      } catch (error) {
        context.logger.error({ err: error }, "opaque login finish failed");
        throw new UnauthorizedError("Authentication failed");
      }

      // Look up user by the email from the server session only
      const user = await getUserBySubOrEmail(context, userEmail);
      if (!user) {
        throw new UnauthorizedError("Authentication failed");
      }

      const { getUserOrganizations } = await import("../../models/rbac.js");
      const organizations = await getUserOrganizations(context, user.sub);
      const activeMemberships = organizations.filter(
        (membership) => membership.status === "active"
      );
      if (activeMemberships.length === 0) {
        throw new AppError("Authentication not permitted", "USER_LOGIN_NOT_ALLOWED", 403);
      }
      const loginGroups = await context.db
        .select({ enableLogin: groups.enableLogin })
        .from(userGroups)
        .innerJoin(groups, eq(userGroups.groupKey, groups.key))
        .where(eq(userGroups.userSub, user.sub));
      if (loginGroups.length > 0 && !loginGroups.some((group) => Boolean(group.enableLogin))) {
        throw new AppError("Authentication not permitted", "USER_LOGIN_NOT_ALLOWED", 403);
      }

      let otpRequired = false;
      const s = await (await import("../../services/settings.js")).getSetting(context, "otp");
      if (
        s &&
        typeof s === "object" &&
        (s as { require_for_users?: boolean }).require_for_users === true
      ) {
        otpRequired = true;
      }
      const rows = await context.db
        .select({ roleKey: roles.key })
        .from(organizationMembers)
        .innerJoin(
          organizationMemberRoles,
          eq(organizationMemberRoles.organizationMemberId, organizationMembers.id)
        )
        .innerJoin(roles, eq(organizationMemberRoles.roleId, roles.id))
        .where(
          and(
            eq(organizationMembers.userSub, user.sub),
            eq(organizationMembers.status, "active"),
            eq(roles.key, "otp_required")
          )
        )
        .limit(1);
      if (rows.length > 0) otpRequired = true;

      const sessionOrganization =
        activeMemberships.length === 1
          ? {
              organizationId: activeMemberships[0]?.organizationId,
              organizationSlug: activeMemberships[0]?.slug,
            }
          : {};

      // Create user session
      const { sessionId: createdSessionId, refreshToken } = await createSession(context, "user", {
        sub: user.sub,
        email: user.email || undefined,
        name: user.name || undefined,
        ...sessionOrganization,
        clientId: "demo-public-client",
        otpRequired: otpRequired,
        otpVerified: false,
      });

      // Return session token as Bearer token
      const responseData = {
        success: true,
        sessionKey: toBase64Url(Buffer.from(loginResult.sessionKey)),
        sub: user.sub,
        user: { sub: user.sub, email: user.email, name: user.name },
        accessToken: createdSessionId, // Use sessionId as bearer token
        refreshToken,
        otpRequired,
      };

      sendJson(response, 200, responseData);
    }
  )
);

// OpenAPI schema definition
export const schema = {
  method: "POST",
  path: "/opaque/login/finish",
  tags: ["OPAQUE"],
  summary: "opaqueLoginFinish",
  body: {
    description: "Opaque login finish request body",
    required: true,
    contentType: "application/json",
    schema: {},
  },
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
