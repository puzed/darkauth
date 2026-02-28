import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.ts";

const GroupSchema = z.object({
  key: z.string(),
  name: z.string(),
  enableLogin: z.boolean().optional(),
  requireOtp: z.boolean().optional(),
  permissionCount: z.number().int().nonnegative().optional(),
  userCount: z.number().int().nonnegative().optional(),
});
const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});
export const GroupsListResponseSchema = z.object({
  groups: z.array(GroupSchema),
  pagination: PaginationSchema,
});

import { listGroupsWithCounts } from "../../models/groupsList.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

export async function getGroups(
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
    sortBy: z.enum(["key", "name"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const responseData = await listGroupsWithCounts(context, parsed);
  sendJsonValidated(response, 200, responseData, GroupsListResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/groups",
  tags: ["Groups"],
  summary: "List groups",
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    sortBy: z.enum(["key", "name"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: GroupsListResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
