import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";
import { ForbiddenError } from "../../errors.ts";
import { genericErrors } from "../../http/openapi-helpers.ts";
import { exportAuditLogsCsv } from "../../models/auditLogs.ts";
import { requireSession } from "../../services/sessions.ts";
import type { Context, ControllerSchema } from "../../types.ts";

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
    success: rawFilters.success === undefined ? undefined : rawFilters.success === "true",
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

// OpenAPI schema definition
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

export const schema = {
  method: "GET",
  path: "/admin/audit-logs/export",
  tags: ["Audit Logs"],
  summary: "Export audit logs CSV",
  query: Query,
  responses: {
    200: { description: "OK", content: { "text/csv": { schema: z.string() } } },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
