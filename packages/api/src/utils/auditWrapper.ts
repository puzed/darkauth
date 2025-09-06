import type { IncomingMessage, ServerResponse } from "node:http";
import { getClientIp, logAuditEvent, sanitizeRequestBody } from "../services/audit.js";
import {
  getActorFromRefreshToken,
  getActorFromSessionId,
  getSession,
  getSessionId,
} from "../services/sessions.js";
import type { Context, ControllerFunction } from "../types.js";

interface AuditConfig {
  eventType: string;
  resourceType?: string;
  extractResourceId?: (body: unknown, params: string[]) => string | undefined;
  skipBodyCapture?: boolean;
}

// Determine cohort based on path
function determineCohort(path: string): string | undefined {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/install")) return "install";
  return "user";
}

// Map HTTP method to action
function mapMethodToAction(method: string): string {
  switch (method) {
    case "POST":
      return "create";
    case "PUT":
      return "update";
    case "DELETE":
      return "delete";
    case "GET":
      return "read";
    default:
      return method.toLowerCase();
  }
}

// Extract additional details from request
function extractDetails(request: IncomingMessage): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  // Add query parameters if present
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  if (url.search) {
    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      // Don't include sensitive params
      if (!["token", "code", "code_verifier"].includes(key)) {
        params[key] = value;
      }
    });
    if (Object.keys(params).length > 0) {
      details.queryParams = params;
    }
  }

  // Add content type
  if (request.headers["content-type"]) {
    details.contentType = request.headers["content-type"];
  }

  // Add origin if present
  if (request.headers.origin) {
    details.origin = request.headers.origin;
  }

  // Add referer if present
  if (request.headers.referer) {
    details.referer = request.headers.referer;
  }

  return Object.keys(details).length > 0 ? details : undefined;
}

// Create a wrapper that adds audit logging to any controller
export function withAudit(config: AuditConfig | string) {
  const auditConfig: AuditConfig = typeof config === "string" ? { eventType: config } : config;

  return (handler: ControllerFunction): ControllerFunction =>
    async function auditWrappedHandler(
      context: Context,
      request: IncomingMessage,
      response: ServerResponse,
      ...params: string[]
    ): Promise<void> {
      const startTime = Date.now();
      let requestBody: unknown = null;
      let resourceId: string | undefined;
      let success = false;
      let statusCode = 500;
      let errorCode: string | undefined;
      let errorMessage: string | undefined;
      let userId: string | undefined;
      let adminId: string | undefined;

      // Store original end function
      const originalEnd = response.end;
      const originalWrite = response.write;
      let responseData: unknown;

      // Capture response data without introducing explicit any
      response.write = function (chunk: unknown, encodingOrCb?: unknown, cb?: unknown): boolean {
        const args = [chunk, encodingOrCb, cb].filter((x) => x !== undefined) as unknown[];
        const [first] = args;
        if (first) {
          try {
            const str = (first as unknown as Buffer | string).toString();
            responseData = JSON.parse(str);
          } catch {
            // Not JSON, ignore
          }
        }
        return (originalWrite as unknown as (...a: unknown[]) => boolean).apply(this, args);
      };

      response.end = function (
        chunk?: unknown,
        encodingOrCb?: unknown,
        cb?: unknown
      ): ServerResponse {
        const args = [chunk, encodingOrCb, cb].filter((x) => x !== undefined) as unknown[];
        const [first] = args;
        if (first) {
          try {
            const str = (first as unknown as Buffer | string).toString();
            responseData = JSON.parse(str);
          } catch {
            // Not JSON, ignore
          }
        }
        return (originalEnd as unknown as (...a: unknown[]) => ServerResponse).apply(this, args);
      };

      try {
        // Capture request body if it's a mutation and not skipped
        if (
          ["POST", "PUT", "DELETE", "PATCH"].includes(request.method || "") &&
          !auditConfig.skipBodyCapture
        ) {
          const { getCachedBody } = await import("../middleware/rateLimit.js");
          const body = await getCachedBody(request);
          const reqWithRaw = request as IncomingMessage & { rawBody?: string };
          reqWithRaw.rawBody = body;
          try {
            requestBody = body ? JSON.parse(body) : null;
          } catch {
            requestBody = { raw: body };
          }
        }

        // Try to get session info from Authorization header
        try {
          const urlPath = request.url || "/";
          const isAdmin = urlPath.startsWith("/admin/") || urlPath.startsWith("/api/admin/");
          const sid = getSessionId(request, isAdmin);
          if (sid) {
            const session = await getSession(context, sid);
            if (session) {
              userId = session.sub || undefined;
              adminId = session.adminId;
            }
          }
        } catch {
          // Session not required for all endpoints
        }

        // Execute the actual handler
        await handler(context, request, response, ...params);

        // Capture success metrics after handler completes
        success = response.statusCode < 400;
        statusCode = response.statusCode;

        // Extract resource ID if configured
        if (auditConfig.extractResourceId) {
          resourceId = auditConfig.extractResourceId(
            (requestBody ?? responseData) as unknown,
            params
          );
        }

        // Check for errors in response
        if (responseData && typeof responseData === "object" && "error" in responseData) {
          const rd = responseData as { code?: string; error?: string };
          errorCode = rd.code;
          errorMessage = rd.error;
        }
      } catch (error) {
        success = false;
        const err = error as { code?: string; message?: string };
        errorCode = err.code || "INTERNAL_ERROR";
        errorMessage = err.message;
        statusCode = response.statusCode || 500;
        throw error;
      } finally {
        // Log audit event (non-blocking)
        const cohort = determineCohort(request.url || "/");

        if (!adminId && cohort === "admin") {
          let fromResponse: string | undefined;
          if (responseData && typeof responseData === "object") {
            const obj = responseData as Record<string, unknown>;
            if (typeof (obj as { adminId?: unknown }).adminId === "string") {
              fromResponse = (obj as { adminId?: string }).adminId as string;
            } else if (
              (obj as { admin?: unknown }).admin &&
              typeof (obj as { admin?: unknown }).admin === "object"
            ) {
              const adminObj = (obj as { admin?: Record<string, unknown> }).admin as Record<
                string,
                unknown
              >;
              if (typeof adminObj.id === "string") fromResponse = adminObj.id;
            }
          }
          const fromResource = auditConfig.resourceType === "admin" ? resourceId : undefined;
          adminId = fromResponse || fromResource;
        }

        if (!userId && cohort === "user") {
          let fromResponse: string | undefined;
          if (responseData && typeof responseData === "object") {
            const obj = responseData as Record<string, unknown> & { sub?: unknown; user?: unknown };
            if (typeof obj.sub === "string") {
              fromResponse = obj.sub as string;
            } else if (obj.user && typeof obj.user === "object") {
              const userObj = obj.user as Record<string, unknown> & { sub?: unknown };
              if (typeof userObj.sub === "string") fromResponse = userObj.sub as string;
            }
          }
          const fromResource = auditConfig.resourceType === "user" ? resourceId : undefined;
          userId = fromResponse || fromResource;
        }

        if ((cohort === "admin" && !adminId) || (cohort === "user" && !userId)) {
          let rt: string | undefined;
          if (requestBody && typeof requestBody === "object") {
            const b = requestBody as Record<string, unknown> & { refreshToken?: unknown };
            if (typeof b.refreshToken === "string")
              rt = (b as { refreshToken?: string }).refreshToken as string;
          }
          if (rt) {
            const actor = await getActorFromRefreshToken(context, rt);
            if (actor) {
              adminId = adminId || actor.adminId || undefined;
              userId = userId || actor.userSub || undefined;
            }
          }
        }

        if ((cohort === "admin" && !adminId) || (cohort === "user" && !userId)) {
          let sid: string | undefined;
          if (responseData && typeof responseData === "object") {
            const obj = responseData as Record<string, unknown> & { sessionId?: unknown };
            if (typeof obj.sessionId === "string") sid = obj.sessionId as string;
          }
          if (sid) {
            const actor = await getActorFromSessionId(context, sid);
            if (actor) {
              adminId = adminId || actor.adminId || undefined;
              userId = userId || actor.userSub || undefined;
            }
          }
        }

        logAuditEvent(context, {
          eventType: auditConfig.eventType,
          method: request.method || "UNKNOWN",
          path: request.url || "/",
          cohort,
          userId,
          adminId,
          clientId: (() => {
            if (!requestBody || typeof requestBody !== "object") return undefined;
            const rbRec = requestBody as Record<string, unknown> & {
              client_id?: unknown;
              clientId?: unknown;
            };
            if (typeof rbRec.client_id === "string") return rbRec.client_id as string;
            if (typeof rbRec.clientId === "string") return rbRec.clientId as string;
            return undefined;
          })(),
          ipAddress: getClientIp(request),
          userAgent: (() => {
            const u = request.headers["user-agent"];
            if (Array.isArray(u)) return u[0];
            return typeof u === "string" ? u : undefined;
          })(),
          success,
          statusCode,
          errorCode,
          errorMessage,
          resourceType: auditConfig.resourceType,
          resourceId,
          action: mapMethodToAction(request.method || ""),
          requestBody: requestBody ? sanitizeRequestBody(requestBody) || undefined : undefined,
          responseTime: Date.now() - startTime,
          details: extractDetails(request),
        }).catch((err) => {
          // Don't fail the request if audit logging fails
          console.error("Audit log failed:", err);
        });
      }
    };
}
