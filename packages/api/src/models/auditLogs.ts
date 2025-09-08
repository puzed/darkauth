import { count, desc, eq, and, sql, gte, lte } from "drizzle-orm";
import { auditLogs, adminUsers, users } from "../db/schema.js";
import { NotFoundError } from "../errors.js";
import type { Context } from "../types.js";

export interface AuditLogEntry {
  id: string;
  eventType: string;
  resourceType: string;
  resourceId?: string;
  actorType: "admin" | "user" | "system";
  actorId?: string;
  actorName?: string;
  actorEmail?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface AuditLogFilters {
  eventType?: string;
  resourceType?: string;
  actorType?: "admin" | "user" | "system";
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
  search?: string;
}

export interface AuditLogExportOptions {
  format: "json" | "csv";
  filters?: AuditLogFilters;
  limit?: number;
}

/**
 * Lists audit logs with pagination and filtering
 */
export async function listAuditLogs(
  context: Context,
  options: {
    page?: number;
    limit?: number;
    filters?: AuditLogFilters;
  } = {}
): Promise<{
  logs: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(1000, Math.max(1, options.limit || 50));
  const offset = (page - 1) * limit;

  // Build query conditions
  const conditions = [];

  if (options.filters?.eventType) {
    conditions.push(eq(auditLogs.eventType, options.filters.eventType));
  }

  if (options.filters?.resourceType) {
    conditions.push(eq(auditLogs.resourceType, options.filters.resourceType));
  }

  if (options.filters?.actorType) {
    conditions.push(eq(auditLogs.actorType, options.filters.actorType));
  }

  if (options.filters?.actorId) {
    conditions.push(eq(auditLogs.actorId, options.filters.actorId));
  }

  if (options.filters?.startDate) {
    conditions.push(gte(auditLogs.timestamp, options.filters.startDate));
  }

  if (options.filters?.endDate) {
    conditions.push(lte(auditLogs.timestamp, options.filters.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Query with joins to get actor information
  const logsQuery = context.db
    .select({
      id: auditLogs.id,
      eventType: auditLogs.eventType,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      actorType: auditLogs.actorType,
      actorId: auditLogs.actorId,
      details: auditLogs.details,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      timestamp: auditLogs.timestamp,
      adminName: adminUsers.name,
      adminEmail: adminUsers.email,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(adminUsers, eq(auditLogs.actorId, adminUsers.id))
    .leftJoin(users, eq(auditLogs.actorId, users.sub))
    .where(whereClause)
    .orderBy(desc(auditLogs.timestamp))
    .limit(limit)
    .offset(offset);

  const results = await logsQuery;

  // Get total count
  const countQuery = await context.db
    .select({ count: count() })
    .from(auditLogs)
    .where(whereClause);

  const total = countQuery[0]?.count || 0;
  const totalPages = Math.ceil(total / limit);

  // Transform results to include actor information
  const logs: AuditLogEntry[] = results.map(row => ({
    id: row.id,
    eventType: row.eventType,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actorType: row.actorType,
    actorId: row.actorId,
    actorName: row.actorType === "admin" ? row.adminName : 
               row.actorType === "user" ? row.userName : undefined,
    actorEmail: row.actorType === "admin" ? row.adminEmail : 
                row.actorType === "user" ? row.userEmail : undefined,
    details: row.details,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    timestamp: row.timestamp,
  }));

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Gets a single audit log entry by ID
 */
export async function getAuditLogById(context: Context, logId: string): Promise<AuditLogEntry> {
  const result = await context.db
    .select({
      id: auditLogs.id,
      eventType: auditLogs.eventType,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      actorType: auditLogs.actorType,
      actorId: auditLogs.actorId,
      details: auditLogs.details,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      timestamp: auditLogs.timestamp,
      adminName: adminUsers.name,
      adminEmail: adminUsers.email,
      userName: users.name,
      userEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(adminUsers, eq(auditLogs.actorId, adminUsers.id))
    .leftJoin(users, eq(auditLogs.actorId, users.sub))
    .where(eq(auditLogs.id, logId))
    .limit(1);

  if (!result[0]) {
    throw new NotFoundError("Audit log entry not found");
  }

  const row = result[0];

  return {
    id: row.id,
    eventType: row.eventType,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    actorType: row.actorType,
    actorId: row.actorId,
    actorName: row.actorType === "admin" ? row.adminName : 
               row.actorType === "user" ? row.userName : undefined,
    actorEmail: row.actorType === "admin" ? row.adminEmail : 
                row.actorType === "user" ? row.userEmail : undefined,
    details: row.details,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    timestamp: row.timestamp,
  };
}

/**
 * Exports audit logs in specified format
 */
export async function exportAuditLogs(
  context: Context,
  options: AuditLogExportOptions
): Promise<{ data: string; filename: string; mimeType: string }> {
  const limit = Math.min(50000, options.limit || 10000); // Reasonable export limit

  // Get logs without pagination
  const { logs } = await listAuditLogs(context, {
    limit,
    filters: options.filters,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  
  if (options.format === "csv") {
    // Generate CSV
    const headers = [
      "ID",
      "Event Type",
      "Resource Type", 
      "Resource ID",
      "Actor Type",
      "Actor ID",
      "Actor Name",
      "Actor Email",
      "IP Address",
      "User Agent",
      "Timestamp",
      "Details"
    ];

    const csvRows = [
      headers.join(","),
      ...logs.map(log => [
        log.id,
        log.eventType,
        log.resourceType,
        log.resourceId || "",
        log.actorType,
        log.actorId || "",
        log.actorName || "",
        log.actorEmail || "",
        log.ipAddress || "",
        log.userAgent || "",
        log.timestamp.toISOString(),
        JSON.stringify(log.details || {}).replace(/"/g, '""')
      ].map(field => `"${field}"`).join(","))
    ];

    return {
      data: csvRows.join("\n"),
      filename: `audit-logs-${timestamp}.csv`,
      mimeType: "text/csv",
    };
  } else {
    // Generate JSON
    return {
      data: JSON.stringify({
        exportedAt: new Date().toISOString(),
        totalRecords: logs.length,
        filters: options.filters || {},
        logs,
      }, null, 2),
      filename: `audit-logs-${timestamp}.json`,
      mimeType: "application/json",
    };
  }
}

/**
 * Gets audit log statistics
 */
export async function getAuditLogStats(
  context: Context,
  filters?: AuditLogFilters
): Promise<{
  totalLogs: number;
  eventTypeCounts: Record<string, number>;
  resourceTypeCounts: Record<string, number>;
  actorTypeCounts: Record<string, number>;
  recentActivity: AuditLogEntry[];
}> {
  const conditions = [];

  if (filters?.startDate) {
    conditions.push(gte(auditLogs.timestamp, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(auditLogs.timestamp, filters.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const totalResult = await context.db
    .select({ count: count() })
    .from(auditLogs)
    .where(whereClause);

  const totalLogs = totalResult[0]?.count || 0;

  // Get event type counts
  const eventTypeResults = await context.db
    .select({
      eventType: auditLogs.eventType,
      count: count(),
    })
    .from(auditLogs)
    .where(whereClause)
    .groupBy(auditLogs.eventType)
    .orderBy(desc(count()));

  const eventTypeCounts = eventTypeResults.reduce((acc, row) => {
    acc[row.eventType] = row.count;
    return acc;
  }, {} as Record<string, number>);

  // Get resource type counts
  const resourceTypeResults = await context.db
    .select({
      resourceType: auditLogs.resourceType,
      count: count(),
    })
    .from(auditLogs)
    .where(whereClause)
    .groupBy(auditLogs.resourceType)
    .orderBy(desc(count()));

  const resourceTypeCounts = resourceTypeResults.reduce((acc, row) => {
    acc[row.resourceType] = row.count;
    return acc;
  }, {} as Record<string, number>);

  // Get actor type counts  
  const actorTypeResults = await context.db
    .select({
      actorType: auditLogs.actorType,
      count: count(),
    })
    .from(auditLogs)
    .where(whereClause)
    .groupBy(auditLogs.actorType)
    .orderBy(desc(count()));

  const actorTypeCounts = actorTypeResults.reduce((acc, row) => {
    acc[row.actorType] = row.count;
    return acc;
  }, {} as Record<string, number>);

  // Get recent activity (last 10 entries)
  const { logs: recentActivity } = await listAuditLogs(context, {
    limit: 10,
    filters,
  });

  return {
    totalLogs,
    eventTypeCounts,
    resourceTypeCounts,
    actorTypeCounts,
    recentActivity,
  };
}