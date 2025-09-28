import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { signJWT } from "../../services/jwks.js";
import { requireOpaqueService } from "../../services/opaque.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema, JWTPayload } from "../../types.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

// Zod schema for request body
const PasswordChangeVerifyFinishBody = z.object({
  finish: z.string(),
  sessionId: z.string(),
});

export async function postUserPasswordVerifyFinish(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const opaque = await requireOpaqueService(context);

  const session = await requireSession(context, request, false);
  if (!session.email || !session.sub) throw new ValidationError("Invalid user session");

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = PasswordChangeVerifyFinishBody.parse(raw);

  let finishBuffer: Uint8Array;
  try {
    finishBuffer = fromBase64Url(parsed.finish);
  } catch {
    throw new ValidationError("Invalid base64url encoding in finish");
  }

  await opaque.finishLogin(finishBuffer, parsed.sessionId);

  const token = await signJWT(
    context,
    { sub: session.sub, purpose: "password_change" } as JWTPayload,
    "10m"
  );

  sendJson(response, 200, { reauth_token: token });
}

export const schema = {
  method: "POST",
  path: "/password/change/verify/finish",
  tags: ["OPAQUE"],
  summary: "passwordChangeVerifyFinish",
  body: {
    description: "Request body",
    required: true,
    contentType: "application/json",
    schema: PasswordChangeVerifyFinishBody,
  },
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
