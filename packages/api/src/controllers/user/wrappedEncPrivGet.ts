import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { UnauthorizedError } from "../../errors.js";
import { getEncPrivateWrapped } from "../../models/userEncryptionKeys.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { toBase64Url } from "../../utils/crypto.js";
import { sendJson } from "../../utils/http.js";

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

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/crypto/wrapped-enc-priv",
    tags: ["Crypto"],
    summary: "wrappedEncPrivGet",
    responses: { 200: { description: "OK" }, ...genericErrors },
  });
}
