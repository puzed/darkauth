import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { startPasswordResetRegistration } from "../../services/passwordReset.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { getClientIp, parseJsonSafely, sendJson } from "../../utils/http.ts";

const PasswordResetStartBody = z.object({
  token: z.string().min(1),
  request: z.string(),
});

async function postPasswordResetStartHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await getCachedBody(request);
  const raw = parseJsonSafely(body);
  const parsed = PasswordResetStartBody.parse(raw);
  let requestBuffer: Uint8Array;
  try {
    requestBuffer = fromBase64Url(parsed.request);
  } catch {
    throw new ValidationError("Invalid base64url encoding in request");
  }
  const result = await startPasswordResetRegistration(context, {
    token: parsed.token,
    requestBuffer,
    ipAddress: getClientIp(request),
    userAgent:
      typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
  });
  sendJson(response, 200, result);
}

export const postPasswordResetStart = withRateLimit("opaque")(postPasswordResetStartHandler);

export const schema = {
  method: "POST",
  path: "/password/reset/start",
  tags: ["OPAQUE"],
  summary: "passwordResetStart",
  body: {
    description: "Request body",
    required: true,
    contentType: "application/json",
    schema: PasswordResetStartBody,
  },
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
