import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError, ValidationError } from "../../errors.ts";
import { parseClientScopeDefinitions } from "../../utils/clientScopes.ts";

const ScopeSchema = z.object({
  key: z.string().min(1),
  description: z.string().optional(),
});

export const CreateClientSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.enum(["public", "confidential"]),
  tokenEndpointAuthMethod: z.enum(["none", "client_secret_basic"]).optional().default("none"),
  showOnUserDashboard: z.boolean().optional().default(false),
  dashboardPosition: z.number().int().min(0).optional().default(0),
  appUrl: z.string().url().optional(),
  dashboardIconMode: z.enum(["letter", "emoji", "upload"]).optional().default("letter"),
  dashboardIconEmoji: z.string().max(16).optional(),
  dashboardIconLetter: z.string().max(2).optional(),
  dashboardIconUpload: z
    .object({
      data: z.string(),
      mimeType: z.string(),
    })
    .optional(),
  requirePkce: z.boolean().optional().default(true),
  zkDelivery: z.enum(["none", "fragment-jwe"]).optional().default("none"),
  zkRequired: z.boolean().optional().default(false),
  allowedJweAlgs: z.array(z.string()).optional().default([]),
  allowedJweEncs: z.array(z.string()).optional().default([]),
  redirectUris: z.array(z.string().url()).optional().default([]),
  postLogoutRedirectUris: z.array(z.string().url()).optional().default([]),
  grantTypes: z.array(z.string()).optional().default(["authorization_code"]),
  responseTypes: z.array(z.string()).optional().default(["code"]),
  scopes: z
    .array(z.union([z.string().min(1), ScopeSchema]))
    .optional()
    .default([
      { key: "openid", description: "Authenticate you" },
      { key: "profile", description: "Access your profile information" },
    ]),
  allowedZkOrigins: z.array(z.string()).optional().default([]),
  idTokenLifetimeSeconds: z.number().int().positive().optional(),
  refreshTokenLifetimeSeconds: z.number().int().positive().optional(),
});

export const ClientResponseSchema = z.object({
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

import { genericErrors } from "../../http/openapi-helpers.ts";
import { createClient as createClientModel } from "../../models/clients.ts";
import { requireSession } from "../../services/sessions.ts";

import type { Context, ControllerSchema } from "../../types.ts";
import { withAudit } from "../../utils/auditWrapper.ts";
import { parseJsonSafely, readBody, sendJsonValidated } from "../../utils/http.ts";

async function createClientHandler(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: unknown[]
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole || session.adminRole !== "write") {
    throw new ForbiddenError("Write access required");
  }

  const body = await readBody(request);
  const raw = parseJsonSafely(body);
  const parsed = CreateClientSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("Validation error", parsed.error.issues);
  }

  const mode = parsed.data.dashboardIconMode;
  const emoji =
    mode === "emoji" && parsed.data.dashboardIconEmoji?.trim()
      ? parsed.data.dashboardIconEmoji.trim()
      : null;
  const letter =
    mode === "letter" && parsed.data.dashboardIconLetter?.trim()
      ? parsed.data.dashboardIconLetter.trim()
      : null;
  const upload = mode === "upload" ? parsed.data.dashboardIconUpload : undefined;

  const data = {
    ...parsed.data,
    dashboardIconEmoji: emoji,
    dashboardIconLetter: letter,
    dashboardIconMimeType: upload?.mimeType ?? null,
    dashboardIconData: upload ? Buffer.from(upload.data, "base64") : null,
  };

  const created = await createClientModel(context, data);
  const responseData = { ...created, scopes: parseClientScopeDefinitions(created.scopes) };
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

export const schema = {
  method: "POST",
  path: "/admin/clients",
  tags: ["Clients"],
  summary: "Create OAuth client",
  body: {
    description: "",
    required: true,
    contentType: "application/json",
    schema: CreateClientSchema,
  },
  responses: {
    201: {
      description: "Created",
      content: { "application/json": { schema: ClientResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
