import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { desc } from "drizzle-orm";
import { jwks } from "../../db/schema.js";
import { ForbiddenError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
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

  // Get all JWKS entries (excluding private keys for security)
  const jwksData = await context.db
    .select({
      kid: jwks.kid,
      alg: jwks.alg,
      publicJwk: jwks.publicJwk,
      createdAt: jwks.createdAt,
      rotatedAt: jwks.rotatedAt,
      privateJwkEnc: jwks.privateJwkEnc,
    })
    .from(jwks)
    .orderBy(desc(jwks.createdAt));

  const responseData = {
    keys: jwksData.map((key) => ({
      kid: key.kid,
      alg: key.alg,
      publicJwk: key.publicJwk,
      createdAt: key.createdAt,
      rotatedAt: key.rotatedAt,
      hasPrivateKey: key.privateJwkEnc !== null,
    })),
  };

  sendJson(response, 200, responseData);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const JwkItem = z.object({
    kid: z.string(),
    alg: z.string().optional(),
    publicJwk: z.any(),
    createdAt: z.string().or(z.date()),
    rotatedAt: z.string().or(z.date()).nullable().optional(),
    hasPrivateKey: z.boolean(),
  });
  const JWKSResponse = z.object({ keys: z.array(JwkItem) });
  registry.registerPath({
    method: "get",
    path: "/admin/jwks",
    tags: ["JWKS"],
    summary: "List JWKS entries",
    responses: {
      200: { description: "OK", content: { "application/json": { schema: JWKSResponse } } },
      ...genericErrors,
    },
  });
}
