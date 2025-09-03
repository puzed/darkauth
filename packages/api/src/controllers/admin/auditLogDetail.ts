import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { eq } from "drizzle-orm";
import { adminUsers, users } from "../../db/schema.js";
import { ForbiddenError, NotFoundError } from "../../errors.js";
import { getAuditLogById } from "../../services/audit.js";
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
  const auditLog = await getAuditLogById(context, logId);
  if (!auditLog) {
    throw new NotFoundError("Audit log not found");
  }

  let actorType = "System";
  let actorId: string | null = null;
  let actorEmail: string | undefined;
  let actorName: string | undefined;
  if (auditLog.adminId) {
    actorType = "Admin";
    const rows = await context.db
      .select({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name })
      .from(adminUsers)
      .where(eq(adminUsers.id, auditLog.adminId as string));
    const adminUser = rows[0];
    actorId = adminUser?.email || auditLog.adminId;
    actorEmail = adminUser?.email;
    actorName = adminUser?.name;
  } else if (auditLog.userId) {
    actorType = "User";
    const rows = await context.db
      .select({ sub: users.sub, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.sub, auditLog.userId as string));
    const user = rows[0];
    actorId = user?.email || auditLog.userId;
    actorEmail = user?.email || undefined;
    actorName = user?.name || undefined;
  } else {
    actorId = "system";
  }

  const responseData = {
    auditLog: {
      ...auditLog,
      timestamp: new Date(auditLog.timestamp as unknown as Date).toISOString(),
      actorType,
      actorId,
      actorEmail,
      actorName,
      resource: auditLog.resourceType || undefined,
    },
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
