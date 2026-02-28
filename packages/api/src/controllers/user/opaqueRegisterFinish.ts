import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { userOpaqueRegisterFinish } from "../../models/registration.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import {
  getRefreshTokenTtlSeconds,
  getSessionTtlSeconds,
  issueRefreshTokenCookie,
  issueSessionCookies,
} from "../../services/sessions.ts";
import { getSetting } from "../../services/settings.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendError, sendJson } from "../../utils/http.ts";

export const postOpaqueRegisterFinish = withRateLimit("auth", (body) =>
  body && typeof body === "object" && "email" in body
    ? (body as { email?: string }).email
    : undefined
)(
  withAudit({
    eventType: "USER_REGISTER",
    resourceType: "user",
    extractResourceId: (body) =>
      body && typeof body === "object" && "email" in body
        ? (body as { email?: string }).email
        : undefined,
  })(
    async (
      context: Context,
      request: IncomingMessage,
      response: ServerResponse,
      ..._params: unknown[]
    ): Promise<void> => {
      try {
        await requireOpaqueService(context);

        const enabled = (await getSetting(context, "users.self_registration_enabled")) as
          | boolean
          | undefined
          | null;
        if (!enabled) {
          throw new ForbiddenError("Self-registration disabled");
        }

        // Read and parse request body (may be cached by rate limit middleware)
        const body = await getCachedBody(request);
        const raw = parseJsonSafely(body);
        const Req = z.union([
          z.object({
            record: z.string(),
            email: z.string().email(),
            name: z.string(),
            __debug: z.unknown().optional(),
          }),
          z.object({
            message: z.string(),
            email: z.string().email(),
            name: z.string(),
            __debug: z.unknown().optional(),
          }),
        ]);
        const parsed = Req.parse(raw);
        const recordBase64 = "record" in parsed ? parsed.record : parsed.message;
        const email = parsed.email;
        const name = parsed.name;

        let recordBuffer: Uint8Array;
        try {
          recordBuffer = fromBase64Url(recordBase64);
        } catch {
          throw new ValidationError("Invalid base64url encoding in record");
        }

        const result = await userOpaqueRegisterFinish(context, {
          record: recordBuffer,
          email,
          name,
        });
        const ttlSeconds = await getSessionTtlSeconds(context, "user");
        const refreshTtlSeconds = await getRefreshTokenTtlSeconds(context, "user");
        issueSessionCookies(response, result.sessionId, ttlSeconds, false);
        issueRefreshTokenCookie(response, result.refreshToken, refreshTtlSeconds, false);
        sendJson(response, 201, {
          sub: result.sub,
          message: "User registered successfully",
        });
      } catch (error) {
        sendError(response, error as Error);
      }
    }
  )
);

export const schema = {
  method: "POST",
  path: "/opaque/register/finish",
  tags: ["OPAQUE"],
  summary: "opaqueRegisterFinish",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
