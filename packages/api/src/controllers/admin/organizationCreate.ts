import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { createOrganizationAdmin } from "../../models/rbacAdmin.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.js";

const RequestSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
});

const ResponseSchema = z.object({
  organization: z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() }),
});

const handler = async (context: Context, request: IncomingMessage, response: ServerResponse) => {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");

  const parsed = RequestSchema.parse(parseJsonSafely(await readBody(request)));
  const organization = await createOrganizationAdmin(context, parsed);
  sendJsonValidated(response, 201, { organization }, ResponseSchema);
};

export const postOrganization = withAudit({
  eventType: "ORGANIZATION_CREATE_ADMIN",
  resourceType: "organization",
  extractResourceId: (_body: unknown, _params: string[], data?: unknown) =>
    (data as { organization?: { id?: string } } | undefined)?.organization?.id,
})(handler);

export const schema = {
  method: "POST",
  path: "/admin/organizations",
  tags: ["Organizations"],
  summary: "Create organization",
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
