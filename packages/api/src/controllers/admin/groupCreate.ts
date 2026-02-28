import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { createGroup as createGroupModel } from "../../models/groups.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.ts";

export const CreateGroupSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Key must contain only alphanumeric characters, underscores, and hyphens"
    ),
  name: z.string().min(1),
  enableLogin: z.boolean().optional().default(true),
  requireOtp: z.boolean().optional().default(false),
  permissionKeys: z.array(z.string()).optional().default([]),
});
export const CreateGroupResponseSchema = z.object({
  success: z.boolean(),
  group: z.object({
    key: z.string(),
    name: z.string(),
    enableLogin: z.boolean(),
    requireOtp: z.boolean().optional(),
    permissions: z.array(z.object({ key: z.string(), description: z.string() })),
    permissionCount: z.number().int().nonnegative(),
    userCount: z.number().int().nonnegative(),
  }),
});

async function createGroupHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
): Promise<void> {
  // Require admin session with write permission
  const sessionData = await requireSession(context, request, true);

  if (sessionData.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  // Read and parse request body
  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = CreateGroupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const data = parsed.data;
  const group = await createGroupModel(context, {
    key: data.key,
    name: data.name,
    enableLogin: data.enableLogin,
    requireOtp: data.requireOtp,
    permissionKeys: data.permissionKeys,
  });
  const responseData = { success: true, group };

  sendJsonValidated(response, 201, responseData, CreateGroupResponseSchema);
}

export const createGroup = withAudit({
  eventType: "GROUP_CREATE",
  resourceType: "group",
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const b = body as { key?: string };
      return b.key;
    }
    return undefined;
  },
})(createGroupHandler);

export const schema = {
  method: "POST",
  path: "/admin/groups",
  tags: ["Groups"],
  summary: "Create group",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: CreateGroupSchema,
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: CreateGroupResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
