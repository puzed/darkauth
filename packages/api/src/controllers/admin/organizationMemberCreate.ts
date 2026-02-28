import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { addOrganizationMemberAdmin } from "../../models/rbacAdmin.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.ts";

const RequestSchema = z.object({ userSub: z.string().trim().min(1).max(255) });

const ResponseSchema = z.object({
  membershipId: z.string().uuid(),
  organizationId: z.string().uuid(),
  userSub: z.string(),
  status: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  roles: z.array(
    z.object({
      id: z.string().uuid(),
      key: z.string(),
      name: z.string(),
    })
  ),
});

const handler = async (
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const parsed = RequestSchema.parse(parseJsonSafely(await readBody(request)));
  const result = await addOrganizationMemberAdmin(context, organizationId, parsed.userSub);
  sendJsonValidated(response, 201, result, ResponseSchema);
};

export const postOrganizationMember = withAudit({
  eventType: "ORGANIZATION_MEMBER_UPDATE_ADMIN",
  resourceType: "organization_member",
  extractResourceId: (_body: unknown, _params: string[], data?: unknown) =>
    (data as { membershipId?: string } | undefined)?.membershipId,
})(handler);

export const schema = {
  method: "POST",
  path: "/admin/organizations/{organizationId}/members",
  tags: ["Organizations"],
  summary: "Add organization member",
  params: z.object({ organizationId: z.string().uuid() }),
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
