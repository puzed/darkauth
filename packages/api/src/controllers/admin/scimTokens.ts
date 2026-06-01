import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import {
  createScimBearerToken,
  listScimBearerTokens,
  revokeScimBearerToken,
} from "../../models/scim.ts";
import { getClientIp, logAuditEvent } from "../../services/audit.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context } from "../../types.ts";
import { parseJsonSafely, readBody, sendJson } from "../../utils/http.ts";

export async function getScimTokens(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, true);
  if (!session.adminRole) throw new ForbiddenError("Admin access required");
  sendJson(response, 200, { tokens: await listScimBearerTokens(context) });
}

export async function postScimToken(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse
) {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  const body = parseJsonSafely(await readBody(request));
  const parsed = z
    .object({
      name: z.string().min(1),
      organizationId: z.string().uuid(),
      connectionId: z.string().uuid().nullable().optional(),
      connectionName: z.string().min(1).nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
    })
    .parse(body);
  const token = await createScimBearerToken(context, {
    name: parsed.name,
    organizationId: parsed.organizationId,
    connectionId: parsed.connectionId,
    connectionName: parsed.connectionName,
    createdByAdminId: session.adminId,
    expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
  });
  await auditScimTokenEvent(context, request, {
    eventType: "SCIM_TOKEN_CREATE",
    adminId: session.adminId,
    organizationId: token.organizationId || undefined,
    connectionId: token.connectionId || undefined,
    resourceId: token.id,
    statusCode: 201,
    details: {
      name: token.name,
      token_prefix: token.tokenPrefix,
      expires_at: token.expiresAt?.toISOString() ?? null,
    },
  });
  sendJson(response, 201, token);
}

export async function deleteScimToken(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  tokenId: string
) {
  const session = await requireSession(context, request, true);
  if (session.adminRole !== "write") throw new ForbiddenError("Write access required");
  const result = await revokeScimBearerToken(context, tokenId);
  await auditScimTokenEvent(context, request, {
    eventType: "SCIM_TOKEN_REVOKE",
    adminId: session.adminId,
    organizationId: undefined,
    resourceId: tokenId,
    statusCode: 200,
  });
  sendJson(response, 200, result);
}

async function auditScimTokenEvent(
  context: Context,
  request: IncomingMessage,
  data: {
    eventType: string;
    adminId?: string;
    organizationId?: string;
    connectionId?: string;
    resourceId?: string;
    statusCode: number;
    details?: Record<string, unknown>;
  }
) {
  const userAgent = request.headers["user-agent"];
  await logAuditEvent(context, {
    eventType: data.eventType,
    method: request.method || "UNKNOWN",
    path: request.url || "/",
    cohort: "admin",
    adminId: data.adminId,
    organizationId: data.organizationId,
    enterpriseConnectionId: data.connectionId,
    enterpriseConnectionType: data.connectionId ? "scim" : undefined,
    ipAddress: getClientIp(request),
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    success: true,
    statusCode: data.statusCode,
    resourceType: "scim_token",
    resourceId: data.resourceId,
    action: (request.method || "UNKNOWN").toLowerCase(),
    details: data.details,
  });
}
