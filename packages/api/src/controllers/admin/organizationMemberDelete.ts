import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { removeOrganizationMemberAdmin } from "../../models/rbacAdmin.js";
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
  memberId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const result = await removeOrganizationMemberAdmin(context, organizationId, memberId);
  sendJsonValidated(response, 200, result, ResponseSchema);
};

export const deleteOrganizationMember = withAudit({
  eventType: "ORGANIZATION_MEMBER_UPDATE_ADMIN",
  resourceType: "organization_member",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
})(handler);

export const schema = {
  method: "DELETE",
  path: "/admin/organizations/{organizationId}/members/{memberId}",
  tags: ["Organizations"],
  summary: "Remove organization member",
  params: z.object({
    organizationId: z.string().uuid(),
    memberId: z.string().uuid(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
