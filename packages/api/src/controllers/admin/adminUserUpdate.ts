import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
import { updateAdminUser } from "../../models/adminUsers.js";
export const AdminRoleSchema = z.enum(["read", "write"]);
export const UpdateAdminUserSchema = z
  .object({
    email: z.string().email().optional(),
    name: z.string().min(1).max(100).optional(),
    role: AdminRoleSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No valid fields to update" });
export const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: AdminRoleSchema,
  passwordResetRequired: z.boolean().optional(),
  createdAt: z.date().or(z.string()),
});

import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

export async function updateAdminUserController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  adminId: string
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = UpdateAdminUserSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const updates: { email?: string; name?: string; role?: "read" | "write" } = {};
  if (parsed.data.email !== undefined) updates.email = parsed.data.email.trim().toLowerCase();
  if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;

  const adminUser = await updateAdminUser(context, adminId, updates);
  sendJson(response, 200, adminUser);
}

// export const openApiSchema = createRouteSpec({
//   method: "put",
//   path: "/admin/admin-users/{adminId}",
//   tags: ["Admin Users"],
//   summary: "Update admin user",
//   request: {
//     params: {
//       adminId: {
//         type: "string",
//         format: "uuid",
//         description: "Admin user ID",
//       },
//     },
//     body: {
//       content: {
//         "application/json": {
//           schema: UpdateAdminUserSchema,
//           example: {
//             email: "updated@example.com",
//             name: "Updated Name",
//             role: "read",
//           },
//         },
//       },
//     },
//   },
//   responses: {
//     200: {
//       description: "OK",
//       content: {
//         "application/json": {
//           schema: AdminUserSchema,
//           example: {
//             id: "123e4567-e89b-12d3-a456-426614174000",
//             email: "updated@example.com",
//             name: "Updated Name",
//             role: "read",
//             passwordResetRequired: false,
//             createdAt: "2024-01-01T00:00:00.000Z",
//           , ...genericErrors },
//         },
//       },
//     },
//     400: {
//       description: "Bad Request",
//       content: {
//         "application/json": {
//           schema: ValidationErrorResponseSchema,
//           example: {
//             error: "VALIDATION_ERROR",
//             message: "No valid fields to update",
//             code: "VALIDATION_ERROR",
//           },
//         },
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
//     404: {
//       description: "Not Found",
//       content: {
//         "application/json": {
//           schema: NotFoundResponseSchema,
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
    method: "put",
    path: "/admin/admin-users/{adminId}",
    tags: ["Admin Users"],
    summary: "Update admin user",
    request: {
      params: z.object({ adminId: z.string().uuid() }),
      body: { content: { "application/json": { schema: UpdateAdminUserSchema } } },
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: AdminUserSchema } },
      },
    },
  });
}
