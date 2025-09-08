import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError, NotFoundError } from "../../errors.js";
import { getAuditLogWithActor } from "../../models/auditLogs.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJson } from "../../utils/http.js";

export async function getAuditLogDetail(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  logId: string
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }
  if (!logId || typeof logId !== "string") {
    throw new NotFoundError("Invalid audit log ID");
  }
  const enriched = await getAuditLogWithActor(context, logId);
  if (!enriched) {
    throw new NotFoundError("Audit log not found");
  }

  const responseData = {
    auditLog: enriched,
  };
  sendJson(response, 200, responseData);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const AuditLog = z.object({
    id: z.string(),
    eventType: z.string(),
    timestamp: z.string(),
    userId: z.string().nullable().optional(),
    adminId: z.string().nullable().optional(),
    clientId: z.string().nullable().optional(),
    resourceType: z.string().nullable().optional(),
    resourceId: z.string().nullable().optional(),
    success: z.boolean().optional(),
    actorType: z.string(),
    actorId: z.string(),
    actorEmail: z.string().optional(),
    actorName: z.string().optional(),
    resource: z.string().optional(),
  });
  const Resp = z.object({ auditLog: AuditLog });
  registry.registerPath({
    method: "get",
    path: "/admin/audit-logs/{id}",
    tags: ["Audit Logs"],
    summary: "Get audit log detail",
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: "OK", content: { "application/json": { schema: Resp } } },
      ...genericErrors,
    },
  });
}
