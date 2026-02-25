import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { listAdminUsers } from "../../models/adminUsers.js";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.js";

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
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: listSearchQuerySchema,
    sortBy: z.enum(["createdAt", "email", "name", "role"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const result = await listAdminUsers(context, parsed);
  sendJsonValidated(response, 200, result, AdminUsersListResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/admin-users",
  tags: ["Admin Users"],
  summary: "List admin users",
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    sortBy: z.enum(["createdAt", "email", "name", "role"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
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
