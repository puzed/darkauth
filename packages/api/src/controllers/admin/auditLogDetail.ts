import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError, NotFoundError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { getAuditLogWithActor } from "../../models/auditLogs.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";
import { sendJson } from "../../utils/http.ts";

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
  const Params = z.object({ id: z.string().min(1) });
  const parsed = Params.safeParse({ id: logId });
  if (!parsed.success) throw new NotFoundError("Invalid audit log ID");
  const enriched = await getAuditLogWithActor(context, logId);
  if (!enriched) {
    throw new NotFoundError("Audit log not found");
  }

  const responseData = {
    auditLog: enriched,
  };
  sendJson(response, 200, responseData);
}

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

export const schema = {
  method: "GET",
  path: "/admin/audit-logs/{id}",
  tags: ["Audit Logs"],
  summary: "Get audit log detail",
  params: z.object({ id: z.string() }),
  responses: {
    200: { description: "OK", content: { "application/json": { schema: Resp } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
