import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { finishPasswordResetRegistration } from "../../services/passwordReset.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { getClientIp, parseJsonSafely, sendJson } from "../../utils/http.ts";

const PasswordResetFinishBody = z.object({
  token: z.string().min(1),
  record: z.string(),
  export_key_hash: z.string(),
});

async function postPasswordResetFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const body = await getCachedBody(request);
  const raw = parseJsonSafely(body);
  const parsed = PasswordResetFinishBody.parse(raw);
  let recordBuffer: Uint8Array;
  try {
    recordBuffer = fromBase64Url(parsed.record);
  } catch {
    throw new ValidationError("Invalid base64url encoding in record");
  }
  const result = await finishPasswordResetRegistration(context, {
    token: parsed.token,
    recordBuffer,
    exportKeyHash: parsed.export_key_hash,
    ipAddress: getClientIp(request),
    userAgent:
      typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : undefined,
  });
  sendJson(response, 200, result);
}

export const postPasswordResetFinish = withRateLimit("opaque")(postPasswordResetFinishHandler);

export const schema = {
  method: "POST",
  path: "/password/reset/finish",
  tags: ["OPAQUE"],
  summary: "passwordResetFinish",
  body: {
    description: "Request body",
    required: true,
    contentType: "application/json",
    schema: PasswordResetFinishBody,
  },
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
