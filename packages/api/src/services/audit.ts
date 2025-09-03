import type { IncomingMessage } from "node:http";
import { and, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { auditLogs } from "../db/schema.js";
import type { Context } from "../types.js";

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
    // Don't fail the request if audit logging fails
    console.error("Failed to log audit event:", error);
    console.error("Event was:", JSON.stringify(event, null, 2));
  }
}

// Query audit logs with filters
export async function queryAuditLogs(context: Context, filters: AuditFilters) {
  const conditions = [];

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
    conditions.push(
      or(
        ilike(auditLogs.eventType, `%${filters.search}%`),
        ilike(auditLogs.path, `%${filters.search}%`),
        ilike(auditLogs.resourceId, `%${filters.search}%`),
        ilike(auditLogs.errorMessage, `%${filters.search}%`)
      )
    );
  }

  const query = context.db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.timestamp))
    .limit(filters.limit || 100)
    .offset(filters.offset || 0);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }

  return query;
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
