import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getGroupUsers as getGroupUsersModel } from "../../models/groups.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.js";

export async function getGroupUsers(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  groupKey: string
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }
  const Params = z.object({ key: z.string() });
  const { key } = Params.parse({ key: groupKey });
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: listSearchQuerySchema,
    sortBy: z.enum(["sub", "email", "name"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const result = await getGroupUsersModel(context, key, parsed);
  sendJsonValidated(response, 200, result, Resp);
}

// OpenAPI schema
const User = z.object({
  sub: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});
const Group = z.object({ key: z.string(), name: z.string() });
const Resp = z.object({
  group: Group,
  users: z.array(User),
  availableUsers: z.array(User),
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
  path: "/admin/groups/{key}/users",
  tags: ["Groups"],
  summary: "Get group users",
  params: z.object({ key: z.string() }),
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    sortBy: z.enum(["sub", "email", "name"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
