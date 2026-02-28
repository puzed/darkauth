import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getCachedBody, withRateLimit } from "../../middleware/rateLimit.ts";
import { signJWT } from "../../services/jwks.ts";
import { requireOpaqueService } from "../../services/opaque.ts";
import type { Context, ControllerSchema, JWTPayload } from "../../types.ts";
import { fromBase64Url } from "../../utils/crypto.ts";
import { parseJsonSafely, sendJson } from "../../utils/http.ts";
import { requirePasswordChangeIdentity } from "./passwordAuth.ts";

// Zod schema for request body
const PasswordChangeVerifyFinishBody = z.object({
  finish: z.string(),
  sessionId: z.string(),
});

async function postUserPasswordVerifyFinishHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const opaque = await requireOpaqueService(context);

  const identity = await requirePasswordChangeIdentity(context, request);

  const body = await getCachedBody(request);
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
    { sub: identity.sub, purpose: "password_change" } as JWTPayload,
    "10m"
  );

  sendJson(response, 200, { reauth_token: token });
}

export const postUserPasswordVerifyFinish = withRateLimit("opaque")(
  postUserPasswordVerifyFinishHandler
);

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
