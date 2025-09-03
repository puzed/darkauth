import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { count, desc, eq } from "drizzle-orm";
import { groups, userGroups, users } from "../../db/schema.js";
import { ForbiddenError } from "../../errors.js";

const UserSchema = z.object({
  sub: z.string(),
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()),
  passwordResetRequired: z.boolean().optional(),
  groups: z.array(z.string()).optional(),
});
const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});
export const UsersListResponseSchema = z.object({
  users: z.array(UserSchema),
  pagination: PaginationSchema,
});

import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";
import { getPaginationFromUrl } from "../../utils/pagination.js";

export async function getUsers(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const { page, limit, offset } = getPaginationFromUrl(url, 20, 100);
  const search = url.searchParams.get("search");

  const baseQuery = context.db
    .select({
      sub: users.sub,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      passwordResetRequired: users.passwordResetRequired,
    })
    .from(users);
  const { ilike, or } = await import("drizzle-orm");
  const searchTerm = search?.trim() ? `%${search.trim()}%` : undefined;
  const searchCondition = searchTerm
    ? or(ilike(users.email, searchTerm), ilike(users.name, searchTerm))
    : undefined;

  const totalCount = await (searchCondition
    ? context.db.select({ count: count() }).from(users).where(searchCondition)
    : context.db.select({ count: count() }).from(users));

  const usersList = await (searchCondition ? baseQuery.where(searchCondition) : baseQuery)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const subs = usersList.map((u) => u.sub);
  let groupsByUser = new Map<string, string[]>();
  if (subs.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const rows = await context.db
      .select({
        userSub: userGroups.userSub,
        groupKey: groups.key,
      })
      .from(userGroups)
      .innerJoin(groups, eq(userGroups.groupKey, groups.key))
      .where(inArray(userGroups.userSub, subs));
    groupsByUser = rows.reduce((map, row) => {
      const list = map.get(row.userSub) || [];
      list.push(row.groupKey);
      map.set(row.userSub, list);
      return map;
    }, new Map<string, string[]>());
  }

  const total = totalCount[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  const responseData = {
    users: usersList.map((u) => ({ ...u, groups: groupsByUser.get(u.sub) || [] })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };

  sendJsonValidated(response, 200, responseData, UsersListResponseSchema);
}

// export const openApiSchema = createRouteSpec({
//   method: "get",
//   path: "/admin/users",
//   tags: ["Users"],
//   summary: "List users",
//   request: {
//     query: {
//       page: { type: "number", required: false, description: "Page number" },
//       limit: { type: "number", required: false, description: "Items per page" },
//       search: { type: "string", required: false, description: "Search term for email or name" },
//     },
//   },
//   responses: {
//     200: {
//       description: "OK",
//       content: {
//         "application/json": {
//           schema: UsersListResponseSchema,
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
//             code: "FORBIDDEN"
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
    path: "/admin/users",
    tags: ["Users"],
    summary: "List users",
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
        content: { "application/json": { schema: UsersListResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
