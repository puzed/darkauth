import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import {
  normalizePasswordResetEmail,
  requestPasswordResetEmail,
} from "../../services/passwordReset.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { getClientIp, parseJsonSafely, sendJson } from "../../utils/http.ts";

const PasswordResetRequestBody = z.object({
  email: z.string().email(),
});

async function postPasswordResetRequestHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await getCachedBody(request);
  const raw = parseJsonSafely(body);
  const parsed = PasswordResetRequestBody.safeParse(raw);
  if (!parsed.success) {
    sendJson(response, 200, {
      success: true,
      message: "If an account exists, we sent reset instructions.",
    });
    return;
  }

  const result = await requestPasswordResetEmail(context, {
    email: parsed.data.email,
    ipAddress: getClientIp(request),
    userAgent:
      typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
  });
  sendJson(response, 200, result);
}

export const postPasswordResetRequest = withRateLimit("password_reset", (body) =>
  body && typeof body === "object" && "email" in body
    ? normalizePasswordResetEmail(String((body as { email?: unknown }).email || ""))
    : undefined
)(postPasswordResetRequestHandler);

export const schema = {
  method: "POST",
  path: "/password/reset/request",
  tags: ["OPAQUE"],
  summary: "passwordResetRequest",
  body: {
    description: "Request body",
    required: true,
    contentType: "application/json",
    schema: PasswordResetRequestBody,
  },
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
