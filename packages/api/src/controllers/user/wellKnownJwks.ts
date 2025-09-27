import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getPublicKeys } from "../../services/jwks.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getWellKnownJwks(
  context: Context,
  _request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const keys = await getPublicKeys(context);

  sendJson(response, 200, { keys });
}

const Jwk = z
  .object({
    kty: z.string().optional(),
    use: z.string().optional(),
    kid: z.string().optional(),
    alg: z.string().optional(),
  })
  .catchall(z.any());
const Resp = z.object({ keys: z.array(Jwk) });

export const schema = {
  method: "GET",
  path: "/.well-known/jwks.json",
  tags: ["Well-Known"],
  summary: "JWKS",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
