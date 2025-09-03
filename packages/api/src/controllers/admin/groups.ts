import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { count } from "drizzle-orm";
import { groupPermissions, groups, userGroups } from "../../db/schema.js";
import { ForbiddenError } from "../../errors.js";

const GroupSchema = z.object({
  key: z.string(),
  name: z.string(),
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

import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

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
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") || "20", 10))
  );
  const offset = (page - 1) * limit;
  const search = url.searchParams.get("search");

  const { ilike, or } = await import("drizzle-orm");

  const baseQuery = context.db
    .select({
      key: groups.key,
      name: groups.name,
    })
    .from(groups);

  const baseCountQuery = context.db.select({ count: count() }).from(groups);
  const term = search?.trim() ? `%${search.trim()}%` : undefined;
  const searchCondition = term ? or(ilike(groups.name, term), ilike(groups.key, term)) : undefined;

  const totalRows = await (searchCondition
    ? baseCountQuery.where(searchCondition)
    : baseCountQuery);
  const total = totalRows[0]?.count || 0;
  const groupsData = await (searchCondition ? baseQuery.where(searchCondition) : baseQuery)
    .orderBy(groups.name)
    .limit(limit)
    .offset(offset);

  const permissionCounts = await context.db
    .select({
      groupKey: groupPermissions.groupKey,
      permissionCount: count(groupPermissions.permissionKey),
    })
    .from(groupPermissions)
    .groupBy(groupPermissions.groupKey);

  const userCounts = await context.db
    .select({
      groupKey: userGroups.groupKey,
      userCount: count(userGroups.userSub),
    })
    .from(userGroups)
    .groupBy(userGroups.groupKey);

  // Create maps for efficient lookup
  const permissionCountMap = new Map(
    permissionCounts.map((pc) => [pc.groupKey, pc.permissionCount])
  );
  const userCountMap = new Map(userCounts.map((uc) => [uc.groupKey, uc.userCount]));

  // Build response with counts
  const groupsWithCounts = groupsData.map((group) => ({
    key: group.key,
    name: group.name,
    permissionCount: permissionCountMap.get(group.key) || 0,
    userCount: userCountMap.get(group.key) || 0,
  }));

  const totalPages = Math.ceil(total / limit);
  const responseData = {
    groups: groupsWithCounts,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };

  sendJsonValidated(response, 200, responseData, GroupsListResponseSchema);
}

// export const openApiSchema = createRouteSpec({
//   method: "get",
//   path: "/admin/groups",
//   tags: ["Groups"],
//   summary: "List groups",
//   request: {
//     query: {
//       page: { type: "number", required: false, description: "Page number" },
//       limit: { type: "number", required: false, description: "Items per page" },
//       search: { type: "string", required: false, description: "Search term" },
//     },
//   },
//   responses: {
//     200: {
//       description: "OK",
//       content: {
//         "application/json": {
//           schema: GroupsListResponseSchema,
//         , ...genericErrors },
//       },
//     },
//     401: {
//       description: "Unauthorized",
//       content: {
//         "application/json": {
//           schema: UnauthorizedResponseSchema,
//         },
//       },
//     },
//     403: {
//       description: "Forbidden",
//       content: {
//         "application/json": {
//           schema: ForbiddenResponseSchema,
//           example: {
//             error: "FORBIDDEN",
//             message: "Admin access required",
//             code: "FORBIDDEN",
//           },
//         },
//       },
//     },
//     500: {
//       description: "Internal Server Error",
//       content: {
//         "application/json": {
//           schema: ErrorResponseSchema,
//         },
//       },
//     },
//   },
// });
export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/admin/groups",
    tags: ["Groups"],
    summary: "List groups",
    request: {
      query: z.object({
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
        search: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: GroupsListResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
