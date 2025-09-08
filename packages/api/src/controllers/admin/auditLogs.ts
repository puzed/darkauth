import type { IncomingMessage, ServerResponse } from "node:http";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";

const AuditLogSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  eventType: z.string(),
  userId: z.string().optional().nullable(),
  adminId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  resourceType: z.string().optional().nullable(),
  resourceId: z.string().optional().nullable(),
  success: z.boolean().optional(),
  ipAddress: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
  actorType: z.enum(["Admin", "User", "System"]),
  actorId: z.string(),
  actorEmail: z.string().optional(),
  actorName: z.string().optional(),
  resource: z.string().optional(),
});
const PaginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});
export const AuditLogsListResponseSchema = z.object({
  auditLogs: z.array(AuditLogSchema),
  pagination: PaginationSchema,
  filters: z.object({
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
  }),
});

import type { AuditLogFilters } from "../../models/auditLogs.js";
import { attachActorInfo, countAuditLogs, listAuditLogs } from "../../models/auditLogs.js";
import { requireSession } from "../../services/sessions.js";
import type { Context } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";
import { getPaginationFromUrl } from "../../utils/pagination.js";

export async function getAuditLogs(
  context: Context,
  request: IncomingMessage,
  response: ServerResponse,
  ..._params: string[]
) {
  const sessionData = await requireSession(context, request, true);
  if (!sessionData.adminRole) {
    throw new ForbiddenError("Admin access required");
  }

  // Parse query parameters
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const { page, limit, offset } = getPaginationFromUrl(url, 20, 100);

  // Parse filter parameters
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

  // Build filters object
  const filters: AuditLogFilters = {
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
    limit,
    offset,
  };

  // Query audit logs with filters
  const auditLogsList = await listAuditLogs(context, filters);

  const enriched = await attachActorInfo(context, auditLogsList);

  // Get total count for pagination (using same filters but without limit/offset)
  const total = await countAuditLogs(context, filters);
  const totalPages = Math.ceil(total / limit);

  const responseData = {
    auditLogs: enriched,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    filters: {
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      eventType,
      userId,
      adminId,
      clientId,
      resourceType,
      resourceId,
      success,
      search,
    },
  };

  sendJsonValidated(response, 200, responseData, AuditLogsListResponseSchema);
}

export function registerOpenApi(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/admin/audit-logs",
    tags: ["Audit Logs"],
    summary: "List audit logs",
    request: {
      query: z.object({
        page: z.number().int().positive().optional(),
        limit: z.number().int().positive().optional(),
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
      }),
    },
    responses: {
      200: {
        description: "OK",
        content: { "application/json": { schema: AuditLogsListResponseSchema } },
      },
      ...genericErrors,
    },
  });
}
