import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { clients } from "../../db/schema.js";
import { ForbiddenError, ValidationError } from "../../errors.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { withAudit } from "../../utils/auditWrapper.js";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.js";

async function updateClientHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ...params: string[]
): Promise<void> {
  const clientId = params[0];
  if (!clientId) throw new ValidationError("Client ID is required");
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");
  const body = await readBody(request);
  const parsed = parseJsonSafely(body);
  if (!parsed || typeof parsed !== "object") throw new ValidationError("Invalid JSON body");
  const data = parsed as Record<string, unknown>;

  const updates: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
  if (typeof data.name === "string") updates.name = data.name;
  if (data.type === "public" || data.type === "confidential") updates.type = data.type;
  if (
    data.tokenEndpointAuthMethod === "none" ||
    data.tokenEndpointAuthMethod === "client_secret_basic"
  )
    updates.tokenEndpointAuthMethod = data.tokenEndpointAuthMethod;
  if (typeof data.requirePkce === "boolean") updates.requirePkce = data.requirePkce;
  if (data.zkDelivery === "none" || data.zkDelivery === "fragment-jwe")
    updates.zkDelivery = data.zkDelivery;
  if (typeof data.zkRequired === "boolean") updates.zkRequired = data.zkRequired;
  if (
    Array.isArray(data.allowedJweAlgs) &&
    data.allowedJweAlgs.every((item): item is string => typeof item === "string")
  )
    updates.allowedJweAlgs = data.allowedJweAlgs;
  if (
    Array.isArray(data.allowedJweEncs) &&
    data.allowedJweEncs.every((item): item is string => typeof item === "string")
  )
    updates.allowedJweEncs = data.allowedJweEncs;
  if (
    Array.isArray(data.redirectUris) &&
    data.redirectUris.every((item): item is string => typeof item === "string")
  )
    updates.redirectUris = data.redirectUris;
  if (
    Array.isArray(data.postLogoutRedirectUris) &&
    data.postLogoutRedirectUris.every((item): item is string => typeof item === "string")
  )
    updates.postLogoutRedirectUris = data.postLogoutRedirectUris;
  if (
    Array.isArray(data.grantTypes) &&
    data.grantTypes.every((item): item is string => typeof item === "string")
  )
    updates.grantTypes = data.grantTypes;
  if (
    Array.isArray(data.responseTypes) &&
    data.responseTypes.every((item): item is string => typeof item === "string")
  )
    updates.responseTypes = data.responseTypes;
  if (
    Array.isArray(data.scopes) &&
    data.scopes.every((item): item is string => typeof item === "string")
  )
    updates.scopes = data.scopes;
  if (
    Array.isArray(data.allowedZkOrigins) &&
    data.allowedZkOrigins.every((item): item is string => typeof item === "string")
  )
    updates.allowedZkOrigins = data.allowedZkOrigins;
  if (typeof data.idTokenLifetimeSeconds === "number")
    updates.idTokenLifetimeSeconds = data.idTokenLifetimeSeconds;
  if (typeof data.refreshTokenLifetimeSeconds === "number")
    updates.refreshTokenLifetimeSeconds = data.refreshTokenLifetimeSeconds;

  await context.db.update(clients).set(updates).where(eq(clients.clientId, clientId));

  sendJson(response, 200, { success: true });
}

export const updateClient = withAudit({
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

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Req = z.object({
    name: z.string().optional(),
    type: z.enum(["public", "confidential"]).optional(),
    tokenEndpointAuthMethod: z.enum(["none", "client_secret_basic"]).optional(),
    requirePkce: z.boolean().optional(),
    zkDelivery: z.enum(["none", "fragment-jwe"]).optional(),
    zkRequired: z.boolean().optional(),
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
  registry.registerPath({
    method: "put",
    path: "/admin/clients/{clientId}",
    tags: ["Clients"],
    summary: "Update OAuth client",
    request: {
      params: z.object({ clientId: z.string() }),
      body: { content: { "application/json": { schema: Req } } },
    },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
