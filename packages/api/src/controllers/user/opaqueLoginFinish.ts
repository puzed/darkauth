import type { IncomingMessage, ServerResponse } from "node:http";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { opaqueLoginSessions } from "../../db/schema.ts";
import { AppError, UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { getUserBySubOrEmail } from "../../models/users.ts";
import { signJWT } from "../../services/jwks.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import {
  createSession,
  getRefreshTokenTtlSeconds,
  getSessionTtlSeconds,
  issueRefreshTokenCookie,
  issueSessionCookies,
} from "../../services/sessions.ts";
import { getSetting } from "../../services/settings.ts";
import type { Context, ControllerSchema, OpaqueLoginResult } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

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

      const { getUserOrganizations } = await import("../../models/rbac.ts");
      const organizations = await getUserOrganizations(context, user.sub);
      const activeMemberships = organizations.filter(
        (membership) => membership.status === "active"
      );
      if (activeMemberships.length === 0) {
        throw new AppError("Authentication not permitted", "USER_LOGIN_NOT_ALLOWED", 403);
      }

      const otpRequired = activeMemberships.some((membership) => membership.forceOtp);

      const sessionOrganization =
        activeMemberships.length === 1
          ? {
              organizationId: activeMemberships[0]?.organizationId,
              organizationSlug: activeMemberships[0]?.slug,
            }
          : {};

      const uiUserSettings = (await getSetting(context, "ui_user")) as
        | { clientId?: string }
        | undefined
        | null;
      const userClientId =
        typeof uiUserSettings?.clientId === "string" && uiUserSettings.clientId.length > 0
          ? uiUserSettings.clientId
          : "user";

      // Create user session
      const { sessionId: createdSessionId, refreshToken } = await createSession(context, "user", {
        sub: user.sub,
        email: user.email || undefined,
        name: user.name || undefined,
        ...sessionOrganization,
        clientId: userClientId,
        otpRequired: otpRequired,
        otpVerified: false,
      });
      const ttlSeconds = await getSessionTtlSeconds(context, "user");
      const refreshTtlSeconds = await getRefreshTokenTtlSeconds(context, "user");
      issueSessionCookies(response, createdSessionId, ttlSeconds, false);
      issueRefreshTokenCookie(response, refreshToken, refreshTtlSeconds, false);
      const client = await (await import("../../models/clients.ts")).getClient(
        context,
        userClientId
      );
      const accessTokenTtl =
        client?.accessTokenLifetimeSeconds && client.accessTokenLifetimeSeconds > 0
          ? client.accessTokenLifetimeSeconds
          : 600;
      const now = Math.floor(Date.now() / 1000);
      const accessToken = await signJWT(
        context,
        {
          iss: context.config.issuer,
          sub: user.sub,
          aud: userClientId,
          iat: now,
          exp: now + accessTokenTtl,
          email: user.email || undefined,
          name: user.name || undefined,
          token_use: "access",
          grant_type: "opaque_login",
        },
        `${accessTokenTtl}s`
      );

      const responseData = {
        success: true,
        accessToken,
        sessionKey: toBase64Url(Buffer.from(loginResult.sessionKey)),
        sub: user.sub,
        user: { sub: user.sub, email: user.email, name: user.name },
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
