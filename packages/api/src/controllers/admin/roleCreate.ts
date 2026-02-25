import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { createRoleAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.js";

const RequestSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  permissionKeys: z.array(z.string()).optional(),
});

const ResponseSchema = z.object({
  role: z.object({
    id: z.string().uuid(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    system: z.boolean(),
    permissionKeys: z.array(z.string()),
  }),
});

const handler = async (context: Context, request: IncomingMessage, response: ServerResponse) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const parsed = RequestSchema.parse(parseJsonSafely(await readBody(request)));
  const role = await createRoleAdmin(context, parsed);
  sendJsonValidated(response, 201, { role }, ResponseSchema);
};

export const postRole = withAudit({
  eventType: "ROLE_CREATE_ADMIN",
  resourceType: "role",
  extractResourceId: (_body: unknown, _params: string[], data?: unknown) =>
    (data as { role?: { id?: string } } | undefined)?.role?.id,
})(handler);

export const schema = {
  method: "POST",
  path: "/admin/roles",
  tags: ["Roles"],
  summary: "Create role",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: RequestSchema,
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
