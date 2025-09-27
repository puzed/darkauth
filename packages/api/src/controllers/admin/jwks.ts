import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { listJwks } from "../../models/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getJwks(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  // Require admin session
  const sessionData = await requireSession(context, request, true);

  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const keys = await listJwks(context);
  sendJson(response, 200, { keys });
}

const JwkItem = z.object({
  kid: z.string(),
  alg: z.string().optional(),
  publicJwk: z.any(),
  createdAt: z.string().or(z.date()),
  rotatedAt: z.string().or(z.date()).nullable().optional(),
  hasPrivateKey: z.boolean(),
});
const JWKSResponse = z.object({ keys: z.array(JwkItem) });

export const schema = {
  method: "GET",
  path: "/admin/jwks",
  tags: ["JWKS"],
  summary: "List JWKS entries",
  responses: {
    200: { description: "OK", content: { "application/json": { schema: JWKSResponse } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
