import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { getPublicKeys } from "../../services/jwks.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getWellKnownJwks(
  context: Context,
  _request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const keys = await getPublicKeys(context);

  sendJson(response, 200, { keys });
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Jwk = z
    .object({
      kty: z.string().optional(),
      use: z.string().optional(),
      kid: z.string().optional(),
      alg: z.string().optional(),
    })
    .catchall(z.any());
  const Resp = z.object({ keys: z.array(Jwk) });
  registry.registerPath({
    method: "get",
    path: "/.well-known/jwks.json",
    tags: ["Well-Known"],
    summary: "JWKS",
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
