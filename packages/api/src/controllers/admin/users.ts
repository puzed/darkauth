import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

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

import { listUsers } from "../../models/users.js";
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
  const { page, limit } = getPaginationFromUrl(url, 20, 100);
  const search = url.searchParams.get("search") || undefined;

  const responseData = await listUsers(context, { page, limit, search });

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
