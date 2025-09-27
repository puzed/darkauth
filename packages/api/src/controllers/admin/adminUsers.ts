import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { listAdminUsers } from "../../models/adminUsers.js";

const AdminRoleSchema = z.enum(["read", "write"]);
const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: AdminRoleSchema,
  passwordResetRequired: z.boolean().optional(),
  createdAt: z.date().or(z.string()),
});
const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});
export const AdminUsersListResponseSchema = z.object({
  adminUsers: z.array(AdminUserSchema),
  pagination: PaginationSchema,
});

import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";
import { getPaginationFromUrl } from "../../utils/pagination.js";

export async function getAdminUsers(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const { page, limit } = getPaginationFromUrl(url, 20, 100);
  const search = url.searchParams.get("search");
  const result = await listAdminUsers(context, { page, limit, search: search || undefined });
  sendJsonValidated(response, 200, result, AdminUsersListResponseSchema);
}

// export const openApiSchema = createRouteSpec({
//   method: "get",
//   path: "/admin/admin-users",
//   tags: ["Admin Users"],
//   summary: "List admin users",
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
//           schema: AdminUsersListResponseSchema,
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
//             message: "Write access required",
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
export const schema = {
  method: "GET",
  path: "/admin/admin-users",
  tags: ["Admin Users"],
  summary: "List admin users",
  query: z.object({
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().optional(),
    search: z.string().optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: AdminUsersListResponseSchema } },
    },
    401: {
      description: "Unauthorized",
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
    },
    403: {
      description: "Forbidden",
      content: { "application/json": { schema: z.object({ error: z.string() }) } },
    },
  },
} as const satisfies ControllerSchema;
