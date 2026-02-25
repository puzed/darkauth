import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod/v4";

import { ForbiddenError } from "../../errors.js";
import { genericErrors } from "../../http/openapi-helpers.js";

import type { AuditLogFilters } from "../../models/auditLogs.js";
import { attachActorInfo, countAuditLogs, listAuditLogs } from "../../models/auditLogs.js";
import { requireSession } from "../../services/sessions.js";
import type { Context, ControllerSchema } from "../../types.js";
import { sendJsonValidated } from "../../utils/http.js";
import {
  listPageOpenApiQuerySchema,
  listPageQuerySchema,
  listSearchQuerySchema,
} from "./listQueryBounds.js";

export const AuditLogSchema = z.object({
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
    sortBy: z.enum(["timestamp", "eventType", "resourceType", "success", "statusCode"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
});

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

  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const Query = z.object({
    page: listPageQuerySchema.default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    eventType: z.string().optional(),
    userId: z.string().optional(),
    adminId: z.string().optional(),
    clientId: z.string().optional(),
    resourceType: z.string().optional(),
    resourceId: z.string().optional(),
    success: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .optional()
      .transform((value) => {
        if (typeof value === "boolean") return value;
        if (value === "true") return true;
        if (value === "false") return false;
        return undefined;
      }),
    search: listSearchQuerySchema,
    sortBy: z.enum(["timestamp", "eventType", "resourceType", "success", "statusCode"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });
  const parsed = Query.parse(Object.fromEntries(url.searchParams));
  const page = parsed.page;
  const limit = parsed.limit;
  const offset = (page - 1) * limit;
  const startDate = parsed.startDate ? new Date(parsed.startDate) : undefined;
  const endDate = parsed.endDate ? new Date(parsed.endDate) : undefined;

  const filters: AuditLogFilters = {
    startDate,
    endDate,
    eventType: parsed.eventType,
    userId: parsed.userId,
    adminId: parsed.adminId,
    clientId: parsed.clientId,
    resourceType: parsed.resourceType,
    resourceId: parsed.resourceId,
    success: parsed.success,
    search: parsed.search,
    sortBy: parsed.sortBy,
    sortOrder: parsed.sortOrder,
    limit,
    offset,
  };

  const auditLogsList = await listAuditLogs(context, filters);
  const enriched = await attachActorInfo(context, auditLogsList);
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
      eventType: parsed.eventType,
      userId: parsed.userId,
      adminId: parsed.adminId,
      clientId: parsed.clientId,
      resourceType: parsed.resourceType,
      resourceId: parsed.resourceId,
      success: parsed.success,
      search: parsed.search,
      sortBy: parsed.sortBy,
      sortOrder: parsed.sortOrder,
    },
  };

  sendJsonValidated(response, 200, responseData, AuditLogsListResponseSchema);
}

export const schema = {
  method: "GET",
  path: "/admin/audit-logs",
  tags: ["Audit Logs"],
  summary: "List audit logs",
  query: z.object({
    page: listPageOpenApiQuerySchema,
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
    search: listSearchQuerySchema,
    sortBy: z.enum(["timestamp", "eventType", "resourceType", "success", "statusCode"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
  responses: {
    200: {
      description: "OK",
      content: { "application/json": { schema: AuditLogsListResponseSchema } },
    },
    ...genericErrors,
  },
} as const satisfies ControllerSchema;
