import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { setEncPrivateWrapped } from "../../models/userEncryptionKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { fromBase64Url } from "../../utils/crypto.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export async function putWrappedEncPrivateJwk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) throw new UnauthorizedError("User session required");
  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const Req = z.object({
    wrapped_enc_private_jwk: z.string().refine((s) => {
      try {
        const b = fromBase64Url(s);
        return b.length > 0 && b.length <= 10240;
      } catch {
        return false;
      }
    }),
  });
  const parsed = Req.parse(raw);
  const buf = fromBase64Url(parsed.wrapped_enc_private_jwk);
  const result = await setEncPrivateWrapped(context, sessionData.sub, buf);
  sendJson(response, 200, result);
}

export const schema = {
  method: "PUT",
  path: "/crypto/wrapped-enc-priv",
  tags: ["Crypto"],
  summary: "wrappedEncPrivPut",
  responses: { 200: { description: "OK" }, ...genericErrors },
} as const satisfies ControllerSchema;
