import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { UnauthorizedError, ValidationError } from "../../errors.js";
import { setEncPublicJwk } from "../../models/userEncryptionKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export async function putEncPublicJwk(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const sessionData = await requireSession(context, request, false);
  if (!sessionData.sub) throw new UnauthorizedError("User session required");
  const body = await readBody(request);
  const data = parseJsonSafely(body);
  const Req = z.object({ enc_public_jwk: z.object({}).passthrough() });
  const parsed = Req.safeParse(data);
  if (!parsed.success) throw new ValidationError("Invalid body", parsed.error.flatten());
  const result = await setEncPublicJwk(context, sessionData.sub, parsed.data.enc_public_jwk);
  sendJson(response, 200, result);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "put",
    path: "/crypto/enc-pub",
    tags: ["Crypto"],
    summary: "encPublicPut",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
