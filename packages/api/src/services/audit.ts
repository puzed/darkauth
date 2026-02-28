import type { IncomingMessage } from "node:http";
import { and, asc, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { auditLogs } from "../db/schema.ts";
import type { Context } from "../types.ts";

export interface AuditEvent {
  eventType: string;
  method?: string;
  path?: string;
  cohort?: string;
  userId?: string;
  adminId?: string;
  clientId?: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  statusCode?: number;
  errorCode?: string;
  errorMessage?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  requestBody?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  responseTime?: number;
  details?: Record<string, unknown>;
}

export interface AuditFilters {
  startDate?: Date;
  endDate?: Date;
  eventType?: string;
  userId?: string;
  adminId?: string;
  clientId?: string;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "timestamp" | "eventType" | "resourceType" | "success" | "statusCode";
  sortOrder?: "asc" | "desc";
}

// Sanitize sensitive data from request bodies
export function sanitizeRequestBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;

  const sanitized: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  const sensitiveFields = [
    "password",
    "oldPassword",
    "newPassword",
    "token",
    "secret",
    "clientSecret",
    "privateKey",
    "privateJwk",
    "envelope",
    "wrappedDrk",
    "kekPassphrase",
    "code_verifier",
    "authorization",
  ];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = "[REDACTED]";
    }
  }

  return sanitized;
}

// Sanitize error messages
export function sanitizeError(message: string | undefined): string | undefined {
  if (!message) return undefined;

  // Remove any potential secrets from error messages
  return message
    .replace(/Bearer [A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9]{32,}/g, "[REDACTED]");
}

// Get client IP from request
export function getClientIp(request: IncomingMessage): string {
  const xForwardedFor = request.headers["x-forwarded-for"];
  const xRealIp = request.headers["x-real-ip"];
  const cfConnectingIp = request.headers["cf-connecting-ip"];

  if (Array.isArray(xForwardedFor)) {
    return xForwardedFor[0] || "unknown";
  }

  return (
    (cfConnectingIp as string) ||
    (xRealIp as string) ||
    (xForwardedFor as string)?.split(",")[0]?.trim() ||
    request.socket?.remoteAddress ||
    "unknown"
  );
}

// Log audit event to database
export async function logAuditEvent(context: Context, event: AuditEvent): Promise<void> {
  try {
    if (!context?.db) return;
    const isUuid = (v: string | undefined) =>
      !!v &&
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
        v
      );
    const adminId = isUuid(event.adminId) ? event.adminId : null;
    await context.db.insert(auditLogs).values({
      eventType: event.eventType,
      method: event.method || "UNKNOWN",
      path: event.path || "/",
      cohort: event.cohort || null,
      userId: event.userId || null,
      adminId,
      clientId: event.clientId || null,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent || null,
      success: event.success,
      statusCode: event.statusCode || null,
      errorCode: event.errorCode || null,
      errorMessage: event.errorMessage ? sanitizeError(event.errorMessage) : null,
      resourceType: event.resourceType || null,
      resourceId: event.resourceId || null,
      action: event.action || null,
      requestBody: event.requestBody ? sanitizeRequestBody(event.requestBody) : null,
      changes: event.changes || null,
      responseTime: event.responseTime || null,
      details: event.details || null,
    });
  } catch (error) {
    context.logger.error({ error, event }, "audit log failed");
  }
}

// Query audit logs with filters
export function buildAuditLogConditions(filters: AuditFilters): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];

  if (filters.startDate) {
    conditions.push(gte(auditLogs.timestamp, filters.startDate));
  }

  if (filters.endDate) {
    conditions.push(lte(auditLogs.timestamp, filters.endDate));
  }

  if (filters.eventType) {
    conditions.push(eq(auditLogs.eventType, filters.eventType));
  }

  if (filters.userId) {
    conditions.push(eq(auditLogs.userId, filters.userId));
  }

  if (filters.adminId) {
    conditions.push(eq(auditLogs.adminId, filters.adminId));
  }

  if (filters.clientId) {
    conditions.push(eq(auditLogs.clientId, filters.clientId));
  }

  if (filters.resourceType) {
    conditions.push(eq(auditLogs.resourceType, filters.resourceType));
  }

  if (filters.resourceId) {
    conditions.push(eq(auditLogs.resourceId, filters.resourceId));
  }

  if (filters.success !== undefined) {
    conditions.push(eq(auditLogs.success, filters.success));
  }

  if (filters.search) {
    const searchCondition = or(
      ilike(auditLogs.eventType, `%${filters.search}%`),
      ilike(auditLogs.path, `%${filters.search}%`),
      ilike(auditLogs.resourceId, `%${filters.search}%`),
      ilike(auditLogs.errorMessage, `%${filters.search}%`)
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return conditions;
}

export async function queryAuditLogs(context: Context, filters: AuditFilters) {
  const conditions = buildAuditLogConditions(filters);
  const sortBy = filters.sortBy || "timestamp";
  const sortOrder = filters.sortOrder || "desc";
  const sortFn = sortOrder === "asc" ? asc : desc;
  const sortColumn =
    sortBy === "eventType"
      ? auditLogs.eventType
      : sortBy === "resourceType"
        ? auditLogs.resourceType
        : sortBy === "success"
          ? auditLogs.success
          : sortBy === "statusCode"
            ? auditLogs.statusCode
            : auditLogs.timestamp;
  const baseQuery = context.db.select().from(auditLogs);
  const filteredQuery = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
  const orderedQuery = filteredQuery.orderBy(sortFn(sortColumn), sortFn(auditLogs.id));
  const limitedQuery =
    typeof filters.limit === "number" ? orderedQuery.limit(filters.limit) : orderedQuery;
  const offsetQuery =
    typeof filters.offset === "number" ? limitedQuery.offset(filters.offset) : limitedQuery;
  return offsetQuery;
}

export async function countAuditLogs(context: Context, filters: AuditFilters) {
  const conditions = buildAuditLogConditions(filters);
  const baseQuery = context.db.select({ count: count() }).from(auditLogs);
  const filteredQuery = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
  const rows = await filteredQuery;
  return Number(rows[0]?.count ?? 0);
}

// Get audit log by ID
export async function getAuditLogById(context: Context, id: string) {
  const result = await context.db.select().from(auditLogs).where(eq(auditLogs.id, id)).limit(1);

  return result[0] || null;
}

// Export audit logs as CSV
export async function exportAuditLogs(context: Context, filters: AuditFilters): Promise<string> {
  const logs = await queryAuditLogs(context, { ...filters, limit: 10000 });

  const headers = [
    "Timestamp",
    "Event Type",
    "Method",
    "Path",
    "User ID",
    "Admin ID",
    "Client ID",
    "IP Address",
    "Success",
    "Status Code",
    "Error Code",
    "Resource Type",
    "Resource ID",
    "Response Time (ms)",
  ];

  const rows = logs.map((log) => [
    log.timestamp?.toISOString() || "",
    log.eventType || "",
    log.method || "",
    log.path || "",
    log.userId || "",
    log.adminId || "",
    log.clientId || "",
    log.ipAddress || "",
    log.success ? "true" : "false",
    log.statusCode?.toString() || "",
    log.errorCode || "",
    log.resourceType || "",
    log.resourceId || "",
    log.responseTime?.toString() || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")),
  ].join("\n");

  return csvContent;
}
