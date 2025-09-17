import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { genericErrors } from "../../http/openapi-helpers.js";

extendZodWithOpenApi(z);

import { ForbiddenError } from "../../errors.js";
import { exportAuditLogsCsv } from "../../models/auditLogs.js";
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
  const Query = z.object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    eventType: z.string().optional(),
    userId: z.string().optional(),
    adminId: z.string().optional(),
    clientId: z.string().optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    success: z.string().optional(),
    search: z.string().optional(),
  });
  const rawFilters = Query.parse(Object.fromEntries(url.searchParams));
  const filters = {
    ...rawFilters,
    success:
      rawFilters.success === undefined ? undefined : rawFilters.success === "true",
  };

  const csvContent = await exportAuditLogsCsv(context, filters);
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
