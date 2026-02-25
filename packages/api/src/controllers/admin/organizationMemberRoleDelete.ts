import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { removeOrganizationMemberRoleAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { sendJsonValidated } from "../../utils/http.js";

const ResponseSchema = z.object({ success: z.literal(true) });

const handler = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string,
  memberId: string,
  roleId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const result = await removeOrganizationMemberRoleAdmin(context, organizationId, memberId, roleId);
  sendJsonValidated(response, 200, result, ResponseSchema);
};

export const deleteOrganizationMemberRole = withAudit({
  eventType: "ORGANIZATION_MEMBER_ROLES_UPDATE_ADMIN",
  resourceType: "organization_member",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
})(handler);

export const schema = {
  method: "DELETE",
  path: "/admin/organizations/{organizationId}/members/{memberId}/roles/{roleId}",
  tags: ["Organizations"],
  summary: "Remove organization member role",
  params: z.object({
    organizationId: z.string().uuid(),
    memberId: z.string().uuid(),
    roleId: z.string().uuid(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
