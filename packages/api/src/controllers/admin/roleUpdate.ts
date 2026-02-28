import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { updateRoleAdmin } from "../../models/rbacAdmin.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.ts";

const RequestSchema = z
  .object({ name: z.string().min(1).optional(), description: z.string().nullable().optional() })
  .refine((data) => data.name !== undefined || Object.hasOwn(data, "description"), {
    message: "Provide at least one field",
  });

const ResponseSchema = z.object({
  role: z.object({
    id: z.string().uuid(),
    key: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    system: z.boolean(),
  }),
});

const handler = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  roleId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const parsed = RequestSchema.parse(parseJsonSafely(await readBody(request)));
  const role = await updateRoleAdmin(context, roleId, parsed);
  sendJsonValidated(response, 200, { role }, ResponseSchema);
};

export const putRole = withAudit({
  eventType: "ROLE_UPDATE_ADMIN",
  resourceType: "role",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(handler);

export const schema = {
  method: "PUT",
  path: "/admin/roles/{roleId}",
  tags: ["Roles"],
  summary: "Update role",
  params: z.object({ roleId: z.string().uuid() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: RequestSchema,
  },
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
