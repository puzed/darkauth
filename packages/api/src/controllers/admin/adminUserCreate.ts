import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { createAdminUser } from "../../models/adminUsers.ts";
export const AdminRoleSchema = z.enum(["read", "write"]);
export const AdminUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: AdminRoleSchema,
  passwordResetRequired: z.boolean().optional(),
  createdAt: z.date().or(z.string()),
});

export const CreateAdminUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: AdminRoleSchema,
});

import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

export async function createAdminUserController(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole || sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = CreateAdminUserSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const adminUser = await createAdminUser(context, {
    email: parsed.data.email.trim().toLowerCase(),
    name: parsed.data.name.trim(),
    role: parsed.data.role,
  });

  sendJson(response, 201, adminUser);
}

export const schema = {
  method: "POST",
  path: "/admin/admin-users",
  tags: ["Admin Users"],
  summary: "Create admin user",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: CreateAdminUserSchema,
  },
  responses: {
    201: {
      description: "Created",
      content: {
        "application/json": {
          schema: AdminUserSchema,
        },
      },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
