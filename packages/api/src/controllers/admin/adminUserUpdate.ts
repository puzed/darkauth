import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.js";
import { updateAdminUser } from "../../models/adminUsers.js";
import type { Context, ControllerSchema } from "../../types.js";
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

export const schema = {
  method: "PUT",
  path: "/admin/admin-users/{adminId}",
  tags: ["Admin Users"],
  summary: "Update admin user",
  params: z.object({ adminId: z.string().uuid() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: UpdateAdminUserSchema,
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: AdminUserSchema } },
    },
  },
} as const satisfies ControllerSchema;
