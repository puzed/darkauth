import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { parseClientScopeDefinitions } from "../../utils/clientScopes.ts";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.ts";

const ScopeSchema = z.object({
  key: z.string(),
  description: z.string().optional(),
});

const ClientResponseSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  showOnUserDashboard: z.boolean().optional(),
  dashboardPosition: z.number().int(),
  appUrl: z.string().nullable().optional(),
  dashboardIconMode: z.enum(["letter", "emoji", "upload"]),
  dashboardIconEmoji: z.string().nullable().optional(),
  dashboardIconLetter: z.string().nullable().optional(),
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
  scopes: z.array(ScopeSchema),
  allowedZkOrigins: z.array(z.string()),
  idTokenLifetimeSeconds: z.number().int().positive().nullable(),
  refreshTokenLifetimeSeconds: z.number().int().positive().nullable(),
  createdAt: z.date().or(z.string()),
  updatedAt: z.date().or(z.string()),
  clientSecret: z.string().optional(),
});
export const ClientsListResponseSchema = z.object({
  clients: z.array(ClientResponseSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

import { listClients } from "../../models/clients.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJsonValidated } from "../../utils/http.ts";

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

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: listSearchQuerySchema,
    sortBy: z.enum(["createdAt", "updatedAt", "clientId", "name", "type"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const responseData = await listClients(context, parsed);
  const normalized = {
    ...responseData,
    clients: responseData.clients.map((client) => ({
      ...client,
      scopes: parseClientScopeDefinitions(client.scopes),
    })),
  };
  sendJsonValidated(response, 200, normalized, ClientsListResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/clients",
  tags: ["Clients"],
  summary: "List OAuth clients",
  query: z.object({
    page: listPageOpenApiQuerySchema,
    limit: z.number().int().positive().optional(),
    search: listSearchQuerySchema,
    sortBy: z.enum(["createdAt", "updatedAt", "clientId", "name", "type"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: ClientsListResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
