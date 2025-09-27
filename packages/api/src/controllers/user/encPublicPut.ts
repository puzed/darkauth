import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { setEncPublicJwk } from "../../models/userEncryptionKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

// Request schema
const EncPublicJwkReq = z.object({
  enc_public_jwk: z.object({}).passthrough(),
});

export async function putEncPublicJwk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) throw new UnauthorizedError("User session required");
  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const parsed = EncPublicJwkReq.safeParse(data);
  if (!parsed.success) throw new ValidationError("Invalid body", parsed.error.flatten());
  const result = await setEncPublicJwk(context, sessionData.sub, parsed.data.enc_public_jwk);
  sendJson(response, 200, result);
}

export const schema = {
  method: "PUT",
  path: "/crypto/enc-pub",
  tags: ["Crypto"],
  summary: "encPublicPut",
  responses: { 200: { description: "OK" }, ...genericErrors },
  body: {
    description: "Request body",
    required: true,
    contentType: "application/json",
    schema: EncPublicJwkReq,
  },
} as const satisfies ControllerSchema;
