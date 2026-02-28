import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { deleteOrganizationAdmin } from "../../models/rbacAdmin.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const ResponseSchema = z.object({ success: z.literal(true) });

const handler = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const result = await deleteOrganizationAdmin(context, organizationId);
  sendJsonValidated(response, 200, result, ResponseSchema);
};

export const deleteOrganization = withAudit({
  eventType: "ORGANIZATION_DELETE_ADMIN",
  resourceType: "organization",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(handler);

export const schema = {
  method: "DELETE",
  path: "/admin/organizations/{organizationId}",
  tags: ["Organizations"],
  summary: "Delete organization",
  params: z.object({ organizationId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
