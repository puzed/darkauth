import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, ValidationError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { updateClient } from "../../models/clients.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

const ScopeSchema = z.object({
  key: z.string().min(1),
  description: z.string().optional(),
});

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
    dashboardPosition: z.number().int().min(0).optional(),
    appUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
    dashboardIconMode: z.enum(["letter", "emoji", "upload"]).optional(),
    dashboardIconEmoji: z.string().max(16).nullable().optional(),
    dashboardIconLetter: z.string().max(2).nullable().optional(),
    dashboardIconUpload: z
      .object({
        data: z.string(),
        mimeType: z.string(),
      })
      .nullable()
      .optional(),
    allowedJweAlgs: z.array(z.string()).optional(),
    allowedJweEncs: z.array(z.string()).optional(),
    redirectUris: z.array(z.string()).optional(),
    postLogoutRedirectUris: z.array(z.string()).optional(),
    grantTypes: z.array(z.string()).optional(),
    responseTypes: z.array(z.string()).optional(),
    scopes: z.array(z.union([z.string().min(1), ScopeSchema])).optional(),
    allowedZkOrigins: z.array(z.string()).optional(),
    idTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
    accessTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
    refreshTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
  });
  const parsedUpdates = Req.parse(parsed as unknown);
  const updates: Record<string, unknown> = { ...parsedUpdates };
  if (parsedUpdates.appUrl === "") {
    updates.appUrl = null;
  }
  const iconMode = parsedUpdates.dashboardIconMode;
  if (iconMode) {
    if (iconMode === "emoji") {
      if (Object.hasOwn(parsedUpdates, "dashboardIconEmoji")) {
        updates.dashboardIconEmoji = parsedUpdates.dashboardIconEmoji?.trim() || null;
      }
      updates.dashboardIconLetter = null;
    }
    if (iconMode === "letter") {
      if (Object.hasOwn(parsedUpdates, "dashboardIconLetter")) {
        updates.dashboardIconLetter = parsedUpdates.dashboardIconLetter?.trim() || null;
      }
      updates.dashboardIconEmoji = null;
    }
    if (iconMode !== "upload") {
      updates.dashboardIconData = null;
      updates.dashboardIconMimeType = null;
    }
  }
  const iconUpload = parsedUpdates.dashboardIconUpload as
    | { data: string; mimeType: string }
    | null
    | undefined;
  if (iconUpload) {
    updates.dashboardIconData = Buffer.from(iconUpload.data, "base64");
    updates.dashboardIconMimeType = iconUpload.mimeType;
  } else if (iconUpload === null) {
    updates.dashboardIconData = null;
    updates.dashboardIconMimeType = null;
  }
  await updateClient(context, clientId, updates as Parameters<typeof updateClient>[2]);

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
  dashboardPosition: z.number().int().min(0).optional(),
  appUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
  dashboardIconMode: z.enum(["letter", "emoji", "upload"]).optional(),
  dashboardIconEmoji: z.string().max(16).nullable().optional(),
  dashboardIconLetter: z.string().max(2).nullable().optional(),
  dashboardIconUpload: z
    .object({
      data: z.string(),
      mimeType: z.string(),
    })
    .nullable()
    .optional(),
  allowedJweAlgs: z.array(z.string()).optional(),
  allowedJweEncs: z.array(z.string()).optional(),
  redirectUris: z.array(z.string()).optional(),
  postLogoutRedirectUris: z.array(z.string()).optional(),
  grantTypes: z.array(z.string()).optional(),
  responseTypes: z.array(z.string()).optional(),
  scopes: z.array(z.union([z.string().min(1), ScopeSchema])).optional(),
  allowedZkOrigins: z.array(z.string()).optional(),
  idTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
  accessTokenLifetimeSeconds: z.number().int().positive().nullable().optional(),
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
