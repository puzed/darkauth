import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { listJwks } from "../../models/jwks.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.js";

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

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: listSearchQuerySchema,
    sortBy: z.enum(["createdAt", "kid", "alg", "rotatedAt"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const result = await listJwks(context, parsed);
  sendJsonValidated(response, 200, result, JWKSResponse);
}

const JwkItem = z.object({
  kid: z.string(),
  alg: z.string().optional(),
  publicJwk: z.any(),
  createdAt: z.string().or(z.date()),
  rotatedAt: z.string().or(z.date()).nullable().optional(),
  hasPrivateKey: z.boolean(),
});
const JWKSResponse = z.object({
  keys: z.array(JwkItem),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

export const schema = {
  method: "GET",
  path: "/admin/jwks",
  tags: ["JWKS"],
  summary: "List JWKS entries",
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    sortBy: z.enum(["createdAt", "kid", "alg", "rotatedAt"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: JWKSResponse } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
