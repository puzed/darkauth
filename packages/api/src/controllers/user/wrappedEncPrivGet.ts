import type { IncomingMessage, ServerResponse } from "node:http";
import { UnauthorizedError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getEncPrivateWrapped } from "../../models/userEncryptionKeys.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { toBase64Url } from "../../utils/crypto.ts";
import { sendJson } from "../../utils/http.ts";

export async function getWrappedEncPrivateJwk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) throw new UnauthorizedError("User session required");
  const wrapped = await getEncPrivateWrapped(context, sessionData.sub);
  sendJson(response, 200, {
    wrapped_enc_private_jwk: toBase64Url(wrapped),
  });
}

export const schema = {
  method: "GET",
  path: "/crypto/wrapped-enc-priv",
  tags: ["Crypto"],
  summary: "wrappedEncPrivGet",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
