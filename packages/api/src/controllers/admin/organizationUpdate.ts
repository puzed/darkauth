import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { updateOrganizationAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.js";

const RequestSchema = z
  .object({ name: z.string().min(1).optional(), slug: z.string().min(1).optional() })
  .refine((data) => data.name !== undefined || data.slug !== undefined, {
    message: "Provide at least one field",
  });

const ResponseSchema = z.object({
  organization: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }),
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
  const organization = await updateOrganizationAdmin(context, organizationId, parsed);
  sendJsonValidated(response, 200, { organization }, ResponseSchema);
};

export const putOrganization = withAudit({
  eventType: "ORGANIZATION_UPDATE_ADMIN",
  resourceType: "organization",
  extractResourceId: (_body: unknown, params: string[]) => params[0],
})(handler);

export const schema = {
  method: "PUT",
  path: "/admin/organizations/{organizationId}",
  tags: ["Organizations"],
  summary: "Update organization",
  params: z.object({ organizationId: z.string().uuid() }),
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
