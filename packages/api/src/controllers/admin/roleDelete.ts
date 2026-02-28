import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { deleteRoleAdmin } from "../../models/rbacAdmin.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const ResponseSchema = z.object({ success: z.literal(true) });

const handler = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  roleId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const result = await deleteRoleAdmin(context, roleId);
  sendJsonValidated(response, 200, result, ResponseSchema);
};

export const deleteRole = withAudit({
  eventType: "ROLE_DELETE_ADMIN",
  resourceType: "role",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(handler);

export const schema = {
  method: "DELETE",
  path: "/admin/roles/{roleId}",
  tags: ["Roles"],
  summary: "Delete role",
  params: z.object({ roleId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
