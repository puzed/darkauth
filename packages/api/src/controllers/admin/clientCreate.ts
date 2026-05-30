import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError, ValidationError } from "../../errors.ts";
import { parseClientScopeDefinitions } from "../../utils/clientScopes.ts";

const ScopeSchema = z.object({
  key: z.string().min(1),
  description: z.string().optional(),
});

const DASHBOARD_ICON_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type DashboardIconUpload = { data: string; mimeType: string };

function normalizeDashboardIconMimeType(mimeType: string) {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  return normalized && DASHBOARD_ICON_MIME_TYPES.has(normalized) ? normalized : null;
}

function decodeBase64(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new ValidationError("Dashboard icon data must be valid base64");
  }
  const data = Buffer.from(normalized, "base64");
  if (data.toString("base64") !== normalized) {
    throw new ValidationError("Dashboard icon data must be valid base64");
  }
  return data;
}

export function isSafeDashboardIcon(data: Uint8Array, mimeType: string) {
  const normalized = normalizeDashboardIconMimeType(mimeType);
  if (!normalized) return false;
  const bytes = Buffer.from(data);
  if (normalized === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (normalized === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (normalized === "image/webp") {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }
  if (normalized === "image/gif") {
    const signature = bytes.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }
  return false;
}

export function parseDashboardIconUpload(upload: DashboardIconUpload) {
  const mimeType = normalizeDashboardIconMimeType(upload.mimeType);
  if (!mimeType) throw new ValidationError("Unsupported dashboard icon type");
  const data = decodeBase64(upload.data);
  if (!isSafeDashboardIcon(data, mimeType)) {
    throw new ValidationError("Dashboard icon content does not match type");
  }
  return { data, mimeType };
}

export const CreateClientSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(255),
  type: z.enum(["public", "confidential"]),
  tokenEndpointAuthMethod: z.enum(["none", "client_secret_basic"]).optional().default("none"),
  showOnUserDashboard: z.boolean().optional().default(false),
  dashboardAutoLogin: z.boolean().optional().default(false),
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
  keyDeliveryVersion: z.enum(["v1-drk", "v2"]).optional().default("v2"),
  deliveredKeyKind: z.enum(["root_key", "client_app_key"]).optional(),
  clientKeyScope: z.enum(["account", "organization"]).optional().default("organization"),
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
  accessTokenLifetimeSeconds: z.number().int().positive().optional(),
  refreshTokenLifetimeSeconds: z.number().int().positive().optional(),
});

export const ClientResponseSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  showOnUserDashboard: z.boolean().optional(),
  dashboardAutoLogin: z.boolean().optional(),
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
  keyDeliveryVersion: z.string(),
  deliveredKeyKind: z.string(),
  clientKeyScope: z.string(),
  allowedJweAlgs: z.array(z.string()),
  allowedJweEncs: z.array(z.string()),
  redirectUris: z.array(z.string()),
  postLogoutRedirectUris: z.array(z.string()),
  grantTypes: z.array(z.string()),
  responseTypes: z.array(z.string()),
  scopes: z.array(ScopeSchema),
  allowedZkOrigins: z.array(z.string()),
  idTokenLifetimeSeconds: z.number().int().positive().nullable(),
  accessTokenLifetimeSeconds: z.number().int().positive().nullable(),
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
  const icon = upload ? parseDashboardIconUpload(upload) : undefined;

  const data = {
    ...parsed.data,
    dashboardIconEmoji: emoji,
    dashboardIconLetter: letter,
    dashboardIconMimeType: icon?.mimeType ?? null,
    dashboardIconData: icon?.data ?? null,
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
