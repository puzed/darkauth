import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";

const ClientResponseSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  showOnUserDashboard: z.boolean().optional(),
  type: z.string(),
  tokenEndpointAuthMethod: z.string(),
  requirePkce: z.boolean(),
  zkDelivery: z.string(),
  zkRequired: z.boolean(),
  allowedJweAlgs: z.array(z.string()),
  allowedJweEncs: z.array(z.string()),
  redirectUris: z.array(z.string()),
  postLogoutRedirectUris: z.array(z.string()),
  grantTypes: z.array(z.string()),
  responseTypes: z.array(z.string()),
  scopes: z.array(z.string()),
  allowedZkOrigins: z.array(z.string()),
  idTokenLifetimeSeconds: z.number().int().positive().nullable(),
  refreshTokenLifetimeSeconds: z.number().int().positive().nullable(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  clientSecret: z.string().optional(),
});
export const ClientsListResponseSchema = z.object({
  clients: z.array(ClientResponseSchema),
});

import { listClients } from "../../models/clients.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";

export async function getClients(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
): Promise<void> {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const clientsData = await listClients(context);

  const responseData = {
    clients: clientsData,
  };

  sendJsonValidated(response, 200, responseData, ClientsListResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/clients",
  tags: ["Clients"],
  summary: "List OAuth clients",
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ClientsListResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
