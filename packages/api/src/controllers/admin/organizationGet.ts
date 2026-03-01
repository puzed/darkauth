import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getOrganizationAdmin } from "../../models/rbacAdmin.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

const ResponseSchema = z.object({
  organization: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    forceOtp: z.boolean(),
  }),
  members: z.array(
    z.object({
      id: z.string().uuid(),
      userSub: z.string(),
      status: z.string(),
      email: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
    })
  ),
});

export async function getOrganization(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  organizationId: string
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");

  const result = await getOrganizationAdmin(context, organizationId);
  sendJsonValidated(response, 200, result, ResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/organizations/{organizationId}",
  tags: ["Organizations"],
  summary: "Get organization",
  params: z.object({ organizationId: z.string().uuid() }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
