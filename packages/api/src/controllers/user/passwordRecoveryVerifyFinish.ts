import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";

const PasswordRecoveryVerifyFinishBody = z.object({
  finish: z.string(),
  sessionId: z.string(),
});

async function postUserPasswordRecoveryVerifyFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const opaque = await requireOpaqueService(context);

  const session = await requireSession(context, request, false);
  if (!session.email || !session.sub) throw new ValidationError("Invalid user session");

  const body = await getCachedBody(request);
  const raw = parseJsonSafely(body);
  const parsed = PasswordRecoveryVerifyFinishBody.parse(raw);

  let finishBuffer: Uint8Array;
  try {
    finishBuffer = fromBase64Url(parsed.finish);
  } catch {
    throw new ValidationError("Invalid base64url encoding in finish");
  }

  await opaque.finishLogin(finishBuffer, parsed.sessionId);

  sendJson(response, 200, { success: true });
}

export const postUserPasswordRecoveryVerifyFinish = withRateLimit("opaque")(
  postUserPasswordRecoveryVerifyFinishHandler
);

export const schema = {
  method: "POST",
  path: "/password/recovery/verify/finish",
  tags: ["OPAQUE"],
  summary: "passwordRecoveryVerifyFinish",
  body: {
    description: "Request body",
    required: true,
    contentType: "application/json",
    schema: PasswordRecoveryVerifyFinishBody,
  },
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
