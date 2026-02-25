import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { listRolesAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

const RoleSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  system: z.boolean(),
  permissionKeys: z.array(z.string()),
});

const ResponseSchema = z.object({ roles: z.array(RoleSchema) });

export async function getRoles(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");

  const roles = await listRolesAdmin(context);
  sendJsonValidated(response, 200, { roles }, ResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/roles",
  tags: ["Roles"],
  summary: "List roles",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
