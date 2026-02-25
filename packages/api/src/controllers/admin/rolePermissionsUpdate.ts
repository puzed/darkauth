import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { setRolePermissionsAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.js";

const RequestSchema = z.object({ permissionKeys: z.array(z.string()) });
const ResponseSchema = z.object({ roleId: z.string().uuid(), permissionKeys: z.array(z.string()) });

const handler = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  roleId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const parsed = RequestSchema.parse(parseJsonSafely(await readBody(request)));
  const result = await setRolePermissionsAdmin(context, roleId, parsed.permissionKeys);
  sendJsonValidated(response, 200, result, ResponseSchema);
};

export const putRolePermissions = withAudit({
  eventType: "ROLE_PERMISSIONS_UPDATE_ADMIN",
  resourceType: "role",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(handler);

export const schema = {
  method: "PUT",
  path: "/admin/roles/{roleId}/permissions",
  tags: ["Roles"],
  summary: "Replace role permissions",
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
