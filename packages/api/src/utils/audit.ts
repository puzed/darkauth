import type { IncomingMessage } from "node:http";
import type { Context } from "../types.js";

export interface AuditEvent {
  timestamp: Date;
  eventType: string;
  userId?: string;
  adminId?: string;
  clientId?: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  errorCode?: string;
  details?: Record<string, unknown>;
}

export class AuditLogger {
  private context: Context;

  constructor(context: Context) {
    this.context = context;
  }

  async log(event: Omit<AuditEvent, "timestamp">): Promise<void> {
    const auditEvent: AuditEvent = {
      timestamp: new Date(),
      ...event,
    };

    // Log to console (in production, send to proper logging service)
    console.log("[AUDIT]", JSON.stringify(auditEvent));

    // In production, you might:
    // 1. Store in audit database table
    // 2. Send to external logging service (e.g., Splunk, ELK)
    // 3. Send to SIEM for security monitoring

    if (!this.context.config.isDevelopment) {
      // Production audit logging would go here
      await this.storeAuditEvent(auditEvent);
    }
  }

  private async storeAuditEvent(_event: AuditEvent): Promise<void> {}

  // Helper methods for common audit events
  async logAuthSuccess(
    userId: string,
    request: IncomingMessage,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: "AUTH_SUCCESS",
      userId,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers["user-agent"],
      success: true,
      details,
    });
  }

  async logAuthFailure(
    userId: string | undefined,
    request: IncomingMessage,
    errorCode: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: "AUTH_FAILURE",
      userId,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers["user-agent"],
      success: false,
      errorCode,
      details,
    });
  }

  async logTokenIssue(
    userId: string,
    clientId: string,
    request: IncomingMessage,
    hasZk: boolean
  ): Promise<void> {
    await this.log({
      eventType: "TOKEN_ISSUED",
      userId,
      clientId,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers["user-agent"],
      success: true,
      details: { hasZk },
    });
  }

  async logAdminAction(
    adminId: string,
    action: string,
    request: IncomingMessage,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: "ADMIN_ACTION",
      adminId,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers["user-agent"],
      success,
      details: { action, ...details },
    });
  }

  async logRateLimitHit(request: IncomingMessage, limit: number, remaining: number): Promise<void> {
    await this.log({
      eventType: "RATE_LIMIT_HIT",
      ipAddress: this.getClientIp(request),
      userAgent: request.headers["user-agent"],
      success: false,
      errorCode: "RATE_LIMITED",
      details: { limit, remaining },
    });
  }

  async logSecurityEvent(
    eventType: string,
    request: IncomingMessage,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: `SECURITY_${eventType}`,
      ipAddress: this.getClientIp(request),
      userAgent: request.headers["user-agent"],
      success: false,
      details,
    });
  }

  async logInstallEvent(
    action: string,
    request: IncomingMessage,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      eventType: "INSTALL_EVENT",
      ipAddress: this.getClientIp(request),
      userAgent: request.headers["user-agent"],
      success,
      details: { action, ...details },
    });
  }

  private getClientIp(request: IncomingMessage): string {
    // Handle various proxy headers
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
      request.socket.remoteAddress ||
      "unknown"
    );
  }
}

// Create global audit logger instance
export function createAuditLogger(context: Context): AuditLogger {
  return new AuditLogger(context);
}
