import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import { ForbiddenError, ValidationError } from "../../errors.js";
export const CreateClientSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.enum(["public", "confidential"]),
  tokenEndpointAuthMethod: z.enum(["none", "client_secret_basic"]).optional().default("none"),
  requirePkce: z.boolean().optional().default(true),
  zkDelivery: z.enum(["none", "fragment-jwe"]).optional().default("none"),
  zkRequired: z.boolean().optional().default(false),
  allowedJweAlgs: z.array(z.string()).optional().default([]),
  allowedJweEncs: z.array(z.string()).optional().default([]),
  redirectUris: z.array(z.string().url()).optional().default([]),
  postLogoutRedirectUris: z.array(z.string().url()).optional().default([]),
  grantTypes: z.array(z.string()).optional().default(["authorization_code"]),
  responseTypes: z.array(z.string()).optional().default(["code"]),
  scopes: z.array(z.string()).optional().default(["openid", "profile"]),
  allowedZkOrigins: z.array(z.string()).optional().default([]),
  idTokenLifetimeSeconds: z.number().int().positive().optional(),
  refreshTokenLifetimeSeconds: z.number().int().positive().optional(),
});

export const ClientResponseSchema = z.object({
  clientId: z.string(),
  name: z.string(),
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

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { genericErrors } from "../../http/openapi-helpers.js";
import { createClient as createClientModel } from "../../models/clients.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.js";

async function createClientHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = CreateClientSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const data = parsed.data;

  const created = await createClientModel(context, data);
  const responseData = { ...created };
  sendJsonValidated(response, 201, responseData, ClientResponseSchema);
}

export const createClient = withAudit({
  eventType: "CLIENT_CREATE",
  resourceType: "client",
  extractResourceId: (body: unknown) => {
    if (body && typeof body === "object") {
      const data = body as { client_id?: string; clientId?: string };
      return data.client_id ?? data.clientId;
    }
    return undefined;
  },
})(createClientHandler);

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "post",
    path: "/admin/clients",
    tags: ["Clients"],
    summary: "Create OAuth client",
    request: { body: { content: { "application/json": { schema: CreateClientSchema } } } },
    responses: {
      201: {
        description: "Created",
        content: { "application/json": { schema: ClientResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
