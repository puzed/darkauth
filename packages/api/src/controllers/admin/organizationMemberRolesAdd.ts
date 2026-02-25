import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { addOrganizationMemberRolesAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.js";

const RequestSchema = z.object({ roleIds: z.array(z.string().uuid()).min(1) });

const ResponseSchema = z.object({
  memberId: z.string().uuid(),
  organizationId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()),
});

const handler = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string,
  memberId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const parsed = RequestSchema.parse(parseJsonSafely(await readBody(request)));
  const result = await addOrganizationMemberRolesAdmin(
    context,
    organizationId,
    memberId,
    parsed.roleIds
  );
  sendJsonValidated(response, 200, result, ResponseSchema);
};

export const postOrganizationMemberRoles = withAudit({
  eventType: "ORGANIZATION_MEMBER_ROLES_UPDATE_ADMIN",
  resourceType: "organization_member",
  extractResourceId: (_body: unknown, params: string[]) => params[1],
})(handler);

export const schema = {
  method: "POST",
  path: "/admin/organizations/{organizationId}/members/{memberId}/roles",
  tags: ["Organizations"],
  summary: "Add organization member roles",
  params: z.object({ organizationId: z.string().uuid(), memberId: z.string().uuid() }),
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
