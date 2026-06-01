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
  organizationId?: string;
  enterpriseConnectionId?: string;
  enterpriseConnectionType?: string;
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
  organizationId?: string;
  enterpriseConnectionId?: string;
  enterpriseConnectionType?: string;
  resourceType?: string;
  resourceId?: string;
  success?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "timestamp" | "eventType" | "resourceType" | "success" | "statusCode";
  sortOrder?: "asc" | "desc";
}

const redacted = "[REDACTED]";

const sensitiveFieldNames = new Set([
  "accesskey",
  "accesstoken",
  "adminsession",
  "apikey",
  "authorization",
  "authorizationcode",
  "bearer",
  "clientsecret",
  "code",
  "codeverifier",
  "credential",
  "drk",
  "drkjwe",
  "envelope",
  "exportkey",
  "exportkeyhash",
  "finish",
  "idtoken",
  "kek",
  "kekpassphrase",
  "message",
  "newpassword",
  "oldpassword",
  "opaquepayload",
  "opaquerecord",
  "password",
  "passphrase",
  "pkce",
  "privatejwk",
  "privatekey",
  "record",
  "refreshtoken",
  "request",
  "rootkey",
  "secret",
  "session",
  "sessionid",
  "sessionkey",
  "sessiontoken",
  "token",
  "wrappeddrk",
  "wrappedencprivatejwk",
  "zkpub",
]);

const sensitiveFieldPattern =
  /^(?:(?:.*)(?:password|passphrase|secret|token|privatekey|privatejwk|sessionkey|sessiontoken)|accesskey|adminsession|authorization|authorizationcode|bearer|clientsecret|code|codeverifier|credential|drk|drkhash|drkjwe|envelope|exportkey|exportkeyhash|finish|kek|message|opaquepayload|opaquerecord|pkce|record|request|rootkey|session|sessionid|wrappeddrk|wrappedencprivatejwk|zkpub)$/;

const stringSensitiveFieldPattern =
  "(?:access[_-]?key|access[_-]?token|admin[_-]?session|api[_-]?key|authorization|authorization[_-]?code|bearer|client[_-]?secret|code|code[_-]?verifier|credential|drk|drk[_-]?hash|drk[_-]?jwe|envelope|export[_-]?key|export[_-]?key[_-]?hash|finish|id[_-]?token|kek|kek[_-]?passphrase|message|new[_-]?password|old[_-]?password|opaque[_-]?payload|opaque[_-]?record|password|passphrase|pkce|private[_-]?jwk|private[_-]?key|record|refresh[_-]?token|request|root[_-]?key|secret|session|session[_-]?id|session[_-]?key|session[_-]?token|token|wrapped[_-]?drk|wrapped[_-]?enc[_-]?private[_-]?jwk|zk[_-]?pub)";

function normalizeAuditFieldName(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isSensitiveAuditField(field: string): boolean {
  const normalized = normalizeAuditFieldName(field);
  return sensitiveFieldNames.has(normalized) || sensitiveFieldPattern.test(normalized);
}

function appendFormValue(target: Record<string, unknown>, key: string, value: string): void {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    target[key] = [existing, value];
  }
}

function parseFormEncodedBody(body: string): Record<string, unknown> | null {
  if (!body.includes("=")) return null;
  if (/\s/.test(body)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(body)) return null;
  const params = new URLSearchParams(body);
  const parsed: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    if (!key) continue;
    appendFormValue(parsed, key, value);
  }
  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function parseAuditRequestBody(body: string): unknown {
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {}
  return parseFormEncodedBody(trimmed) || { raw: trimmed };
}

function sanitizeAuditString(value: string, redactLongTokens: boolean): string {
  let sanitized = value
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, `Bearer ${redacted}`)
    .replace(
      new RegExp(`(${stringSensitiveFieldPattern})(\\s*[=:]\\s*)(["']?)[^"',&\\s}]+`, "gi"),
      (_match, key: string, separator: string, quote: string) =>
        `${key}${separator}${quote}${redacted}`
    )
    .replace(
      new RegExp(`(["'])(${stringSensitiveFieldPattern})(\\1\\s*:\\s*)(["'])[^"']*(\\4)`, "gi"),
      (_match, keyQuote: string, key: string, middle: string, valueQuote: string) =>
        `${keyQuote}${key}${middle}${valueQuote}${redacted}${valueQuote}`
    );
  const parsedForm = parseFormEncodedBody(sanitized);
  if (parsedForm) {
    const params = new URLSearchParams();
    const sanitizedForm = sanitizeAuditValue(parsedForm) as Record<string, unknown>;
    for (const [key, value] of Object.entries(sanitizedForm)) {
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, String(item));
      } else {
        params.append(key, String(value));
      }
    }
    sanitized = params.toString();
  }
  if (redactLongTokens) {
    sanitized = sanitized
      .replace(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, redacted)
      .replace(/[A-Za-z0-9+/=_-]{32,}/g, redacted);
  }
  return sanitized;
}

function sanitizeAuditValue(
  value: unknown,
  fieldName?: string,
  seen = new WeakSet<object>()
): unknown {
  if (fieldName && isSensitiveAuditField(fieldName)) return redacted;
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return sanitizeAuditString(value, false);
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return redacted;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item, undefined, seen));
  }
  if (value instanceof Date) return value.toISOString();
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return redacted;
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "raw" && typeof item === "string") {
      const parsed = parseAuditRequestBody(item);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !("raw" in parsed)) {
        Object.assign(
          sanitized,
          sanitizeAuditValue(parsed, undefined, seen) as Record<string, unknown>
        );
      } else {
        sanitized[key] = redacted;
      }
    } else {
      sanitized[key] = sanitizeAuditValue(item, key, seen);
    }
  }
  return sanitized;
}

function sanitizeAuditRecord(
  record: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!record) return null;
  const sanitized = sanitizeAuditValue(record);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : null;
}

export function sanitizeAuditDetails(
  details: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  return sanitizeAuditRecord(details);
}

export function sanitizeAuditPath(path: string | undefined): string {
  if (!path) return "/";
  try {
    const url = new URL(path, "http://audit.local");
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveAuditField(key)) {
        url.searchParams.set(key, redacted);
      }
    }
    const query = url.searchParams.toString();
    let hash = url.hash;
    if (hash.includes("=")) {
      const hashParams = new URLSearchParams(hash.slice(1));
      for (const key of [...hashParams.keys()]) {
        if (isSensitiveAuditField(key)) {
          hashParams.set(key, redacted);
        }
      }
      hash = `#${hashParams.toString()}`;
    } else {
      hash = sanitizeAuditString(hash, true);
    }
    return `${url.pathname}${query ? `?${query}` : ""}${hash}`;
  } catch {
    return sanitizeAuditString(path, true);
  }
}

export function sanitizeLoggedError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeError(error.message),
      stack: sanitizeError(error.stack),
    };
  }
  return sanitizeAuditValue(error);
}

function sanitizeAuditEventForLog(event: AuditEvent): Record<string, unknown> {
  return {
    ...event,
    path: sanitizeAuditPath(event.path),
    userAgent: sanitizeError(event.userAgent),
    resourceId: event.resourceId ? redacted : undefined,
    errorMessage: sanitizeError(event.errorMessage),
    requestBody: sanitizeAuditRecord(event.requestBody),
    changes: sanitizeAuditRecord(event.changes),
    details: sanitizeAuditRecord(event.details),
  };
}

export function sanitizeRequestBody(body: unknown): Record<string, unknown> | null {
  const parsed = typeof body === "string" ? parseAuditRequestBody(body) : body;
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed)) return { value: sanitizeAuditValue(parsed) };
  return sanitizeAuditRecord(parsed as Record<string, unknown>);
}

export function sanitizeError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  return sanitizeAuditString(message, true);
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
      path: sanitizeAuditPath(event.path),
      cohort: event.cohort || null,
      userId: event.userId || null,
      adminId,
      clientId: event.clientId || null,
      organizationId: isUuid(event.organizationId) ? event.organizationId : null,
      enterpriseConnectionId: isUuid(event.enterpriseConnectionId)
        ? event.enterpriseConnectionId
        : null,
      enterpriseConnectionType: event.enterpriseConnectionType || null,
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
      changes: sanitizeAuditRecord(event.changes),
      responseTime: event.responseTime || null,
      details: sanitizeAuditRecord(event.details),
    });
  } catch (error) {
    context.logger.error(
      { error: sanitizeLoggedError(error), event: sanitizeAuditEventForLog(event) },
      "audit log failed"
    );
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

  if (filters.organizationId) {
    conditions.push(eq(auditLogs.organizationId, filters.organizationId));
  }

  if (filters.enterpriseConnectionId) {
    conditions.push(eq(auditLogs.enterpriseConnectionId, filters.enterpriseConnectionId));
  }

  if (filters.enterpriseConnectionType) {
    conditions.push(eq(auditLogs.enterpriseConnectionType, filters.enterpriseConnectionType));
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
