import { inArray } from "drizzle-orm";
import { adminUsers, users } from "../db/schema.js";
import {
  countAuditLogs as countAuditLogsAggregate,
  exportAuditLogs,
  getAuditLogById,
  queryAuditLogs,
} from "../services/audit.js";
import type { Context } from "../types.js";

export interface AuditLogFilters {
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

export async function attachActorInfo(
  context: Context,
  logs: Array<{
    id: string;
    timestamp: string | Date;
    eventType: string;
    userId?: string | null;
    adminId?: string | null;
    clientId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    success?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  }>
) {
  const adminIds = Array.from(
    new Set(logs.map((log) => log.adminId).filter((v): v is string => Boolean(v)))
  );
  const userIds = Array.from(
    new Set(logs.map((log) => log.userId).filter((v): v is string => Boolean(v)))
  );
  const adminMap = new Map<string, { email: string; name: string }>();
  const userMap = new Map<string, { email: string | null; name: string | null }>();
  if (adminIds.length > 0) {
    const rows = await context.db
      .select({ id: adminUsers.id, email: adminUsers.email, name: adminUsers.name })
      .from(adminUsers)
      .where(inArray(adminUsers.id, adminIds));
    for (const admin of rows) adminMap.set(admin.id, { email: admin.email, name: admin.name });
  }
  if (userIds.length > 0) {
    const rows = await context.db
      .select({ sub: users.sub, email: users.email, name: users.name })
      .from(users)
      .where(inArray(users.sub, userIds));
    for (const user of rows)
      userMap.set(user.sub, { email: user.email || null, name: user.name || null });
  }
  return logs.map((log) => {
    const isAdmin = Boolean(log.adminId);
    const actor = isAdmin
      ? log.adminId && adminMap.get(log.adminId)
      : log.userId && userMap.get(log.userId);
    const actorEmail = actor ? ("email" in actor ? actor.email : null) : null;
    const actorName = actor ? ("name" in actor ? actor.name : null) : null;
    const actorType = isAdmin ? "Admin" : log.userId ? "User" : "System";
    const actorId = actorEmail || (isAdmin ? log.adminId || null : log.userId || null) || "system";
    return {
      ...log,
      timestamp: new Date(log.timestamp as unknown as Date).toISOString(),
      actorType,
      actorId,
      actorEmail: actorEmail || undefined,
      actorName: actorName || undefined,
      resource: log.resourceType || undefined,
    };
  });
}

export async function listAuditLogs(context: Context, filters: AuditLogFilters) {
  return await queryAuditLogs(context, filters);
}

export async function countAuditLogs(context: Context, filters: AuditLogFilters) {
  return await countAuditLogsAggregate(context, {
    ...filters,
    limit: undefined,
    offset: undefined,
  });
}

export async function getAuditLogWithActor(context: Context, id: string) {
  const auditLog = await getAuditLogById(context, id);
  if (!auditLog) return null;
  type BaseLog = {
    id: string;
    timestamp: string | Date;
    eventType: string;
    userId?: string | null;
    adminId?: string | null;
    clientId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    success?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  const [enriched] = await attachActorInfo(context, [auditLog as BaseLog]);
  return enriched;
}

export async function exportAuditLogsCsv(context: Context, filters: AuditLogFilters) {
  return await exportAuditLogs(context, filters);
}
