import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";

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

import { listGroupsWithCounts } from "../../models/groupsList.js";
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
  const Query = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const responseData = await listGroupsWithCounts(context, parsed);
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
