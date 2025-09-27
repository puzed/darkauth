import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";
import { updateClient } from "../../models/clients.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function updateClientHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const Params = z.object({ clientId: z.string() });
  const { clientId } = Params.parse({ clientId: params[0] });
  const session = await requireSession(context, request, true);
  if (!session.adminRole || session.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }
  const body = await readBody(request);
  const parsed = parseJsonSafely(body);
  if (!parsed || typeof parsed !== "object") throw new ValidationError("Invalid JSON body");
  const Req = z.object({
    name: z.string().optional(),
    type: z.enum(["public", "confidential"]).optional(),
    tokenEndpointAuthMethod: z.enum(["none", "client_secret_basic"]).optional(),
    requirePkce: z.boolean().optional(),
    zkDelivery: z.enum(["none", "fragment-jwe"]).optional(),
    zkRequired: z.boolean().optional(),
    showOnUserDashboard: z.boolean().optional(),
    allowedJweAlgs: z.array(z.string()).optional(),
    allowedJweEncs: z.array(z.string()).optional(),
    redirectUris: z.array(z.string()).optional(),
    postLogoutRedirectUris: z.array(z.string()).optional(),
    grantTypes: z.array(z.string()).optional(),
    responseTypes: z.array(z.string()).optional(),
    scopes: z.array(z.string()).optional(),
    allowedZkOrigins: z.array(z.string()).optional(),
    idTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
    refreshTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
  });
  const updates = Req.parse(parsed as unknown);
  await updateClient(context, clientId, updates);

  sendJson(response, 200, { success: true });
}

export const updateClientController = withAudit({
  eventType: "CLIENT_UPDATE",
  resourceType: "client",
  extractResourceId: (body: unknown, params: string[]) => {
    if (params[0]) return params[0];
    if (body && typeof body === "object") {
      const b = body as { client_id?: string; clientId?: string };
      return b.client_id ?? b.clientId;
    }
    return undefined;
  },
})(updateClientHandler);

// OpenAPI schema definition
const Req = z.object({
  name: z.string().optional(),
  type: z.enum(["public", "confidential"]).optional(),
  tokenEndpointAuthMethod: z.enum(["none", "client_secret_basic"]).optional(),
  requirePkce: z.boolean().optional(),
  zkDelivery: z.enum(["none", "fragment-jwe"]).optional(),
  zkRequired: z.boolean().optional(),
  showOnUserDashboard: z.boolean().optional(),
  allowedJweAlgs: z.array(z.string()).optional(),
  allowedJweEncs: z.array(z.string()).optional(),
  redirectUris: z.array(z.string()).optional(),
  postLogoutRedirectUris: z.array(z.string()).optional(),
  grantTypes: z.array(z.string()).optional(),
  responseTypes: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  allowedZkOrigins: z.array(z.string()).optional(),
  idTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
  refreshTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
});

const Resp = z.object({ success: z.boolean() });

export const schema = {
  method: "PUT",
  path: "/admin/clients/{clientId}",
  tags: ["Clients"],
  summary: "Update OAuth client",
  params: z.object({ clientId: z.string() }),
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: Req,
  },
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
