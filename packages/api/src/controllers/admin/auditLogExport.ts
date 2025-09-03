import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";
import { exportAuditLogs } from "../../services/audit.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";

export async function getAuditLogExport(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const startDate = url.searchParams.get("startDate")
    ? new Date(url.searchParams.get("startDate") || "")
    : undefined;
  const endDate = url.searchParams.get("endDate")
    ? new Date(url.searchParams.get("endDate") || "")
    : undefined;
  const eventType = url.searchParams.get("eventType") || undefined;
  const userId = url.searchParams.get("userId") || undefined;
  const adminId = url.searchParams.get("adminId") || undefined;
  const clientId = url.searchParams.get("clientId") || undefined;
  const resourceType = url.searchParams.get("resourceType") || undefined;
  const resourceId = url.searchParams.get("resourceId") || undefined;
  const success = url.searchParams.get("success")
    ? url.searchParams.get("success") === "true"
    : undefined;
  const search = url.searchParams.get("search") || undefined;

  const filters = {
    startDate,
    endDate,
    eventType,
    userId,
    adminId,
    clientId,
    resourceType,
    resourceId,
    success,
    search,
  };

  const csvContent = await exportAuditLogs(context, filters);
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `audit-logs-${timestamp}.csv`;
  response.setHeader("Content-Type", "text/csv");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Cache-Control", "no-cache");
  response.statusCode = 200;
  response.end(csvContent);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  const Query = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    eventType: z.string().optional(),
    userId: z.string().optional(),
    adminId: z.string().optional(),
    clientId: z.string().optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    success: z.boolean().optional(),
    search: z.string().optional(),
  });
  registry.registerPath({
    method: "get",
    path: "/admin/audit-logs/export",
    tags: ["Audit Logs"],
    summary: "Export audit logs CSV",
    request: { query: Query },
    responses: {
      200: { description: "OK", content: { "text/csv": { schema: z.string() } } },
      ...genericErrors,
    },
  });
}
