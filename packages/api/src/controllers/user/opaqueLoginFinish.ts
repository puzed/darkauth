import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { users } from "../../db/schema.js";
import { NotFoundError, UnauthorizedError, ValidationError } from "../../errors.js";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.js";
import { createSession, getSessionTtlSeconds, setSessionCookie } from "../../services/sessions.js";
import type { Context, OpaqueLoginResult } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { fromBase64Url, toBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, sendError, sendJson } from "../../utils/http.js";

export const postOpaqueLoginFinish = withRateLimit("opaque", (body) =>
  body && typeof body === "object"
    ? ("email" in body ? (body as { email?: string }).email : undefined) ||
      ("sub" in body ? (body as { sub?: string }).sub : undefined)
    : undefined
)(
  withAudit({
    eventType: "USER_LOGIN",
    resourceType: "user",
    extractResourceId: (body) =>
      body && typeof body === "object"
        ? ("sub" in body ? (body as { sub?: string }).sub : undefined) ||
          ("email" in body ? (body as { email?: string }).email : undefined)
        : undefined,
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

        // Read and parse request body (may be cached by rate limit middleware)
        const body = await getCachedBody(request);
        const data = parseJsonSafely(body) as {
          finish?: string;
          message?: string;
          sessionId?: string;
          sub?: string;
          email?: string;
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

        const subOrEmail: string | undefined =
          typeof data.sub === "string"
            ? data.sub
            : typeof data.email === "string"
              ? data.email
              : undefined;
        if (!subOrEmail) {
          throw new ValidationError("Missing sub or email field");
        }

        let finishBuffer: Uint8Array;
        try {
          finishBuffer = fromBase64Url(finishB64);
        } catch {
          throw new ValidationError("Invalid base64url encoding in finish");
        }

        // Verify user exists
        const user = await context.db.query.users.findFirst({
          where: subOrEmail.includes("@") ? eq(users.email, subOrEmail) : eq(users.sub, subOrEmail),
        });

        if (!user) {
          throw new NotFoundError("User not found");
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

        const ttl = await getSessionTtlSeconds(context, "user");
        setSessionCookie(response, createdSessionId, false, context.config.isDevelopment, ttl);
        try {
          context.logger.info(
            {
              event: "user.setCookie",
              sessionId: createdSessionId,
              cookie: response.getHeader("Set-Cookie"),
            },
            "user session cookie set"
          );
        } catch {}

        // Return success response with export key and refresh token
        const responseData = {
          success: true,
          sessionKey: toBase64Url(Buffer.from(loginResult.sessionKey)),
          exportKey: toBase64Url(Buffer.from(loginResult.exportKey)),
          sub: user.sub,
          user: { sub: user.sub, email: user.email, name: user.name },
          sessionId: createdSessionId,
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
