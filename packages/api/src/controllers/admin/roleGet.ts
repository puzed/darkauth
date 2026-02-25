import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { getRoleAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

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

export async function getRole(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  roleId: string
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");

  const role = await getRoleAdmin(context, roleId);
  sendJsonValidated(response, 200, { role }, ResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/roles/{roleId}",
  tags: ["Roles"],
  summary: "Get role",
  params: z.object({ roleId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
