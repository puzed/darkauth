import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { opaqueLoginSessions } from "../../db/schema.js";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { UnauthorizedError, ValidationError } from "../../errors.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { getUserBySubOrEmail } from "../../models/users.js";
import { createSession } from "../../services/sessions.js";
import type { Context, OpaqueLoginResult } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, sendError, sendJson } from "../../utils/http.js";

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
      try {
        if (!context.services.opaque) {
          throw new ValidationError("OPAQUE service not available");
        }

        if (!context.db) {
          throw new ValidationError("Database context not available");
        }

        // Read and parse request body (may be cached by rate limit middleware)
        const body = await getCachedBody(request);
        const data = parseJsonSafely(body) as {
          finish?: string;
          message?: string;
          sessionId?: string;
          // Note: sub and email fields are ignored for security
        };

        // Validate request format
        const finishB64: string | undefined =
          typeof data.finish === "string"
            ? data.finish
            : typeof data.message === "string"
              ? data.message
              : undefined;
        if (!finishB64) {
          throw new ValidationError("Missing or invalid finish/message field");
        }

        const sessionId: string | undefined =
          typeof data.sessionId === "string" ? data.sessionId : undefined;
        if (!sessionId) {
          throw new ValidationError("Missing or invalid sessionId field");
        }

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

        // Look up user by the email from the server session only
        const user = await getUserBySubOrEmail(context, userEmail);
        if (!user) {
          throw new UnauthorizedError("Authentication failed");
        }

        // Call OPAQUE service to finish login
        let loginResult: OpaqueLoginResult;
        try {
          loginResult = await context.services.opaque.finishLogin(finishBuffer, sessionId);
        } catch (error) {
          console.error("OPAQUE login finish failed:", error);
          throw new UnauthorizedError("Authentication failed");
        }

        // Create user session
        const { sessionId: createdSessionId, refreshToken } = await createSession(context, "user", {
          sub: user.sub,
          email: user.email || undefined,
          name: user.name || undefined,
        });

        // Return session token as Bearer token
        const responseData = {
          success: true,
          sessionKey: toBase64Url(Buffer.from(loginResult.sessionKey)),
          sub: user.sub,
          user: { sub: user.sub, email: user.email, name: user.name },
          accessToken: createdSessionId, // Use sessionId as bearer token
          refreshToken,
        };

        sendJson(response, 200, responseData);
      } catch (error) {
        sendError(response, error as Error);
      }
    }
  )
);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/opaque/login/finish",
    tags: ["OPAQUE"],
    summary: "opaqueLoginFinish",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
