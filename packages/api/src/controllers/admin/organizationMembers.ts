import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { listOrganizationMembersAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

const MemberSchema = z.object({
  membershipId: z.string().uuid(),
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

const ResponseSchema = z.object({
  members: z.array(MemberSchema),
});

export async function getOrganizationMembersAdmin(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");

  const members = await listOrganizationMembersAdmin(context, organizationId);
  sendJsonValidated(response, 200, { members }, ResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/organizations/{organizationId}/members",
  tags: ["Organizations"],
  summary: "List organization members",
  params: z.object({ organizationId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
