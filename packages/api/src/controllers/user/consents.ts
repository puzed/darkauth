import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { UnauthorizedError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { listUserClientConsents, revokeUserClientConsent } from "../../models/consents.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { sendJsonValidated, sendNoContent } from "../../utils/http.ts";

const ConsentSchema = z.object({
  client_id: z.string(),
  client_name: z.string(),
  scopes: z.array(z.string()),
  organization_id: z.string().nullable(),
  updated_at: z.string(),
});

const ResponseSchema = z.object({ consents: z.array(ConsentSchema) });

async function requireUserSub(context: Context, request: IncomingMessage) {
  const session = await requireSession(context, request, false);
  if (!session.sub) throw new UnauthorizedError("User session required");
  return session.sub;
}

export async function getUserConsents(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const sub = await requireUserSub(context, request);
  const consents = await listUserClientConsents(context, sub);
  sendJsonValidated(response, 200, { consents }, ResponseSchema);
}

export const deleteUserConsent = withAudit({
  eventType: "USER_CONSENT_REVOKE",
  resourceType: "client",
  extractResourceId: (_body, params) => params[0],
  skipBodyCapture: true,
})(async (context, request, response, clientId): Promise<void> => {
  const sub = await requireUserSub(context, request);
  if (!clientId) throw new ValidationError("client_id is required");
  await revokeUserClientConsent(context, sub, clientId);
  sendNoContent(response);
});

export const getUserConsentsSchema = {
  method: "GET",
  path: "/consents",
  tags: ["Consents"],
  summary: "listConsents",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;

export const deleteUserConsentSchema = {
  method: "DELETE",
  path: "/consents/{client_id}",
  tags: ["Consents"],
  summary: "revokeConsent",
  params: z.object({ client_id: z.string() }),
  responses: {
    204: { description: "No Content" },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
